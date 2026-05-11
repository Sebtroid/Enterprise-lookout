-- Dom realtime progress and research cache.
-- Safe to run more than once against the existing Enterprise Lookout database.

do $$
declare
  current_labels text[];
  desired_labels text[] := array[
    'pending',
    'received',
    'in_progress',
    'researching',
    'drafting',
    'reviewing',
    'completed',
    'failed'
  ];
begin
  if to_regtype('dom_task_status') is null then
    create type dom_task_status as enum (
      'pending',
      'received',
      'in_progress',
      'researching',
      'drafting',
      'reviewing',
      'completed',
      'failed'
    );
    return;
  end if;

  select array_agg(enumlabel order by enumsortorder)
  into current_labels
  from pg_enum
  where enumtypid = 'dom_task_status'::regtype;

  if current_labels is distinct from desired_labels then
    alter type dom_task_status rename to dom_task_status_old;
    create type dom_task_status as enum (
      'pending',
      'received',
      'in_progress',
      'researching',
      'drafting',
      'reviewing',
      'completed',
      'failed'
    );

    alter table dom_tasks alter column status drop default;
    alter table dom_tasks
      alter column status type dom_task_status
      using (
        case status::text
          when 'blocked' then 'failed'
          else status::text
        end
      )::dom_task_status;
    alter table dom_tasks alter column status set default 'pending';

    drop type dom_task_status_old;
  end if;
end $$;

alter table dom_tasks
  add column if not exists progress_step text,
  add column if not exists progress_message text,
  add column if not exists progress_percent integer,
  add column if not exists result_preview text,
  add column if not exists last_progress_at timestamptz;

do $$
begin
  alter table dom_tasks
    add constraint dom_tasks_progress_percent_check
    check (
      progress_percent is null
      or (progress_percent >= 0 and progress_percent <= 100)
    );
exception when duplicate_object then null;
end $$;

create table if not exists company_research_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  research_type text not null,
  data jsonb not null,
  source_urls text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (company_id, research_type)
);

create index if not exists company_research_cache_company_idx
  on company_research_cache (company_id, research_type, expires_at);

alter table company_research_cache enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on company_research_cache to authenticated;

do $$
begin
  create policy "authenticated workspace access" on company_research_cache
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;
