-- Dom task candidate review workflow.

alter table companies
  add column if not exists quality_rating smallint not null default 3,
  add column if not exists quality_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_quality_rating_check'
  ) then
    alter table companies
      add constraint companies_quality_rating_check
      check (quality_rating >= 1 and quality_rating <= 5);
  end if;
end $$;

create table if not exists dom_task_company_candidates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references dom_tasks(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  name text not null,
  normalized_name text not null,
  domain text,
  website text,
  industry text,
  region text,
  description text,
  evidence_urls text[] not null default '{}',
  suggested_contacts jsonb not null default '[]',
  fit_score integer not null default 50 check (fit_score >= 0 and fit_score <= 100),
  fit_reason text,
  quality_rating smallint not null default 3 check (quality_rating >= 1 and quality_rating <= 5),
  quality_reason text,
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'rejected', 'needs_more_research')
  ),
  user_feedback text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, normalized_name)
);

create index if not exists dom_task_company_candidates_task_idx
  on dom_task_company_candidates (task_id, status, updated_at desc);

create index if not exists dom_task_company_candidates_campaign_idx
  on dom_task_company_candidates (campaign_id, status, updated_at desc);

create index if not exists campaign_contacts_company_idx
  on campaign_contacts (company_id, updated_at desc);

create index if not exists campaign_contacts_campaign_company_idx
  on campaign_contacts (campaign_id, company_id);

create index if not exists campaigns_organization_idx
  on campaigns (organization);

create index if not exists evidence_links_company_idx
  on evidence_links (company_id);

alter table dom_task_company_candidates enable row level security;

grant select, insert, update, delete on dom_task_company_candidates to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dom_task_company_candidates'
      and policyname = 'authenticated workspace access'
  ) then
    create policy "authenticated workspace access" on dom_task_company_candidates
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;
