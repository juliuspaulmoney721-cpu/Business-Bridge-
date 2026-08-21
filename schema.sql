-- PIXORA — SAFE DATABASE REPAIR / MIGRATION
-- Run this ONCE in the Supabase SQL Editor.
-- It keeps existing data and fixes the old schema/policy problems.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. PROFILES
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  username text unique,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,name,username,avatar_url,bio)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1), 'Pixora User'),
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email,''),'@',1), 'pixorauser'),
    coalesce(new.raw_user_meta_data->>'avatar_url',''),
    coalesce(new.raw_user_meta_data->>'bio','')
  )
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- 2. POSTS — MIGRATE OLD user_id TO author_id
-- =========================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  content text,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists author_id uuid;
alter table public.posts add column if not exists content text;
alter table public.posts add column if not exists image_url text;
alter table public.posts add column if not exists created_at timestamptz default now();

-- Older Pixora builds used posts.user_id. If it still exists, move its values.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='posts' and column_name='user_id'
  ) then
    execute 'update public.posts p set author_id = p.user_id where p.author_id is null and p.user_id is not null';
    execute 'alter table public.posts drop column user_id';
  end if;
end $$;

-- Remove old author foreign keys so the relationship can be recreated cleanly.
do $$
declare r record;
begin
  for r in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name
     and ccu.table_schema=tc.table_schema
    where tc.table_schema='public'
      and tc.table_name='posts'
      and tc.constraint_type='FOREIGN KEY'
      and ccu.column_name='author_id'
  loop
    execute format('alter table public.posts drop constraint if exists %I', r.constraint_name);
  end loop;
end $$;

-- Existing bad/orphaned rows must not prevent the correct FK from being created.
update public.posts p
set author_id = null
where author_id is not null
  and not exists (select 1 from public.profiles pr where pr.id=p.author_id);

alter table public.posts
  add constraint posts_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

-- =========================================================
-- 3. FOLLOWS
-- =========================================================
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(follower_id, following_id)
);

-- =========================================================
-- 4. MESSAGING TABLES
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(conversation_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- =========================================================
-- 5. NOTIFICATIONS
-- =========================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  message text,
  post_id uuid references public.posts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 6. NOTIFICATION TRIGGERS
-- =========================================================
create or replace function public.create_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare follower_name text;
begin
  select coalesce(name,username,'Someone') into follower_name
  from public.profiles where id=new.follower_id;

  insert into public.notifications(user_id,actor_id,type,title,message)
  values(new.following_id,new.follower_id,'follow','New follower',follower_name || ' started following you.');
  return new;
end;
$$;

drop trigger if exists follow_notification_trigger on public.follows;
create trigger follow_notification_trigger
after insert on public.follows
for each row execute function public.create_follow_notification();

create or replace function public.create_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare receiver_id uuid; sender_name text;
begin
  select cm.user_id into receiver_id
  from public.conversation_members cm
  where cm.conversation_id=new.conversation_id
    and cm.user_id<>new.sender_id
  limit 1;

  select coalesce(name,username,'Someone') into sender_name
  from public.profiles where id=new.sender_id;

  if receiver_id is not null then
    insert into public.notifications(user_id,actor_id,type,title,message,conversation_id)
    values(receiver_id,new.sender_id,'message','New message',sender_name || ' sent you a message.',new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists message_notification_trigger on public.messages;
create trigger message_notification_trigger
after insert on public.messages
for each row execute function public.create_message_notification();

-- =========================================================
-- 7. STORAGE
-- =========================================================
insert into storage.buckets(id,name,public)
values('posts','posts',true)
on conflict(id) do update set public=true;

drop policy if exists "Anyone can view post images" on storage.objects;
drop policy if exists "Authenticated users can upload post images" on storage.objects;
drop policy if exists "Users can update their post images" on storage.objects;
drop policy if exists "Users can delete their post images" on storage.objects;

create policy "Anyone can view post images"
on storage.objects for select
using(bucket_id='posts');

create policy "Authenticated users can upload post images"
on storage.objects for insert to authenticated
with check(bucket_id='posts');

create policy "Users can update their post images"
on storage.objects for update to authenticated
using(bucket_id='posts' and owner_id=auth.uid()::text);

create policy "Users can delete their post images"
on storage.objects for delete to authenticated
using(bucket_id='posts' and owner_id=auth.uid()::text);

-- =========================================================
-- 8. RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Remove every old policy on these tables. This prevents old Pixora policies
-- from surviving under different names.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('profiles','posts','follows','conversations','conversation_members','messages','notifications')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- =========================================================
-- 9. SAFE MEMBERSHIP CHECK — NO RLS RECURSION
-- =========================================================
create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id=p_conversation_id
      and user_id=p_user_id
  );
$$;

revoke all on function public.is_conversation_member(uuid,uuid) from public;
grant execute on function public.is_conversation_member(uuid,uuid) to authenticated;

-- Client code never needs to query every conversation member directly.
-- These SECURITY DEFINER RPCs read the membership table with RLS bypassed,
-- which completely removes the self-referencing policy path that caused
-- the old "infinite recursion detected in policy for conversation_members" error.
create or replace function public.get_my_conversation_members(p_user_id uuid)
returns table(conversation_id uuid, user_id uuid)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select cm.conversation_id, cm.user_id
  from public.conversation_members cm
  where cm.conversation_id in (
    select mine.conversation_id
    from public.conversation_members mine
    where mine.user_id = p_user_id
  );
$$;

revoke all on function public.get_my_conversation_members(uuid) from public;
grant execute on function public.get_my_conversation_members(uuid) to authenticated;

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = me then
    raise exception 'Invalid conversation recipient';
  end if;

  select c.id into existing_id
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = me
  join public.conversation_members other
    on other.conversation_id = c.id and other.user_id = p_other_user_id
  where (
    select count(*)
    from public.conversation_members all_members
    where all_members.conversation_id = c.id
  ) = 2
  order by c.created_at
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations default values returning id into new_id;
  insert into public.conversation_members(conversation_id,user_id)
  values (new_id,me),(new_id,p_other_user_id);
  return new_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- =========================================================
-- 10. PROFILE POLICIES
-- =========================================================
create policy "Profiles are publicly readable"
on public.profiles for select
using(true);

create policy "Users can insert own profile"
on public.profiles for insert to authenticated
with check(id=auth.uid());

create policy "Users can update own profile"
on public.profiles for update to authenticated
using(id=auth.uid()) with check(id=auth.uid());

-- =========================================================
-- 11. POST POLICIES
-- =========================================================
create policy "Posts are publicly readable"
on public.posts for select
using(true);

create policy "Users can create their own posts"
on public.posts for insert to authenticated
with check(author_id=auth.uid());

create policy "Users can update their own posts"
on public.posts for update to authenticated
using(author_id=auth.uid()) with check(author_id=auth.uid());

create policy "Users can delete their own posts"
on public.posts for delete to authenticated
using(author_id=auth.uid());

-- =========================================================
-- 12. FOLLOW POLICIES
-- =========================================================
create policy "Anyone can see follows"
on public.follows for select
using(true);

create policy "Users can follow"
on public.follows for insert to authenticated
with check(follower_id=auth.uid());

create policy "Users can unfollow"
on public.follows for delete to authenticated
using(follower_id=auth.uid());

-- =========================================================
-- 13. CONVERSATION POLICIES
-- =========================================================
create policy "Members can view conversations"
on public.conversations for select to authenticated
using(public.is_conversation_member(id,auth.uid()));

create policy "Authenticated users can create conversations"
on public.conversations for insert to authenticated
with check(true);

-- Keep this policy intentionally simple. It only exposes the caller's own
-- membership row. The app uses SECURITY DEFINER RPCs above when it needs the
-- other member rows, so this policy can never recurse into itself.
create policy "Users can view their own membership rows"
on public.conversation_members for select to authenticated
using(user_id=auth.uid());

-- Direct member insertion is not needed by the browser.
-- get_or_create_direct_conversation() inserts both members securely.
create policy "Users can add their own membership rows"
on public.conversation_members for insert to authenticated
with check(user_id=auth.uid());

-- =========================================================
-- 14. MESSAGE POLICIES
-- =========================================================
create policy "Conversation members can read messages"
on public.messages for select to authenticated
using(public.is_conversation_member(conversation_id,auth.uid()));

create policy "Users can send messages"
on public.messages for insert to authenticated
with check(
  sender_id=auth.uid()
  and public.is_conversation_member(conversation_id,auth.uid())
);

create policy "Conversation members can update messages"
on public.messages for update to authenticated
using(public.is_conversation_member(conversation_id,auth.uid()))
with check(public.is_conversation_member(conversation_id,auth.uid()));

-- =========================================================
-- 15. NOTIFICATION POLICIES
-- =========================================================
create policy "Users can read their notifications"
on public.notifications for select to authenticated
using(user_id=auth.uid());

create policy "Users can update their notifications"
on public.notifications for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

-- =========================================================
-- 16. INDEXES + REALTIME
-- =========================================================
create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists profiles_username_idx on public.profiles(username);
create index if not exists follows_follower_id_idx on public.follows(follower_id);
create index if not exists follows_following_id_idx on public.follows(following_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists messages_created_at_idx on public.messages(created_at desc);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

alter table public.messages replica identity full;
alter table public.notifications replica identity full;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';
