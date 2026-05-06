-- Chat interno con Dom Assistant
-- Añadir al final de supabase/schema.sql

create type chat_role as enum ('user', 'assistant', 'system', 'action');
create type chat_status as enum ('pending', 'streaming', 'completed', 'error');

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  user_email citext not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role chat_role not null default 'user',
  content text not null,
  status chat_status not null default 'completed',
  action_type text, -- 'research_companies', 'draft_email', 'send_email', etc.
  action_payload jsonb,
  action_result jsonb,
  created_at timestamptz not null default now()
);

create index idx_chat_sessions_user on chat_sessions(user_email);
create index idx_chat_sessions_campaign on chat_sessions(campaign_id);
create index idx_chat_messages_session on chat_messages(session_id);

-- Tabla para tokens de Gmail OAuth (encriptados en app, guardados en DB)
create table gmail_tokens (
  id uuid primary key default gen_random_uuid(),
  user_email citext not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table gmail_tokens enable row level security;

-- These tables are accessed by trusted server routes through the database
-- connection, not directly by browser Supabase clients. No public policies.
