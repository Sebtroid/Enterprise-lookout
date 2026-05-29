create extension if not exists "vector";

create table if not exists ai_memory_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  sender_account_id uuid references sender_accounts(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'approved_message',
      'dom_task',
      'gpt_result',
      'manual',
      'no_reply',
      'outbound_feedback',
      'reply_feedback'
    )
  ),
  source_id uuid,
  memory_text text not null,
  embedding vector(1536),
  embedding_model text,
  metadata jsonb not null default '{}',
  confidence numeric(4, 3) not null default 0.7 check (
    confidence >= 0 and confidence <= 1
  ),
  active boolean not null default true,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists ai_memory_events_campaign_idx
  on ai_memory_events (campaign_id, active, created_at desc);

create index if not exists ai_memory_events_company_idx
  on ai_memory_events (company_id, active, created_at desc);

create index if not exists ai_memory_events_source_idx
  on ai_memory_events (source_type, source_id);

create index if not exists ai_memory_events_embedding_idx
  on ai_memory_events using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where active = true and embedding is not null;

create or replace function match_ai_memory_events(
  query_embedding vector(1536),
  match_campaign_id uuid default null,
  match_company_id uuid default null,
  match_contact_id uuid default null,
  match_source_types text[] default null,
  match_count integer default 8
)
returns table (
  id uuid,
  campaign_id uuid,
  company_id uuid,
  contact_id uuid,
  sender_account_id uuid,
  source_type text,
  source_id uuid,
  memory_text text,
  metadata jsonb,
  confidence numeric,
  similarity double precision,
  created_at timestamptz
)
language sql
stable
as $$
  select
    event.id,
    event.campaign_id,
    event.company_id,
    event.contact_id,
    event.sender_account_id,
    event.source_type,
    event.source_id,
    event.memory_text,
    event.metadata,
    event.confidence,
    1 - (event.embedding <=> query_embedding) as similarity,
    event.created_at
  from ai_memory_events event
  where event.active = true
    and event.embedding is not null
    and (
      match_campaign_id is null
      or event.campaign_id = match_campaign_id
      or event.campaign_id is null
    )
    and (
      match_company_id is null
      or event.company_id = match_company_id
      or event.company_id is null
    )
    and (
      match_contact_id is null
      or event.contact_id = match_contact_id
      or event.contact_id is null
    )
    and (
      match_source_types is null
      or event.source_type = any(match_source_types)
    )
  order by event.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 25);
$$;

alter table ai_memory_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_memory_events'
      and policyname = 'authenticated workspace access'
  ) then
    create policy "authenticated workspace access"
      on ai_memory_events
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end
$$;

grant select, insert, update, delete on ai_memory_events to authenticated;
