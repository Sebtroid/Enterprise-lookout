import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith("_operational_v2_indexes.sql"),
);
const migration = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), "utf8").toLowerCase()
  : "";

const expectedIndexes = [
  "gmail_oauth_nonces_workspace_idx",
  "gmail_oauth_nonces_user_idx",
  "workspace_vault_secrets_updated_by_idx",
  "workspace_members_invited_by_idx",
  "projects_owner_user_idx",
  "projects_institution_idx",
  "projects_default_sender_identity_idx",
  "project_members_user_idx",
  "project_companies_company_idx",
  "project_companies_primary_contact_idx",
  "gmail_accounts_owner_user_idx",
  "gmail_account_permissions_user_idx",
  "gmail_account_permissions_user_active_idx",
  "gmail_account_permissions_granted_by_idx",
  "sender_identities_user_idx",
  "sender_identities_user_active_idx",
  "sender_identities_institution_idx",
  "sender_identities_gmail_account_idx",
  "mail_threads_company_idx",
  "mail_threads_contact_idx",
  "mail_messages_workspace_crm_created_idx",
  "mail_drafts_project_idx",
  "mail_drafts_thread_idx",
  "mail_drafts_company_idx",
  "mail_drafts_contact_idx",
  "mail_drafts_sender_identity_idx",
  "mail_drafts_created_by_user_idx",
  "mail_drafts_approved_by_idx",
  "ai_jobs_project_idx",
  "ai_jobs_requested_by_idx",
  "ai_jobs_approved_by_idx",
  "ai_usage_ledger_job_idx",
  "activity_events_actor_user_idx",
  "research_briefs_created_by_idx",
  "research_candidates_project_idx",
  "research_candidates_company_idx",
  "research_candidates_selected_by_idx",
  "research_reports_project_idx",
  "research_reports_candidate_idx",
  "research_reports_company_idx",
  "research_reports_created_by_user_idx",
  "research_reports_reviewed_by_idx",
  "project_tasks_project_idx",
  "project_tasks_assigned_to_idx",
  "project_tasks_created_by_idx",
  "meetings_project_idx",
  "meetings_company_idx",
  "meetings_contact_idx",
  "meetings_created_by_idx",
  "followup_sequences_sender_identity_idx",
  "followup_sequences_activated_by_idx",
  "followup_steps_approved_by_idx",
  "followup_enrollments_project_idx",
  "followup_enrollments_company_idx",
  "followup_enrollments_contact_idx",
  "followup_enrollments_thread_idx",
  "followup_enrollments_last_draft_idx",
  "finance_goals_updated_by_idx",
  "contributions_company_idx",
  "contributions_contact_idx",
  "contributions_created_by_idx",
  "expenses_created_by_idx",
] as const;

describe("V2 operational indexes migration", () => {
  it("covers the hot operational foreign-key paths reported by the database advisor", () => {
    expect(existsSync(join(migrationsDirectory, migrationName ?? "missing"))).toBe(true);
    for (const indexName of expectedIndexes) {
      expect(migration, `missing ${indexName}`).toContain(`index if not exists ${indexName}`);
    }
  });

  it("uses partial indexes for nullable relationships and hot queue/list filters", () => {
    expect(migration).toMatch(
      /projects_active_updated_idx[\s\S]*?where status <> 'archived'/,
    );
    expect(migration).toMatch(
      /mail_messages_workspace_crm_created_idx[\s\S]*?\(workspace_id, is_crm_linked, created_at\)/,
    );
    expect(migration).toMatch(
      /mail_drafts_workspace_actionable_idx[\s\S]*?where status in \('draft', 'needs_review', 'approved', 'failed'\)/,
    );
    expect(migration).toMatch(
      /workspace_vault_secrets_updated_by_idx[\s\S]*?where updated_by is not null/,
    );
  });

  it("removes only the known duplicate project-links index", () => {
    expect(migration).toContain("drop index if exists public.project_links_project_idx");
    expect(migration).not.toMatch(/drop index if exists public\.(?!project_links_project_idx)/);
  });
});
