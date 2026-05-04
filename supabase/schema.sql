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
  global_notes text,
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
create index messages_review_idx on messages (campaign_id, status, kind);
create index messages_sender_status_idx on messages (sender_account_id, status, sent_at);
create unique index messages_gmail_message_id_unique
  on messages (gmail_message_id)
  where gmail_message_id is not null;
create index outbound_feedback_campaign_idx on outbound_feedback (campaign_id, remember_for_future, created_at desc);
create index threads_gmail_idx on threads (gmail_thread_id);
create index contacts_company_idx on contacts (company_id);
create index suppression_email_idx on suppression_list (email);
create index suppression_domain_idx on suppression_list (domain);

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
create policy "authenticated workspace access" on automation_runs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
