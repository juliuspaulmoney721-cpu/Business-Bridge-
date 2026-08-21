-- PIXORA DATABASE
-- This schema matches the Pixora frontend in this ZIP.
-- Run once in Supabase SQL Editor.

create extension if not exists "pgcrypto";

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
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,name,username,avatar_url,bio)
  values(
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
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

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

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(follower_id,following_id)
);

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

create or replace function public.create_follow_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare follower_name text;
begin
  select coalesce(name,username,'Someone') into follower_name from public.profiles where id=new.follower_id;
  insert into public.notifications(user_id,actor_id,type,title,message)
  values(new.following_id,new.follower_id,'follow','New follower',follower_name||' started following you.');
  return new;
end;
$$;

drop trigger if exists follow_notification_trigger on public.follows;
create trigger follow_notification_trigger after insert on public.follows for each row execute function public.create_follow_notification();

create or replace function public.create_message_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare receiver_id uuid; sender_name text;
begin
  select cm.user_id into receiver_id
  from public.conversation_members cm
  where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id
  limit 1;
  select coalesce(name,username,'Someone') into sender_name from public.profiles where id=new.sender_id;
  if receiver_id is not null then
    insert into public.notifications(user_id,actor_id,type,title,message,conversation_id)
    values(receiver_id,new.sender_id,'message','New message',sender_name||' sent you a message.',new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists message_notification_trigger on public.messages;
create trigger message_notification_trigger after insert on public.messages for each row execute function public.create_message_notification();

insert into storage.buckets(id,name,public)
values('posts','posts',true)
on conflict(id) do update set public=true;

drop policy if exists "Anyone can view post images" on storage.objects;
create policy "Anyone can view post images" on storage.objects for select using(bucket_id='posts');
drop policy if exists "Authenticated users can upload post images" on storage.objects;
create policy "Authenticated users can upload post images" on storage.objects for insert to authenticated with check(bucket_id='posts');
drop policy if exists "Users can update their post images" on storage.objects;
create policy "Users can update their post images" on storage.objects for update to authenticated using(bucket_id='posts' and owner_id=auth.uid()::text);
drop policy if exists "Users can delete their post images" on storage.objects;
create policy "Users can delete their post images" on storage.objects for delete to authenticated using(bucket_id='posts' and owner_id=auth.uid()::text);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using(true);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check(id=auth.uid());
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists "Posts are publicly readable" on public.posts;
create policy "Posts are publicly readable" on public.posts for select using(true);
drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts" on public.posts for insert to authenticated with check(author_id=auth.uid());
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts" on public.posts for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts" on public.posts for delete to authenticated using(author_id=auth.uid());

drop policy if exists "Anyone can see follows" on public.follows;
create policy "Anyone can see follows" on public.follows for select using(true);
drop policy if exists "Users can follow" on public.follows;
create policy "Users can follow" on public.follows for insert to authenticated with check(follower_id=auth.uid());
drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow" on public.follows for delete to authenticated using(follower_id=auth.uid());

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversations.id and cm.user_id=auth.uid()));
drop policy if exists "Authenticated users can create conversations" on public.conversations;
create policy "Authenticated users can create conversations" on public.conversations for insert to authenticated with check(true);

drop policy if exists "Members can view members" on public.conversation_members;
create policy "Members can view members" on public.conversation_members for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=conversation_members.conversation_id and cm.user_id=auth.uid()));
drop policy if exists "Authenticated users can add conversation members" on public.conversation_members;
create policy "Authenticated users can add conversation members" on public.conversation_members for insert to authenticated with check(true);

drop policy if exists "Conversation members can read messages" on public.messages;
create policy "Conversation members can read messages" on public.messages for select to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists "Recipients can update read status" on public.messages;
create policy "Recipients can update read status" on public.messages for update to authenticated using(exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid())) with check(exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications" on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists "Users can update their notifications" on public.notifications;
create policy "Users can update their notifications" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

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

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
end $$;

notify pgrst, 'reload schema';
