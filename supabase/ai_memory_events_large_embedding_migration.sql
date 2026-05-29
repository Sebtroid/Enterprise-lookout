drop index if exists ai_memory_events_embedding_idx;

drop function if exists match_ai_memory_events(
  vector,
  uuid,
  uuid,
  uuid,
  text[],
  integer
);

update ai_memory_events
set
  embedding = null,
  embedding_model = 'text-embedding-3-large',
  metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{embedding}',
    jsonb_build_object(
      'model',
      'text-embedding-3-large',
      'status',
      'missing',
      'reason',
      'embedding_model_changed_to_large'
    ),
    true
  ),
  updated_at = now()
where embedding is not null
  or embedding_model is distinct from 'text-embedding-3-large';

alter table ai_memory_events
  alter column embedding type vector(3072);

create or replace function match_ai_memory_events(
  query_embedding vector(3072),
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
