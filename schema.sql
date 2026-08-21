-- Pixora backend schema for Supabase
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Pixora User',
  username text not null unique,
  bio text default '', avatar text default '', cover text default '',
  created_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
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
create index if not exists messages_sender_recipient_idx on public.messages(sender_id,recipient_id,created_at desc);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read" on public.profiles for select using (true);
drop policy if exists "profiles own write" on public.profiles;
create policy "profiles own write" on public.profiles for insert with check (auth.uid()=id);
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
