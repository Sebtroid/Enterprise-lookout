import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260809041123_enterprise_lookout_v2_foundation.sql",
  ),
  "utf8",
).toLowerCase();
const hardening = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809052000_rls_hardening.sql"),
  "utf8",
).toLowerCase();

describe("Enterprise Lookout V2 schema", () => {
  it("defines the workspace, project, evidence, mail, AI and finance domains", () => {
    for (const table of [
      "profiles",
      "workspaces",
      "workspace_members",
      "projects",
      "gmail_accounts",
      "gmail_account_permissions",
      "fact_revisions",
      "research_briefs",
      "ai_jobs",
      "mail_threads",
      "contributions",
      "expenses",
      "followup_sequences",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
    }
  });

  it("enables RLS and removes the legacy authenticated-everything policies", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      'drop policy if exists "authenticated workspace access"',
    );
    expect(migration).not.toContain("auth.role()");
  });

  it("enforces the approved follow-up and CRM mail constraints", () => {
    expect(migration).toContain("interval_days >= 7");
    expect(migration).toContain("step_number between 1 and 3");
    expect(migration).toContain("body_text is null or is_crm_linked");
  });

  it("makes project mutations owner-aware and ledgers immutable", () => {
    expect(hardening).toContain("app_private.can_write_project(project_id)");
    expect(hardening).toContain("revoke insert, update, delete on public.activity_events");
    expect(hardening).toContain("revoke update, delete on public.evidence_sources, public.fact_revisions");
    expect(hardening).toContain("owners create invitations");
  });
});
