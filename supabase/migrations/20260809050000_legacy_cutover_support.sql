-- Additive support for a reversible V1 -> V2 cutover.

alter table public.companies
  add column if not exists record_state text not null default 'active'
  check (record_state in ('active', 'quarantined', 'archived'));

alter table public.contacts
  add column if not exists record_state text not null default 'active'
  check (record_state in ('active', 'quarantined', 'archived'));

create index if not exists companies_workspace_record_state_idx
  on public.companies (workspace_id, record_state);
create index if not exists contacts_workspace_record_state_idx
  on public.contacts (workspace_id, record_state);
create unique index if not exists legacy_quarantine_source_unique_idx
  on public.legacy_quarantine (workspace_id, source_table, source_id);

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  executed_by uuid not null references public.profiles(id) on delete restrict,
  source_version text not null default 'v1',
  status text not null check (status in ('started', 'completed', 'failed', 'rolled_back')),
  counts jsonb not null default '{}',
  checksum text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.migration_runs enable row level security;
create policy migration_runs_select_members on public.migration_runs for select to authenticated
using (app_private.is_workspace_member(workspace_id));
create policy migration_runs_insert_owner on public.migration_runs for insert to authenticated
with check (app_private.is_workspace_owner(workspace_id) and executed_by = auth.uid());
create index if not exists migration_runs_workspace_started_idx
  on public.migration_runs (workspace_id, started_at desc);

grant select, insert on public.migration_runs to authenticated;
