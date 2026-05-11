-- Migration: agent inbox para eventos HTTP
-- La app dispara eventos acá; Dom los revisa periódicamente.

do $$
begin
  create type agent_event_status as enum ('pending', 'in_progress', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type agent_event_priority as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

create table if not exists agent_inbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  payload jsonb not null default '{}',
  priority agent_event_priority not null default 'normal',
  source text not null default 'app',
  status agent_event_status not null default 'pending',
  result jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists agent_inbox_status_priority_idx on agent_inbox (status, priority, created_at);
create index if not exists agent_inbox_campaign_idx on agent_inbox (campaign_id, status);
create index if not exists agent_inbox_created_idx on agent_inbox (created_at desc);

alter table agent_inbox enable row level security;
do $$
begin
  create policy "authenticated workspace access" on agent_inbox
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;
grant select, insert, update, delete on agent_inbox to authenticated;
