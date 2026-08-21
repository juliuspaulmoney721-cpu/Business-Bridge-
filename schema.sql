-- Pixora real backend. Run this ONCE in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Pixora User',
  username text not null unique,
  bio text not null default '',
  avatar_url text not null default '',
  cover_url text not null default '',
  account_type text not null default 'Creator',
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id),
  check(follower_id<>following_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check(sender_id<>recipient_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  message text not null,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_sender_recipient_idx on public.messages(sender_id,recipient_id,created_at desc);
create index if not exists messages_recipient_idx on public.messages(recipient_id,created_at desc);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create index if not exists posts_author_idx on public.posts(author_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.stories enable row level security;
alter table public.follows enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts for select to authenticated using (true);
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated with check (author_id=auth.uid());
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts for delete to authenticated using (author_id=auth.uid());

drop policy if exists stories_select_authenticated on public.stories;
create policy stories_select_authenticated on public.stories for select to authenticated using (expires_at > now() or author_id=auth.uid());
drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own on public.stories for insert to authenticated with check (author_id=auth.uid());
drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories for delete to authenticated using (author_id=auth.uid());

drop policy if exists likes_select_authenticated on public.post_likes;
create policy likes_select_authenticated on public.post_likes for select to authenticated using (true);
drop policy if exists likes_insert_own on public.post_likes;
create policy likes_insert_own on public.post_likes for insert to authenticated with check (user_id=auth.uid());
drop policy if exists likes_delete_own on public.post_likes;
create policy likes_delete_own on public.post_likes for delete to authenticated using (user_id=auth.uid());

drop policy if exists follows_select_authenticated on public.follows;
create policy follows_select_authenticated on public.follows for select to authenticated using (true);
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows for insert to authenticated with check (follower_id=auth.uid());
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows for delete to authenticated using (follower_id=auth.uid());

drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants on public.messages for select to authenticated using (sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages for insert to authenticated with check (sender_id=auth.uid());
drop policy if exists messages_update_recipient on public.messages;
create policy messages_update_recipient on public.messages for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (recipient_id=auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

-- Profiles are created automatically when a new auth user signs up.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare base text; candidate text; n int := 0;
begin
  base:=lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username',new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'pixorauser'),'[^a-z0-9._]','','g'));
  if base='' then base:='pixorauser'; end if;
  base:=left(base,30); candidate:=base;
  while exists(select 1 from public.profiles where username=candidate) loop
    n:=n+1; candidate:=left(base,24)||'_'||n;
  end loop;
  insert into public.profiles(id,name,username,bio,avatar_url,cover_url,account_type)
  values(new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'Pixora User'),candidate,coalesce(new.raw_user_meta_data->>'bio',''),coalesce(new.raw_user_meta_data->>'avatar',''),coalesce(new.raw_user_meta_data->>'cover',''),coalesce(new.raw_user_meta_data->>'account_type','Creator'))
  on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.notify_message() returns trigger language plpgsql security definer set search_path=public as $$
declare sender_name text;
begin
 select name into sender_name from public.profiles where id=new.sender_id;
 insert into public.notifications(recipient_id,actor_id,type,message) values(new.recipient_id,new.sender_id,'message',coalesce(sender_name,'Someone')||' sent you a message');
 return new;
end; $$;
drop trigger if exists message_notification on public.messages;
create trigger message_notification after insert on public.messages for each row execute procedure public.notify_message();

create or replace function public.notify_follow() returns trigger language plpgsql security definer set search_path=public as $$
declare actor_name text;
begin
 select name into actor_name from public.profiles where id=new.follower_id;
 insert into public.notifications(recipient_id,actor_id,type,message) values(new.following_id,new.follower_id,'follow',coalesce(actor_name,'Someone')||' followed you');
 return new;
end; $$;
drop trigger if exists follow_notification on public.follows;
create trigger follow_notification after insert on public.follows for each row execute procedure public.notify_follow();

create or replace function public.notify_like() returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid; actor_name text;
begin
 select author_id into owner_id from public.posts where id=new.post_id;
 select name into actor_name from public.profiles where id=new.user_id;
 if owner_id is not null and owner_id<>new.user_id then
  insert into public.notifications(recipient_id,actor_id,type,message,post_id) values(owner_id,new.user_id,'like',coalesce(actor_name,'Someone')||' liked your post',new.post_id);
 end if;
 return new;
end; $$;
drop trigger if exists like_notification on public.post_likes;
create trigger like_notification after insert on public.post_likes for each row execute procedure public.notify_like();

-- Public media bucket for the client-side GitHub app. Do not put private files here.
insert into storage.buckets(id,name,public) values('pixora-media','pixora-media',true) on conflict(id) do update set public=true;
drop policy if exists pixora_media_public_read on storage.objects;
create policy pixora_media_public_read on storage.objects for select using(bucket_id='pixora-media');
drop policy if exists pixora_media_authenticated_upload on storage.objects;
create policy pixora_media_authenticated_upload on storage.objects for insert to authenticated with check(bucket_id='pixora-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists pixora_media_owner_update on storage.objects;
create policy pixora_media_owner_update on storage.objects for update to authenticated using(bucket_id='pixora-media' and owner_id=auth.uid()) with check(bucket_id='pixora-media' and owner_id=auth.uid());
drop policy if exists pixora_media_owner_delete on storage.objects;
create policy pixora_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='pixora-media' and owner_id=auth.uid());

-- Enable realtime for the two live features.
alter table public.messages replica identity full;
alter table public.notifications replica identity full;
alter table public.stories replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
end $$;
