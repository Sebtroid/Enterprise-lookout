create extension if not exists "pgcrypto";
create extension if not exists "citext";

create type campaign_status as enum ('draft', 'active', 'paused', 'archived');
create type sender_account_status as enum ('active', 'paused', 'disabled');
create type campaign_contact_status as enum (
  'new',
  'needs_research',
  'qualified',
  'ready_to_draft',
  'draft_ready',
  'approved_to_send',
  'sent',
  'replied',
  'followup_due',
  'closed_positive',
  'closed_negative',
  'do_not_contact'
);
create type message_status as enum ('needs_review', 'approved', 'rejected', 'sent', 'failed');
create type message_kind as enum ('outbound_initial', 'outbound_followup', 'inbound_reply', 'outbound_reply');
create type import_status as enum ('uploaded', 'parsed', 'needs_review', 'applied', 'failed');
create type automation_status as enum ('running', 'succeeded', 'failed', 'skipped');
create type contact_verification_status as enum ('unverified', 'verified', 'bounced', 'invalid');
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
create type chat_message_role as enum ('user', 'dom', 'system');
create type agent_event_status as enum ('pending', 'in_progress', 'completed', 'failed');
create type agent_event_priority as enum ('low', 'normal', 'high', 'urgent');

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  organization text not null,
  description text,
  value_proposition text,
  status campaign_status not null default 'draft',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sender_accounts (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text not null,
  organization text,
  account_type text not null default 'gmail',
  signature text,
  status sender_account_status not null default 'active',
  daily_limit integer not null default 15 check (daily_limit > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_sender_accounts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  sender_account_id uuid not null references sender_accounts(id) on delete restrict,
  priority integer not null default 1,
  campaign_daily_limit integer not null default 15 check (campaign_daily_limit > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_id, sender_account_id)
);

create unique index one_default_sender_per_campaign
  on campaign_sender_accounts (campaign_id)
  where is_default;

create table companies (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  domain text,
  website text,
  industry text,
  region text,
  description text,
  global_notes text,
  quality_rating smallint not null default 3 check (quality_rating >= 1 and quality_rating <= 5),
  quality_notes text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name),
  unique (domain)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  full_name text not null,
  normalized_name text not null,
  role text,
  category text,
  seniority text,
  email citext,
  phone text,
  linkedin_url text,
  source text,
  confidence numeric(4, 3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  verification_status contact_verification_status not null default 'unverified',
  verified_at timestamptz,
  last_bounced_at timestamptz,
  bounce_count integer not null default 0,
  is_decision_maker boolean not null default false,
  do_not_contact boolean not null default false,
  global_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  fit_score integer not null default 0 check (fit_score >= 0 and fit_score <= 100),
  priority_score integer not null default 0,
  status campaign_contact_status not null default 'new',
  selected_contact_reason text,
  campaign_notes text,
  future_notes text,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, company_id, contact_id)
);

create table threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  sender_account_id uuid not null references sender_accounts(id) on delete restrict,
  gmail_thread_id text,
  subject text not null,
  status text not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  sender_account_id uuid not null references sender_accounts(id) on delete restrict,
  kind message_kind not null,
  status message_status not null default 'needs_review',
  subject_draft text,
  body_draft text,
  subject_final text,
  body_final text,
  gmail_message_id text,
  gmail_draft_id text,
  gmail_thread_id text,
  reply_classification text,
  future_note text,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outbound_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  reason text not null check (reason in ('company_not_fit', 'bad_copy')),
  comment text,
  remember_for_future boolean not null default false,
  created_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  source_name text not null,
  source_type text not null,
  status import_status not null default 'uploaded',
  row_count integer not null default 0,
  applied_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null,
  normalized_data jsonb,
  duplicate_company_id uuid references companies(id) on delete set null,
  duplicate_contact_id uuid references contacts(id) on delete set null,
  resolution text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  unique (import_batch_id, row_index)
);

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  url text not null,
  title text,
  note text,
  confidence numeric(4, 3) not null default 0.5,
  created_at timestamptz not null default now()
);

create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  email citext,
  domain text,
  reason text not null,
  created_at timestamptz not null default now()
);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role chat_message_role not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table dom_tasks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  description text not null,
  status dom_task_status not null default 'pending',
  created_by text not null check (created_by in ('user', 'dom', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  context jsonb,
  result text,
  chat_thread_id uuid references chat_threads(id) on delete set null,
  progress_step text,
  progress_message text,
  progress_percent integer check (
    progress_percent is null
    or (progress_percent >= 0 and progress_percent <= 100)
  ),
  result_preview text,
  last_progress_at timestamptz
);

create table dom_task_company_candidates (
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

create table company_research_cache (
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

create table gmail_tokens (
  id uuid primary key default gen_random_uuid(),
  user_email citext not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_inbox (
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

create table ai_memory_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'campaign' check (
    scope in ('global', 'campaign', 'company', 'contact', 'sender')
  ),
  rule_type text not null default 'general',
  rule_text text not null,
  campaign_id uuid references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  sender_account_id uuid references sender_accounts(id) on delete cascade,
  source text,
  source_feedback_id uuid references outbound_feedback(id) on delete set null,
  confidence numeric(4, 3) not null default 0.8 check (
    confidence >= 0 and confidence <= 1
  ),
  active boolean not null default true,
  created_by text not null default 'custom_gpt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  job_name text not null,
  status automation_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  input_summary jsonb,
  output_summary jsonb,
  error text
);

create index campaign_contacts_status_idx on campaign_contacts (campaign_id, status);
create index campaign_contacts_company_idx on campaign_contacts (company_id, updated_at desc);
create index campaign_contacts_campaign_company_idx on campaign_contacts (campaign_id, company_id);
create index campaigns_organization_idx on campaigns (organization);
create index messages_review_idx on messages (campaign_id, status, kind);
create index messages_sender_status_idx on messages (sender_account_id, status, sent_at);
create unique index messages_gmail_message_id_unique
  on messages (gmail_message_id)
  where gmail_message_id is not null;
create index outbound_feedback_campaign_idx on outbound_feedback (campaign_id, remember_for_future, created_at desc);
create index threads_gmail_idx on threads (gmail_thread_id);
create index contacts_company_idx on contacts (company_id);
create index evidence_links_company_idx on evidence_links (company_id);
create index suppression_email_idx on suppression_list (email);
create index suppression_domain_idx on suppression_list (domain);
create index chat_messages_thread_created_idx on chat_messages (thread_id, created_at);
create index dom_tasks_campaign_status_idx on dom_tasks (campaign_id, status, updated_at desc);
create index dom_task_company_candidates_task_idx on dom_task_company_candidates (task_id, status, updated_at desc);
create index dom_task_company_candidates_campaign_idx on dom_task_company_candidates (campaign_id, status, updated_at desc);
create index company_research_cache_company_idx on company_research_cache (company_id, research_type, expires_at);
create index agent_inbox_status_priority_idx on agent_inbox (status, priority, created_at);
create index agent_inbox_campaign_idx on agent_inbox (campaign_id, status);
create index agent_inbox_created_idx on agent_inbox (created_at desc);
create index ai_memory_rules_campaign_idx on ai_memory_rules (campaign_id, active, updated_at desc);
create index ai_memory_rules_scope_idx on ai_memory_rules (scope, rule_type, active);

alter table campaigns enable row level security;
alter table sender_accounts enable row level security;
alter table campaign_sender_accounts enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table campaign_contacts enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table outbound_feedback enable row level security;
alter table import_batches enable row level security;
alter table import_rows enable row level security;
alter table evidence_links enable row level security;
alter table suppression_list enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table dom_tasks enable row level security;
alter table dom_task_company_candidates enable row level security;
alter table company_research_cache enable row level security;
alter table gmail_tokens enable row level security;
alter table agent_inbox enable row level security;
alter table ai_memory_rules enable row level security;
alter table automation_runs enable row level security;

-- V1 policy: authenticated users can operate the private workspace.
-- Restrict further with an allowed-user table before inviting more people.
create policy "authenticated workspace access" on campaigns for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on sender_accounts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on campaign_sender_accounts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on companies for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on contacts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on campaign_contacts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on threads for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on messages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on outbound_feedback for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on import_batches for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on import_rows for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on evidence_links for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on suppression_list for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on chat_threads for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on chat_messages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on dom_tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on dom_task_company_candidates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on company_research_cache for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on gmail_tokens for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on agent_inbox for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on ai_memory_rules for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated workspace access" on automation_runs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on chat_threads to authenticated;
grant select, insert, update, delete on chat_messages to authenticated;
grant select, insert, update, delete on dom_tasks to authenticated;
grant select, insert, update, delete on dom_task_company_candidates to authenticated;
grant select, insert, update, delete on company_research_cache to authenticated;
grant select, insert, update, delete on gmail_tokens to authenticated;
grant select, insert, update, delete on agent_inbox to authenticated;
grant select, insert, update, delete on ai_memory_rules to authenticated;
