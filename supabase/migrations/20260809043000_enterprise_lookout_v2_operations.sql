-- Enterprise Lookout V2: operational records and authenticated tool connections.

alter table public.research_reports
  add column if not exists created_by_origin public.actor_origin not null default 'migration',
  add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

create table public.tool_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('chatgpt', 'codex', 'automation')),
  label text not null,
  token_hash text not null unique,
  scopes text[] not null default array['workspace:read']::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  resource text not null,
  scopes text[] not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.idempotency_records (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null,
  operation text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_id, idempotency_key)
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz,
  source text not null default 'user' check (source in ('user', 'chatgpt', 'minimax', 'gmail', 'system', 'migration')),
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  notes text,
  outcome text,
  source_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  url text not null,
  kind text not null default 'link' check (kind in ('link', 'receipt', 'gmail_attachment', 'document')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mail_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  thread_id uuid references public.mail_threads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  sender_identity_id uuid references public.sender_identities(id) on delete restrict,
  kind text not null default 'first_contact' check (kind in ('first_contact', 'reply', 'followup')),
  subject text not null default '',
  to_email citext,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'sending', 'sent', 'failed')),
  created_by_origin public.actor_origin not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_gmail_message_id text,
  send_claimed_at timestamptz,
  send_error text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table public.ai_feedback_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  rule text not null,
  source_example text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email citext,
  domain citext,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'do_not_contact', 'identity_conflict', 'manual')),
  source text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null)
);

create table public.legacy_quarantine (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_table text not null,
  source_id text,
  reason text not null,
  payload jsonb not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  disposition text check (disposition in ('kept', 'restored', 'discarded')),
  created_at timestamptz not null default now()
);

create table public.followup_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.followup_sequences(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid references public.mail_threads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  to_email citext not null,
  next_step integer not null default 1 check (next_step between 1 and 3),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'drafted', 'completed', 'stopped')),
  stopped_reason text,
  last_draft_id uuid references public.mail_drafts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, thread_id)
);

create index tool_connections_token_idx on public.tool_connections (token_hash) where revoked_at is null;
create index tool_connections_user_idx on public.tool_connections (user_id, workspace_id);
create index oauth_authorization_codes_expiry_idx on public.oauth_authorization_codes (expires_at) where used_at is null;
create index idempotency_records_created_idx on public.idempotency_records (workspace_id, created_at desc);
create index project_tasks_queue_idx on public.project_tasks (workspace_id, assigned_to, status, due_at);
create index meetings_context_idx on public.meetings (workspace_id, project_id, starts_at desc);
create index project_links_project_idx on public.project_links (workspace_id, project_id);
create index mail_drafts_review_idx on public.mail_drafts (workspace_id, status, created_at desc);
create index ai_feedback_rules_context_idx on public.ai_feedback_rules (workspace_id, project_id, active);
create index suppression_entries_email_idx on public.suppression_entries (workspace_id, email) where email is not null;
create index suppression_entries_domain_idx on public.suppression_entries (workspace_id, domain) where domain is not null;
create index legacy_quarantine_review_idx on public.legacy_quarantine (workspace_id, reviewed_at) where reviewed_at is null;
create index followup_enrollments_due_idx on public.followup_enrollments (status, due_at) where status = 'pending';

alter table public.tool_connections enable row level security;
alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.project_tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.project_links enable row level security;
alter table public.mail_drafts enable row level security;
alter table public.ai_feedback_rules enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.legacy_quarantine enable row level security;
alter table public.followup_enrollments enable row level security;

create policy "members manage own tool connections" on public.tool_connections
  for all to authenticated
  using (user_id = (select auth.uid()) and app_private.is_workspace_member(workspace_id))
  with check (user_id = (select auth.uid()) and app_private.is_workspace_member(workspace_id));

create policy "members view own idempotency records" on public.idempotency_records
  for select to authenticated
  using (actor_user_id = (select auth.uid()) and app_private.is_workspace_member(workspace_id));

create policy "members view project tasks" on public.project_tasks
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "project editors manage tasks" on public.project_tasks
  for all to authenticated using (app_private.can_write_project(project_id)) with check (app_private.can_write_project(project_id));

create policy "members view meetings" on public.meetings
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "project editors manage meetings" on public.meetings
  for all to authenticated using (project_id is not null and app_private.can_write_project(project_id)) with check (project_id is not null and app_private.can_write_project(project_id));

create policy "members view project links" on public.project_links
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "project editors manage links" on public.project_links
  for all to authenticated using (app_private.can_write_project(project_id)) with check (app_private.can_write_project(project_id));

create policy "members view permitted drafts" on public.mail_drafts
  for select to authenticated using (
    app_private.is_workspace_member(workspace_id)
    and (sender_identity_id is null or exists (
      select 1 from public.sender_identities identity
      where identity.id = mail_drafts.sender_identity_id
        and app_private.can_use_gmail_account(identity.gmail_account_id, 'draft')
    ))
  );
create policy "project editors manage drafts" on public.mail_drafts
  for all to authenticated using (
    project_id is not null and app_private.can_write_project(project_id)
  ) with check (
    project_id is not null and app_private.can_write_project(project_id)
    and (sender_identity_id is null or exists (
      select 1 from public.sender_identities identity
      where identity.id = mail_drafts.sender_identity_id
        and app_private.can_use_gmail_account(identity.gmail_account_id, 'draft')
    ))
  );

create policy "members view feedback rules" on public.ai_feedback_rules
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "project editors manage feedback rules" on public.ai_feedback_rules
  for all to authenticated using (
    created_by = (select auth.uid()) and (project_id is null or app_private.can_write_project(project_id))
  ) with check (
    created_by = (select auth.uid()) and app_private.is_workspace_member(workspace_id)
    and (project_id is null or app_private.can_write_project(project_id))
  );

create policy "members view suppressions" on public.suppression_entries
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "members add suppressions" on public.suppression_entries
  for insert to authenticated with check (app_private.is_workspace_member(workspace_id) and created_by = (select auth.uid()));

create policy "members review quarantine" on public.legacy_quarantine
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "workspace owners manage quarantine" on public.legacy_quarantine
  for update to authenticated using (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = legacy_quarantine.workspace_id and wm.user_id = (select auth.uid()) and wm.role = 'owner' and wm.status = 'active')
  ) with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = legacy_quarantine.workspace_id and wm.user_id = (select auth.uid()) and wm.role = 'owner' and wm.status = 'active')
  );

create policy "members view followup enrollments" on public.followup_enrollments
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy "project editors manage followup enrollments" on public.followup_enrollments
  for all to authenticated using (app_private.can_write_project(project_id)) with check (app_private.can_write_project(project_id));

revoke all on public.tool_connections, public.idempotency_records from anon;
revoke all on public.oauth_clients, public.oauth_authorization_codes from anon, authenticated;
grant select, insert, update, delete on public.tool_connections to authenticated;
grant select on public.idempotency_records to authenticated;
grant select, insert, update, delete on public.project_tasks, public.meetings, public.project_links to authenticated;
grant select, insert, update, delete on public.mail_drafts, public.ai_feedback_rules to authenticated;
grant select, insert on public.suppression_entries to authenticated;
grant select, update on public.legacy_quarantine to authenticated;
grant select, insert, update, delete on public.followup_enrollments to authenticated;

revoke select on public.tool_connections from authenticated;
grant select (id, workspace_id, user_id, provider, label, scopes, last_used_at, expires_at, revoked_at, created_at)
  on public.tool_connections to authenticated;
