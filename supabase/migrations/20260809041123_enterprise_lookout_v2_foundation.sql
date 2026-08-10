-- Enterprise Lookout V2 foundation.
-- Additive migration: legacy tables remain available until the V2 cutover.

create extension if not exists citext;
create extension if not exists pgcrypto;
create schema if not exists app_private;

do $$ begin
  create type public.workspace_member_role as enum ('owner', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_access_mode as enum ('personal', 'shared');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.fact_status as enum (
    'estimated', 'found', 'verified', 'confirmed', 'disputed', 'stale'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.actor_origin as enum (
    'user', 'chatgpt', 'codex', 'minimax', 'gmail', 'system', 'migration'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ai_job_status as enum (
    'pending_approval', 'approved', 'claimed', 'running',
    'reviewing', 'completed', 'failed', 'budget_paused'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contribution_kind as enum ('cash', 'in_kind');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contribution_status as enum (
    'requested', 'committed', 'received', 'declined', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text not null,
  avatar_url text,
  timezone text not null default 'America/Santiago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  invite_only boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspaces (id, name, slug, invite_only)
values (
  '00000000-0000-4000-8000-000000000001',
  'Enterprise Lookout',
  'enterprise-lookout',
  true
)
on conflict (id) do nothing;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_member_role not null default 'member',
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email citext not null,
  role public.workspace_member_role not null default 'member',
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

insert into public.workspace_invitations (workspace_id, email, role, expires_at)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'sebawitting@gmail.com',
    'owner',
    now() + interval '10 years'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'josemigueloaguado@estudiante.uc.cl',
    'member',
    now() + interval '10 years'
  )
on conflict (workspace_id, email) do update set
  role = excluded.role,
  expires_at = greatest(public.workspace_invitations.expires_at, excluded.expires_at);

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.workspace_invitations%rowtype;
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  select * into invitation
  from public.workspace_invitations
  where lower(email::text) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at asc
  limit 1;

  if invitation.id is not null then
    insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
    values (invitation.workspace_id, new.id, invitation.role, 'active', now())
    on conflict (workspace_id, user_id) do update set status = 'active', joined_at = coalesce(public.workspace_members.joined_at, now());
    update public.workspace_invitations set accepted_at = now() where id = invitation.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute procedure app_private.handle_new_user();

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  short_name text,
  website text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  email citext not null,
  display_name text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  expires_at timestamptz not null,
  history_id text,
  sync_status text not null default 'pending' check (
    sync_status in ('pending', 'syncing', 'ready', 'error', 'disconnected')
  ),
  initial_sync_after timestamptz not null default (now() - interval '12 months'),
  last_synced_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table public.gmail_account_permissions (
  gmail_account_id uuid not null references public.gmail_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_read boolean not null default false,
  can_draft boolean not null default false,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (gmail_account_id, user_id)
);

create table public.sender_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  gmail_account_id uuid references public.gmail_accounts(id) on delete set null,
  display_name text not null,
  title text,
  signature text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  institution_id uuid references public.institutions(id) on delete set null,
  default_sender_identity_id uuid references public.sender_identities(id) on delete set null,
  legacy_campaign_id uuid unique references public.campaigns(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  value_proposition text,
  access_mode public.project_access_mode not null default 'personal',
  status text not null default 'draft' check (
    status in ('draft', 'active', 'paused', 'archived')
  ),
  starts_on date,
  ends_on date,
  brief jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_edit boolean not null default true,
  can_approve boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.companies
  add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade
  default '00000000-0000-4000-8000-000000000001';
update public.companies set workspace_id = '00000000-0000-4000-8000-000000000001'
where workspace_id is null;
alter table public.companies alter column workspace_id set not null;

alter table public.contacts
  add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade
  default '00000000-0000-4000-8000-000000000001';
update public.contacts set workspace_id = '00000000-0000-4000-8000-000000000001'
where workspace_id is null;
alter table public.contacts alter column workspace_id set not null;

create table public.project_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  stage text not null default 'new',
  fit_score integer check (fit_score between 0 and 100),
  priority integer not null default 0,
  next_action text,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, company_id)
);

create table public.evidence_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  url text not null,
  title text,
  publisher text,
  captured_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  origin public.actor_origin not null default 'user',
  unique (workspace_id, url)
);

create table public.fact_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  subject_type text not null check (subject_type in ('company', 'contact', 'project')),
  subject_id uuid not null,
  field_key text not null,
  value jsonb not null,
  status public.fact_status not null default 'found',
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  evidence_source_id uuid references public.evidence_sources(id) on delete set null,
  supersedes_id uuid references public.fact_revisions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  origin public.actor_origin not null,
  observed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  origin public.actor_origin not null,
  event_type text not null,
  object_type text not null,
  object_id uuid,
  summary text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.research_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_text text not null,
  event_date date,
  estimated_attendees integer check (estimated_attendees is null or estimated_attendees > 0),
  category text,
  needs jsonb not null default '[]',
  confirmed_context jsonb not null default '{}',
  estimated_context jsonb not null default '{}',
  unknown_context jsonb not null default '{}',
  status text not null default 'draft' check (
    status in ('draft', 'discovering', 'awaiting_selection', 'approved', 'running', 'completed')
  ),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  brief_id uuid not null references public.research_briefs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  domain text,
  summary text,
  fit_reason text,
  source_urls text[] not null default '{}',
  status text not null default 'proposed' check (
    status in ('proposed', 'selected', 'rejected', 'researched')
  ),
  selected_by uuid references public.profiles(id) on delete set null,
  selected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brief_id, name)
);

create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  candidate_id uuid not null references public.research_candidates(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  executive_summary text not null,
  background jsonb not null default '{}',
  risks jsonb not null default '[]',
  contact_strategy jsonb not null default '{}',
  source_ids uuid[] not null default '{}',
  status text not null default 'needs_review' check (
    status in ('needs_review', 'accepted', 'rejected')
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  job_type text not null,
  object_type text,
  object_id uuid,
  status public.ai_job_status not null default 'pending_approval',
  priority integer not null default 0,
  input jsonb not null default '{}',
  result jsonb,
  idempotency_key text not null,
  claimed_by text,
  claimed_until timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 2),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid references public.ai_jobs(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(10,6) not null default 0 check (cost_usd >= 0),
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table public.mail_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  gmail_account_id uuid not null references public.gmail_accounts(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  gmail_thread_id text not null,
  subject text not null,
  snippet text,
  labels text[] not null default '{}',
  last_message_at timestamptz,
  is_crm_linked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gmail_account_id, gmail_thread_id)
);

create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  gmail_message_id text not null,
  sender text not null,
  recipients text[] not null default '{}',
  cc text[] not null default '{}',
  subject text,
  snippet text,
  body_text text,
  body_html text,
  is_crm_linked boolean not null default false,
  attachment_links jsonb not null default '[]',
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (thread_id, gmail_message_id),
  check (body_text is null or is_crm_linked),
  check (body_html is null or is_crm_linked)
);

create table public.finance_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  currency text not null default 'CLP',
  fundraising_goal numeric(14,2) not null default 0,
  expense_budget numeric(14,2) not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  kind public.contribution_kind not null,
  status public.contribution_status not null default 'requested',
  description text,
  requested_value numeric(14,2) not null default 0,
  committed_value numeric(14,2) not null default 0,
  received_value numeric(14,2) not null default 0,
  currency text not null default 'CLP',
  expected_at date,
  received_at date,
  evidence_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null,
  category text,
  budgeted_value numeric(14,2) not null default 0,
  actual_value numeric(14,2) not null default 0,
  currency text not null default 'CLP',
  occurred_on date,
  evidence_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.followup_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_identity_id uuid not null references public.sender_identities(id) on delete cascade,
  status text not null default 'draft' check (
    status in ('draft', 'eligible', 'active', 'paused', 'archived')
  ),
  approved_followups integer not null default 0,
  sent_followups integer not null default 0,
  compliance_alerts integer not null default 0,
  activated_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sender_identity_id)
);

create table public.followup_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  step_number integer not null check (step_number between 1 and 3),
  interval_days integer not null check (interval_days >= 7),
  subject_template text,
  body_template text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sequence_id, step_number)
);

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function app_private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
      and membership.status = 'active'
  );
$$;

create or replace function app_private.can_write_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.projects project
    join public.workspace_members membership
      on membership.workspace_id = project.workspace_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    left join public.project_members project_member
      on project_member.project_id = project.id
     and project_member.user_id = (select auth.uid())
    where project.id = target_project_id
      and (
        project.owner_user_id = (select auth.uid())
        or (project.access_mode = 'shared' and coalesce(project_member.can_edit, true))
      )
  );
$$;

create or replace function app_private.can_use_gmail_account(
  target_account_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.gmail_accounts account
    left join public.gmail_account_permissions permission
      on permission.gmail_account_id = account.id
     and permission.user_id = (select auth.uid())
     and permission.active
    where account.id = target_account_id
      and account.active
      and app_private.is_workspace_member(account.workspace_id)
      and (
        account.owner_user_id = (select auth.uid())
        or permission.can_manage
        or (required_permission = 'read' and permission.can_read)
        or (required_permission = 'draft' and permission.can_draft)
        or (required_permission = 'send' and permission.can_send)
        or (required_permission = 'manage' and permission.can_manage)
      )
  );
$$;

revoke all on function app_private.is_workspace_member(uuid) from public;
revoke all on function app_private.is_workspace_owner(uuid) from public;
revoke all on function app_private.can_write_project(uuid) from public;
revoke all on function app_private.can_use_gmail_account(uuid, text) from public;
grant execute on function app_private.is_workspace_member(uuid) to authenticated;
grant execute on function app_private.is_workspace_owner(uuid) to authenticated;
grant execute on function app_private.can_write_project(uuid) to authenticated;
grant execute on function app_private.can_use_gmail_account(uuid, text) to authenticated;

-- Remove the legacy policy that gave every authenticated role every row.
do $$
declare
  table_name text;
  legacy_tables text[] := array[
    'campaigns', 'sender_accounts', 'campaign_sender_accounts', 'companies',
    'contacts', 'campaign_contacts', 'threads', 'messages', 'outbound_feedback',
    'import_batches', 'import_rows', 'evidence_links', 'suppression_list',
    'chat_threads', 'chat_messages', 'dom_tasks', 'dom_task_company_candidates',
    'company_research_cache', 'gmail_tokens', 'agent_inbox', 'ai_memory_rules',
    'ai_memory_events', 'automation_runs', 'pastoral_sheet_reservations'
  ];
begin
  foreach table_name in array legacy_tables loop
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default %L',
      table_name,
      '00000000-0000-4000-8000-000000000001'
    );
    execute format(
      'update public.%I set workspace_id = %L where workspace_id is null',
      table_name,
      '00000000-0000-4000-8000-000000000001'
    );
    execute format('alter table public.%I alter column workspace_id set not null', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "authenticated workspace access" on public.%I', table_name);
    execute format('drop policy if exists "v2 workspace select" on public.%I', table_name);
    execute format('drop policy if exists "v2 workspace insert" on public.%I', table_name);
    execute format('drop policy if exists "v2 workspace update" on public.%I', table_name);
    execute format('drop policy if exists "v2 workspace delete" on public.%I', table_name);
    execute format(
      'create policy "v2 workspace select" on public.%I for select to authenticated using (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "v2 workspace insert" on public.%I for insert to authenticated with check (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "v2 workspace update" on public.%I for update to authenticated using (app_private.is_workspace_member(workspace_id)) with check (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "v2 workspace delete" on public.%I for delete to authenticated using (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I (workspace_id)',
      table_name || '_workspace_id_idx',
      table_name
    );
  end loop;
end $$;

-- RLS for new V2 tables.
do $$
declare
  table_name text;
  workspace_tables text[] := array[
    'workspace_invitations', 'institutions', 'sender_identities',
    'project_companies', 'evidence_sources', 'fact_revisions', 'activity_events',
    'research_briefs', 'research_candidates', 'research_reports', 'ai_jobs',
    'ai_usage_ledger', 'finance_goals', 'contributions', 'expenses',
    'followup_sequences', 'followup_steps'
  ];
begin
  foreach table_name in array workspace_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "workspace members select" on public.%I for select to authenticated using (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "workspace members insert" on public.%I for insert to authenticated with check (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "workspace members update" on public.%I for update to authenticated using (app_private.is_workspace_member(workspace_id)) with check (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create policy "workspace members delete" on public.%I for delete to authenticated using (app_private.is_workspace_member(workspace_id))',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I (workspace_id)',
      table_name || '_workspace_id_idx',
      table_name
    );
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "profiles shared workspace select" on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = profiles.id
      and theirs.status = 'active'
  )
);
create policy "profiles self update" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

alter table public.workspaces enable row level security;
create policy "members view workspace" on public.workspaces
for select to authenticated using (app_private.is_workspace_member(id));

alter table public.workspace_members enable row level security;
create policy "members view teammates" on public.workspace_members
for select to authenticated using (app_private.is_workspace_member(workspace_id));

alter table public.projects enable row level security;
create policy "members view projects" on public.projects
for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "members create own projects" on public.projects
for insert to authenticated with check (
  owner_user_id = (select auth.uid())
  and app_private.is_workspace_member(workspace_id)
);
create policy "owners and collaborators update projects" on public.projects
for update to authenticated
using (app_private.can_write_project(id))
with check (app_private.can_write_project(id));
create policy "owners delete projects" on public.projects
for delete to authenticated using (owner_user_id = (select auth.uid()));

alter table public.project_members enable row level security;
create policy "members view project collaborators" on public.project_members
for select to authenticated using (app_private.can_write_project(project_id));
create policy "owners manage project collaborators" on public.project_members
for all to authenticated
using (
  exists (
    select 1 from public.projects project
    where project.id = project_id and project.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.projects project
    where project.id = project_id and project.owner_user_id = (select auth.uid())
  )
);

alter table public.gmail_accounts enable row level security;
create policy "permitted users view gmail accounts" on public.gmail_accounts
for select to authenticated using (app_private.can_use_gmail_account(id, 'read'));
create policy "owners connect gmail accounts" on public.gmail_accounts
for insert to authenticated with check (
  owner_user_id = (select auth.uid())
  and app_private.is_workspace_member(workspace_id)
);
create policy "gmail administrators update accounts" on public.gmail_accounts
for update to authenticated
using (app_private.can_use_gmail_account(id, 'manage'))
with check (app_private.can_use_gmail_account(id, 'manage'));

alter table public.gmail_account_permissions enable row level security;
create policy "workspace members view gmail permissions" on public.gmail_account_permissions
for select to authenticated using (
  exists (
    select 1 from public.gmail_accounts account
    where account.id = gmail_account_id
      and app_private.is_workspace_member(account.workspace_id)
  )
);
create policy "gmail administrators manage permissions" on public.gmail_account_permissions
for all to authenticated
using (app_private.can_use_gmail_account(gmail_account_id, 'manage'))
with check (app_private.can_use_gmail_account(gmail_account_id, 'manage'));

alter table public.mail_threads enable row level security;
create policy "permitted users view mail threads" on public.mail_threads
for select to authenticated using (
  app_private.is_workspace_member(workspace_id)
  and (project_id is not null or app_private.can_use_gmail_account(gmail_account_id, 'read'))
);
create policy "permitted users manage mail threads" on public.mail_threads
for all to authenticated
using (
  case
    when project_id is not null then app_private.can_write_project(project_id)
    else app_private.can_use_gmail_account(gmail_account_id, 'draft')
  end
)
with check (
  case
    when project_id is not null then app_private.can_write_project(project_id)
    else app_private.can_use_gmail_account(gmail_account_id, 'draft')
  end
);

alter table public.mail_messages enable row level security;
create policy "permitted users view mail messages" on public.mail_messages
for select to authenticated using (
  exists (
    select 1 from public.mail_threads thread
    where thread.id = thread_id
      and (
        thread.project_id is not null
        or app_private.can_use_gmail_account(thread.gmail_account_id, 'read')
      )
  )
);

create index workspace_members_user_idx on public.workspace_members (user_id, status);
create index projects_workspace_owner_idx on public.projects (workspace_id, owner_user_id, updated_at desc);
create index projects_access_mode_idx on public.projects (workspace_id, access_mode, status);
create index project_companies_project_stage_idx on public.project_companies (project_id, stage, priority desc);
create index fact_revisions_subject_idx on public.fact_revisions (subject_type, subject_id, field_key, created_at desc);
create index activity_events_project_created_idx on public.activity_events (project_id, created_at desc);
create index research_briefs_project_status_idx on public.research_briefs (project_id, status, updated_at desc);
create index ai_jobs_queue_idx on public.ai_jobs (status, priority desc, created_at);
create index ai_usage_ledger_month_idx on public.ai_usage_ledger (workspace_id, created_at, provider);
create index mail_threads_account_updated_idx on public.mail_threads (gmail_account_id, updated_at desc);
create index mail_threads_project_updated_idx on public.mail_threads (project_id, updated_at desc);
create index mail_messages_thread_date_idx on public.mail_messages (thread_id, coalesce(received_at, sent_at, created_at) desc);
create index contributions_project_status_idx on public.contributions (project_id, status);
create index expenses_project_date_idx on public.expenses (project_id, occurred_on desc);

grant select, insert, update, delete on all tables in schema public to authenticated;

-- OAuth credentials are server-only. RLS filters rows, but it does not hide columns.
revoke select on public.gmail_accounts from authenticated;
grant select (
  id, workspace_id, owner_user_id, email, display_name, expires_at,
  history_id, sync_status, initial_sync_after, last_synced_at, active,
  created_at, updated_at
) on public.gmail_accounts to authenticated;
