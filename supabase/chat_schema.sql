-- Supplemental Gmail OAuth token table.
-- Dom campaign chat and task tables now live in supabase/schema.sql.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create table if not exists gmail_tokens (
  id uuid primary key default gen_random_uuid(),
  user_email citext not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table gmail_tokens enable row level security;
