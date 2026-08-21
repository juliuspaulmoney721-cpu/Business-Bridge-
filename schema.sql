-- PIXORA DATABASE SETUP
-- Run this entire file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Pixora User',
  username text not null unique,
  bio text default '',
  avatar text default '',
  cover text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text default '',
  type text not null,
  text text not null,
  meta jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists messages_pair_idx on public.messages(sender_id,recipient_id,created_at desc);
create index if not exists messages_recipient_idx on public.messages(recipient_id,created_at desc);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create index if not exists follows_following_idx on public.follows(following_id);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.follows enable row level security;

drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read" on public.profiles for select using (true);
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert with check (auth.uid()=id);
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);

drop policy if exists "messages participants read" on public.messages;
create policy "messages participants read" on public.messages for select using (auth.uid()=sender_id or auth.uid()=recipient_id);
drop policy if exists "messages sender insert" on public.messages;
create policy "messages sender insert" on public.messages for insert with check (auth.uid()=sender_id);

drop policy if exists "notifications recipient read" on public.notifications;
create policy "notifications recipient read" on public.notifications for select using (auth.uid()=recipient_id);
drop policy if exists "notifications recipient update" on public.notifications;
create policy "notifications recipient update" on public.notifications for update using (auth.uid()=recipient_id) with check (auth.uid()=recipient_id);
drop policy if exists "notifications actor insert" on public.notifications;
create policy "notifications actor insert" on public.notifications for insert with check (auth.uid()=actor_id);

drop policy if exists "follows read" on public.follows;
create policy "follows read" on public.follows for select using (auth.uid()=follower_id or auth.uid()=following_id);
drop policy if exists "follows insert" on public.follows;
create policy "follows insert" on public.follows for insert with check (auth.uid()=follower_id);
drop policy if exists "follows delete" on public.follows;
create policy "follows delete" on public.follows for delete using (auth.uid()=follower_id);

-- Automatically create a Pixora profile whenever a new Auth account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email,''),'@',1), 'pixorauser'), '[^a-zA-Z0-9._]', '', 'g'));
  base := left(nullif(base,''), 24);
  if base is null then base := 'pixorauser'; end if;
  candidate := base;
  while exists(select 1 from public.profiles where username=candidate) loop
    candidate := left(base, 20) || substr(md5(new.id::text),1,5);
  end loop;
  insert into public.profiles(id,name,username,bio,avatar,cover)
  values(new.id, coalesce(new.raw_user_meta_data->>'name',candidate), candidate,
         coalesce(new.raw_user_meta_data->>'bio',''), coalesce(new.raw_user_meta_data->>'avatar',''), coalesce(new.raw_user_meta_data->>'cover',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Message notification: the recipient gets an in-app notification automatically.
create or replace function public.create_message_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare actor text;
begin
  select name into actor from public.profiles where id=new.sender_id;
  insert into public.notifications(recipient_id,actor_id,actor_name,type,text,meta)
  values(new.recipient_id,new.sender_id,coalesce(actor,'Pixora User'),'message','sent you a message',jsonb_build_object('message_id',new.id));
  return new;
end;
$$;

drop trigger if exists after_message_insert on public.messages;
create trigger after_message_insert
after insert on public.messages
for each row execute procedure public.create_message_notification();

-- Follow notification.
create or replace function public.create_follow_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare actor text;
begin
  select name into actor from public.profiles where id=new.follower_id;
  insert into public.notifications(recipient_id,actor_id,actor_name,type,text,meta)
  values(new.following_id,new.follower_id,coalesce(actor,'Pixora User'),'follow','started following you',jsonb_build_object('follower_id',new.follower_id));
  return new;
end;
$$;

drop trigger if exists after_follow_insert on public.follows;
create trigger after_follow_insert
after insert on public.follows
for each row execute procedure public.create_follow_notification();

-- Enable Realtime for the two live tables. If Supabase says they are already members, that is fine.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Backfill profiles for accounts that already existed before this schema was installed.
create or replace function public.backfill_pixora_profiles()
returns void
language plpgsql
security definer set search_path = public
as $$
declare u record; base text; candidate text;
begin
  for u in select * from auth.users loop
    if not exists(select 1 from public.profiles where id=u.id) then
      base := lower(regexp_replace(coalesce(u.raw_user_meta_data->>'username', split_part(coalesce(u.email,''),'@',1), 'pixorauser'), '[^a-zA-Z0-9._]', '', 'g'));
      base := left(nullif(base,''), 24);
      if base is null then base := 'pixorauser'; end if;
      candidate := base;
      while exists(select 1 from public.profiles where username=candidate) loop
        candidate := left(base, 18) || '_' || substr(md5(u.id::text),1,8);
      end loop;
      insert into public.profiles(id,name,username,bio,avatar,cover)
      values(u.id, coalesce(u.raw_user_meta_data->>'name',candidate), candidate, coalesce(u.raw_user_meta_data->>'bio',''), coalesce(u.raw_user_meta_data->>'avatar',''), coalesce(u.raw_user_meta_data->>'cover',''))
      on conflict (id) do nothing;
    end if;
  end loop;
end;
$$;
select public.backfill_pixora_profiles();
drop function public.backfill_pixora_profiles();
