import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260831010326_microsoft_365_accounts.sql"),
  "utf8",
).toLowerCase();

describe("Microsoft 365 schema migration", () => {
  it("stores Microsoft accounts and granular permissions behind RLS", () => {
    expect(migration).toContain("create table public.microsoft_accounts");
    expect(migration).toContain("create table public.microsoft_account_permissions");
    expect(migration).toContain("alter table public.microsoft_accounts enable row level security");
    expect(migration).toContain("alter table public.microsoft_account_permissions enable row level security");
    expect(migration).toContain("can_read boolean");
    expect(migration).toContain("can_draft boolean");
    expect(migration).toContain("can_send boolean");
    expect(migration).toContain("can_manage boolean");
  });

  it("makes provider ownership exclusive for identities, threads and messages", () => {
    expect(migration).toMatch(/sender_identities[\s\S]*?microsoft_account_id/);
    expect(migration).toContain("sender_identities_exactly_one_mail_provider");
    expect(migration).toContain("mail_threads_exactly_one_mail_provider");
    expect(migration).toContain("mail_threads_exactly_one_provider_thread_id");
    expect(migration).toContain("mail_threads_provider_fields_match");
    expect(migration).toContain("mail_messages_exactly_one_provider_message_id");
    expect(migration).toContain("microsoft_accounts_workspace_id_id_key");
    expect(migration).toContain("sender_identities_workspace_microsoft_account_fk");
    expect(migration).toContain("mail_threads_workspace_microsoft_account_fk");
    expect(migration).toContain("microsoft_permissions_workspace_account_fk");
    expect(migration).toContain("microsoft_permissions_workspace_user_fk");
    expect(migration).toContain("enforce_mail_message_provider_matches_thread");
    expect(migration).toContain("detach_sender_identities_before_account_delete");
    expect(migration).toMatch(/not active[\s\S]*gmail_account_id is null[\s\S]*microsoft_account_id is null/);
  });

  it("keeps OAuth nonces private and service-role only", () => {
    expect(migration).toContain("app_private.microsoft_oauth_nonces");
    expect(migration).toContain("consume_microsoft_oauth_nonce");
    expect(migration).toContain("grant execute on function public.consume_microsoft_oauth_nonce");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("revoke all on app_private.microsoft_oauth_nonces from public, anon, authenticated");
  });

  it("authorizes Microsoft sender assignment with the same draft and send permissions as Gmail", () => {
    expect(migration).toContain("create or replace function app_private.can_assign_draft_sender");
    expect(migration).toContain("permission.can_draft");
    expect(migration).toContain("permission.can_send");
    expect(migration).toContain("identity.microsoft_account_id");
    expect(migration).toContain("app_private.can_use_microsoft_account");
  });
});
