-- One-off migration for Dom campaign tasks/chat.
-- Kept here because early KimiClaw work had a different chat_messages table shape.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

do $$
begin
  create type dom_task_status as enum ('pending', 'in_progress', 'completed', 'blocked');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type chat_message_role as enum ('user', 'dom', 'system');
exception when duplicate_object then null;
end $$;

do $$
declare
  legacy_name text;
begin
  if to_regclass('public.chat_messages') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'chat_messages'
        and column_name = 'thread_id'
    )
  then
    legacy_name := 'chat_messages_legacy_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS');
    execute format('alter table public.chat_messages rename to %I', legacy_name);
  end if;
end $$;

create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role chat_message_role not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists dom_tasks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  description text not null,
  status dom_task_status not null default 'pending',
  created_by text not null check (created_by in ('user', 'dom', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  context jsonb,
  result text,
  chat_thread_id uuid references chat_threads(id) on delete set null
);

create table if not exists gmail_tokens (
  id uuid primary key default gen_random_uuid(),
  user_email citext not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_created_idx
  on chat_messages (thread_id, created_at);
create index if not exists dom_tasks_campaign_status_idx
  on dom_tasks (campaign_id, status, updated_at desc);

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table dom_tasks enable row level security;
alter table gmail_tokens enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on chat_threads to authenticated;
grant select, insert, update, delete on chat_messages to authenticated;
grant select, insert, update, delete on dom_tasks to authenticated;
grant select, insert, update, delete on gmail_tokens to authenticated;

do $$
begin
  create policy "authenticated workspace access" on chat_threads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated workspace access" on chat_messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated workspace access" on dom_tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated workspace access" on gmail_tokens
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;
