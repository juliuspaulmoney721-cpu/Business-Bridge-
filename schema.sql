-- PIXORA DATABASE REPAIR / INSTALL
-- Run this entire file once in Supabase SQL Editor.
-- It is written to repair the earlier Pixora schema too: missing columns, foreign keys,
-- notifications, realtime and the pixora-media storage bucket.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Core tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text default 'Pixora User',
  username text default 'pixorauser',
  bio text default '',
  avatar_url text default '',
  cover_url text default '',
  account_type text default 'Creator',
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  caption text default '',
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  caption text default '',
  image_url text,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours')
);

create table if not exists public.post_likes (
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamptz default now(),
  primary key(post_id,user_id)
);

create table if not exists public.follows (
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamptz default now(),
  primary key(follower_id,following_id),
  check(follower_id<>following_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  recipient_id uuid not null,
  body text not null,
  created_at timestamptz default now(),
  read_at timestamptz,
  check(sender_id<>recipient_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  actor_id uuid,
  type text not null default 'system',
  message text not null default '',
  post_id uuid,
  created_at timestamptz default now(),
  read_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Repair older Pixora tables without deleting existing data
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists created_at timestamptz;

-- Older builds used avatar/cover. Copy them into the real column names when those columns exist.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar') then
    execute 'update public.profiles set avatar_url=coalesce(avatar_url,avatar)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='cover') then
    execute 'update public.profiles set cover_url=coalesce(cover_url,cover)';
  end if;
end $$;

update public.profiles set name=coalesce(nullif(name,''), 'Pixora User') where name is null or name='';
update public.profiles set username=coalesce(nullif(username,''), 'pixora_'||left(replace(id::text,'-',''),10)) where username is null or username='';
update public.profiles set bio=coalesce(bio,''),avatar_url=coalesce(avatar_url,''),cover_url=coalesce(cover_url,''),account_type=coalesce(account_type,'Creator'),created_at=coalesce(created_at,now());

-- Make duplicate legacy usernames unique before creating the unique index.
with duplicates as (
  select id, username, row_number() over(partition by username order by created_at nulls last, id) as rn
  from public.profiles
)
update public.profiles p
set username=left(p.username,23)||'_'||left(replace(p.id::text,'-',''),6)
from duplicates d
where p.id=d.id and d.rn>1;
alter table public.profiles alter column name set default 'Pixora User';
alter table public.profiles alter column username set default 'pixorauser';
alter table public.profiles alter column bio set default '';
alter table public.profiles alter column avatar_url set default '';
alter table public.profiles alter column cover_url set default '';
alter table public.profiles alter column account_type set default 'Creator';
alter table public.profiles alter column created_at set default now();

alter table public.posts add column if not exists author_id uuid;
alter table public.posts add column if not exists caption text;
alter table public.posts add column if not exists image_url text;
alter table public.posts add column if not exists created_at timestamptz;
update public.posts set caption=coalesce(caption,''),created_at=coalesce(created_at,now());
alter table public.posts alter column caption set default '';
alter table public.posts alter column created_at set default now();

alter table public.stories add column if not exists author_id uuid;
alter table public.stories add column if not exists caption text;
alter table public.stories add column if not exists image_url text;
alter table public.stories add column if not exists created_at timestamptz;
alter table public.stories add column if not exists expires_at timestamptz;
update public.stories set caption=coalesce(caption,''),created_at=coalesce(created_at,now()),expires_at=coalesce(expires_at,now()+interval '24 hours');
alter table public.stories alter column caption set default '';
alter table public.stories alter column created_at set default now();
alter table public.stories alter column expires_at set default (now()+interval '24 hours');

alter table public.post_likes add column if not exists post_id uuid;
alter table public.post_likes add column if not exists user_id uuid;
alter table public.post_likes add column if not exists created_at timestamptz;
alter table public.post_likes alter column created_at set default now();

alter table public.follows add column if not exists follower_id uuid;
alter table public.follows add column if not exists following_id uuid;
alter table public.follows add column if not exists created_at timestamptz;
alter table public.follows alter column created_at set default now();

alter table public.messages add column if not exists sender_id uuid;
alter table public.messages add column if not exists recipient_id uuid;
alter table public.messages add column if not exists body text;
alter table public.messages add column if not exists created_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;
update public.messages set created_at=coalesce(created_at,now());
alter table public.messages alter column created_at set default now();

alter table public.notifications add column if not exists recipient_id uuid;
alter table public.notifications add column if not exists actor_id uuid;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists post_id uuid;
alter table public.notifications add column if not exists created_at timestamptz;
alter table public.notifications add column if not exists read_at timestamptz;
-- Older builds used text/read. Preserve those values when present.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='text') then
    execute 'update public.notifications set message=coalesce(message,text)';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='read') then
    execute 'update public.notifications set read_at=coalesce(read_at,case when read then created_at else null end) where read_at is null';
  end if;
end $$;
update public.notifications set type=coalesce(nullif(type,''),'system'),message=coalesce(message,''),created_at=coalesce(created_at,now());
alter table public.notifications alter column type set default 'system';
alter table public.notifications alter column message set default '';
alter table public.notifications alter column created_at set default now();

-- -----------------------------------------------------------------------------
-- Foreign keys. NOT VALID lets the repair complete even if an old row is bad;
-- new rows are still checked by PostgreSQL.
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists(select 1 from pg_constraint where conname='posts_author_id_fkey') then
    alter table public.posts add constraint posts_author_id_fkey foreign key(author_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='stories_author_id_fkey') then
    alter table public.stories add constraint stories_author_id_fkey foreign key(author_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='post_likes_post_id_fkey') then
    alter table public.post_likes add constraint post_likes_post_id_fkey foreign key(post_id) references public.posts(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='post_likes_user_id_fkey') then
    alter table public.post_likes add constraint post_likes_user_id_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='follows_follower_id_fkey') then
    alter table public.follows add constraint follows_follower_id_fkey foreign key(follower_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='follows_following_id_fkey') then
    alter table public.follows add constraint follows_following_id_fkey foreign key(following_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='messages_sender_id_fkey') then
    alter table public.messages add constraint messages_sender_id_fkey foreign key(sender_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='messages_recipient_id_fkey') then
    alter table public.messages add constraint messages_recipient_id_fkey foreign key(recipient_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='notifications_recipient_id_fkey') then
    alter table public.notifications add constraint notifications_recipient_id_fkey foreign key(recipient_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='notifications_actor_id_fkey') then
    alter table public.notifications add constraint notifications_actor_id_fkey foreign key(actor_id) references public.profiles(id) on delete set null not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='notifications_post_id_fkey') then
    alter table public.notifications add constraint notifications_post_id_fkey foreign key(post_id) references public.posts(id) on delete cascade not valid;
  end if;
end $$;

create unique index if not exists profiles_username_unique_idx on public.profiles(username);
create index if not exists posts_author_idx on public.posts(author_id,created_at desc);
create index if not exists messages_sender_recipient_idx on public.messages(sender_id,recipient_id,created_at desc);
create index if not exists messages_recipient_idx on public.messages(recipient_id,created_at desc);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
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
create policy stories_select_authenticated on public.stories for select to authenticated using (expires_at>now() or author_id=auth.uid());
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

-- -----------------------------------------------------------------------------
-- Automatic profile + in-app notifications
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare base text; candidate text; n int:=0;
begin
  base:=lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username',new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'pixorauser'),'[^a-z0-9._]','','g'));
  if base='' then base:='pixorauser'; end if;
  base:=left(base,30); candidate:=base;
  while exists(select 1 from public.profiles where username=candidate) loop
    n:=n+1; candidate:=left(base,24)||'_'||n;
  end loop;
  insert into public.profiles(id,name,username,bio,avatar_url,cover_url,account_type)
  values(new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'Pixora User'),candidate,coalesce(new.raw_user_meta_data->>'bio',''),coalesce(new.raw_user_meta_data->>'avatar',''),coalesce(new.raw_user_meta_data->>'cover',''),coalesce(new.raw_user_meta_data->>'account_type','Creator'))
  on conflict(id) do update set name=excluded.name,username=excluded.username,account_type=excluded.account_type;
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

-- -----------------------------------------------------------------------------
-- Storage: this fixes "Bucket not found".
-- -----------------------------------------------------------------------------
insert into storage.buckets(id,name,public) values('pixora-media','pixora-media',true)
on conflict(id) do update set public=true;

drop policy if exists pixora_media_public_read on storage.objects;
create policy pixora_media_public_read on storage.objects for select using(bucket_id='pixora-media');
drop policy if exists pixora_media_authenticated_upload on storage.objects;
create policy pixora_media_authenticated_upload on storage.objects for insert to authenticated with check(bucket_id='pixora-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists pixora_media_owner_update on storage.objects;
create policy pixora_media_owner_update on storage.objects for update to authenticated using(bucket_id='pixora-media' and owner_id=auth.uid()) with check(bucket_id='pixora-media' and owner_id=auth.uid());
drop policy if exists pixora_media_owner_delete on storage.objects;
create policy pixora_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='pixora-media' and owner_id=auth.uid());

-- Realtime for chat and in-app notifications.
alter table public.messages replica identity full;
alter table public.notifications replica identity full;
alter table public.follows replica identity full;
alter table public.post_likes replica identity full;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
end $$;

-- Refresh PostgREST schema cache after the repair.
notify pgrst, 'reload schema';
