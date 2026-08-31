-- Cover V2 operational foreign keys and the filters used by the main workspace
-- screens/workers. Nullable FK indexes exclude NULL because NULL cannot match a
-- referenced row; status-specific indexes stay small and match their hot query.

-- Private OAuth/Vault support.
create index if not exists gmail_oauth_nonces_workspace_idx
  on app_private.gmail_oauth_nonces (workspace_id);
create index if not exists gmail_oauth_nonces_user_idx
  on app_private.gmail_oauth_nonces (user_id);
create index if not exists workspace_vault_secrets_updated_by_idx
  on app_private.workspace_vault_secrets (updated_by)
  where updated_by is not null;

-- Workspace, project and CRM ownership/join paths.
create index if not exists workspace_members_invited_by_idx
  on public.workspace_members (invited_by)
  where invited_by is not null;
create index if not exists workspace_members_active_selection_idx
  on public.workspace_members (user_id, joined_at, workspace_id)
  where status = 'active';

create index if not exists projects_owner_user_idx
  on public.projects (owner_user_id);
create index if not exists projects_institution_idx
  on public.projects (institution_id)
  where institution_id is not null;
create index if not exists projects_default_sender_identity_idx
  on public.projects (default_sender_identity_id)
  where default_sender_identity_id is not null;
create index if not exists projects_active_updated_idx
  on public.projects (workspace_id, updated_at desc)
  where status <> 'archived';

create index if not exists project_members_user_idx
  on public.project_members (user_id);
create index if not exists project_companies_company_idx
  on public.project_companies (company_id);
create index if not exists project_companies_primary_contact_idx
  on public.project_companies (primary_contact_id)
  where primary_contact_id is not null;

-- Connected accounts, identities and mailbox paths.
create index if not exists gmail_accounts_owner_user_idx
  on public.gmail_accounts (owner_user_id);
create index if not exists gmail_account_permissions_user_idx
  on public.gmail_account_permissions (user_id);
create index if not exists gmail_account_permissions_user_active_idx
  on public.gmail_account_permissions (user_id, gmail_account_id)
  where active;
create index if not exists gmail_account_permissions_granted_by_idx
  on public.gmail_account_permissions (granted_by)
  where granted_by is not null;

create index if not exists sender_identities_user_idx
  on public.sender_identities (user_id);
create index if not exists sender_identities_user_active_idx
  on public.sender_identities (workspace_id, user_id)
  where active;
create index if not exists sender_identities_institution_idx
  on public.sender_identities (institution_id)
  where institution_id is not null;
create index if not exists sender_identities_gmail_account_idx
  on public.sender_identities (gmail_account_id)
  where gmail_account_id is not null;

create index if not exists mail_threads_company_idx
  on public.mail_threads (company_id)
  where company_id is not null;
create index if not exists mail_threads_contact_idx
  on public.mail_threads (contact_id)
  where contact_id is not null;
create index if not exists mail_threads_workspace_last_message_idx
  on public.mail_threads (workspace_id, last_message_at desc);

create index if not exists mail_messages_workspace_crm_created_idx
  on public.mail_messages (workspace_id, is_crm_linked, created_at);

create index if not exists mail_drafts_project_idx
  on public.mail_drafts (project_id)
  where project_id is not null;
create index if not exists mail_drafts_thread_idx
  on public.mail_drafts (thread_id)
  where thread_id is not null;
create index if not exists mail_drafts_company_idx
  on public.mail_drafts (company_id)
  where company_id is not null;
create index if not exists mail_drafts_contact_idx
  on public.mail_drafts (contact_id)
  where contact_id is not null;
create index if not exists mail_drafts_sender_identity_idx
  on public.mail_drafts (sender_identity_id)
  where sender_identity_id is not null;
create index if not exists mail_drafts_created_by_user_idx
  on public.mail_drafts (created_by_user_id)
  where created_by_user_id is not null;
create index if not exists mail_drafts_approved_by_idx
  on public.mail_drafts (approved_by)
  where approved_by is not null;
create index if not exists mail_drafts_workspace_actionable_idx
  on public.mail_drafts (workspace_id, updated_at desc)
  where status in ('draft', 'needs_review', 'approved', 'failed');

-- AI queue, spend and activity feed.
create index if not exists ai_jobs_project_idx
  on public.ai_jobs (project_id)
  where project_id is not null;
create index if not exists ai_jobs_requested_by_idx
  on public.ai_jobs (requested_by)
  where requested_by is not null;
create index if not exists ai_jobs_approved_by_idx
  on public.ai_jobs (approved_by)
  where approved_by is not null;
create index if not exists ai_jobs_workspace_status_updated_idx
  on public.ai_jobs (workspace_id, status, updated_at desc);
create index if not exists ai_jobs_approved_queue_idx
  on public.ai_jobs (priority desc, created_at)
  where status = 'approved';

create index if not exists ai_usage_ledger_job_idx
  on public.ai_usage_ledger (job_id)
  where job_id is not null;
create index if not exists activity_events_actor_user_idx
  on public.activity_events (actor_user_id)
  where actor_user_id is not null;
create index if not exists activity_events_workspace_created_idx
  on public.activity_events (workspace_id, created_at desc);

-- Research pipeline.
create index if not exists research_briefs_created_by_idx
  on public.research_briefs (created_by);
create index if not exists research_candidates_project_idx
  on public.research_candidates (project_id);
create index if not exists research_candidates_company_idx
  on public.research_candidates (company_id)
  where company_id is not null;
create index if not exists research_candidates_selected_by_idx
  on public.research_candidates (selected_by)
  where selected_by is not null;
create index if not exists research_candidates_brief_created_idx
  on public.research_candidates (brief_id, created_at);

create index if not exists research_reports_project_idx
  on public.research_reports (project_id);
create index if not exists research_reports_candidate_idx
  on public.research_reports (candidate_id);
create index if not exists research_reports_company_idx
  on public.research_reports (company_id)
  where company_id is not null;
create index if not exists research_reports_created_by_user_idx
  on public.research_reports (created_by_user_id)
  where created_by_user_id is not null;
create index if not exists research_reports_reviewed_by_idx
  on public.research_reports (reviewed_by)
  where reviewed_by is not null;

-- Tasks, meetings and follow-up automation.
create index if not exists project_tasks_project_idx
  on public.project_tasks (project_id);
create index if not exists project_tasks_assigned_to_idx
  on public.project_tasks (assigned_to)
  where assigned_to is not null;
create index if not exists project_tasks_created_by_idx
  on public.project_tasks (created_by)
  where created_by is not null;
create index if not exists project_tasks_workspace_open_due_idx
  on public.project_tasks (workspace_id, due_at)
  where status in ('pending', 'in_progress');

create index if not exists meetings_project_idx
  on public.meetings (project_id)
  where project_id is not null;
create index if not exists meetings_company_idx
  on public.meetings (company_id)
  where company_id is not null;
create index if not exists meetings_contact_idx
  on public.meetings (contact_id)
  where contact_id is not null;
create index if not exists meetings_created_by_idx
  on public.meetings (created_by)
  where created_by is not null;
create index if not exists meetings_workspace_starts_idx
  on public.meetings (workspace_id, starts_at desc);

create index if not exists followup_sequences_sender_identity_idx
  on public.followup_sequences (sender_identity_id);
create index if not exists followup_sequences_activated_by_idx
  on public.followup_sequences (activated_by)
  where activated_by is not null;
create index if not exists followup_steps_approved_by_idx
  on public.followup_steps (approved_by)
  where approved_by is not null;

create index if not exists followup_enrollments_project_idx
  on public.followup_enrollments (project_id);
create index if not exists followup_enrollments_company_idx
  on public.followup_enrollments (company_id)
  where company_id is not null;
create index if not exists followup_enrollments_contact_idx
  on public.followup_enrollments (contact_id)
  where contact_id is not null;
create index if not exists followup_enrollments_thread_idx
  on public.followup_enrollments (thread_id)
  where thread_id is not null;
create index if not exists followup_enrollments_last_draft_idx
  on public.followup_enrollments (last_draft_id)
  where last_draft_id is not null;

-- Financial audit references.
create index if not exists finance_goals_updated_by_idx
  on public.finance_goals (updated_by)
  where updated_by is not null;
create index if not exists contributions_company_idx
  on public.contributions (company_id)
  where company_id is not null;
create index if not exists contributions_contact_idx
  on public.contributions (contact_id)
  where contact_id is not null;
create index if not exists contributions_created_by_idx
  on public.contributions (created_by)
  where created_by is not null;
create index if not exists expenses_created_by_idx
  on public.expenses (created_by)
  where created_by is not null;

-- Migration 056 added this same definition under a clearer scope-aware name.
drop index if exists public.project_links_project_idx;
