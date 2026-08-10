import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260809057000_workspace_settings_vault.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

const allowedSecrets = [
  "supabase-db-password",
  "gmail-client-id",
  "gmail-client-secret",
  "gmail-token-encryption-key",
  "microsoft-client-id",
  "microsoft-client-secret",
  "microsoft-tenant-id",
  "minimax-api-key",
  "minimax-model",
  "hunter-api-key",
  "cron-secret",
];

describe("workspace settings and Vault schema", () => {
  it("persists a seeded USD 5 MiniMax budget with member-read and owner-write RLS", () => {
    expect(migration).toContain("create table public.workspace_ai_settings");
    expect(migration).toContain("minimax_monthly_budget_usd numeric");
    expect(migration).toMatch(/values \([\s\S]*?5(?:\.00)?[\s\S]*?on conflict \(workspace_id\) do nothing/);
    expect(migration).toContain("alter table public.workspace_ai_settings enable row level security");
    expect(migration).toMatch(/for select to authenticated[\s\S]*?app_private\.is_workspace_member\(workspace_id\)/);
    expect(migration).toMatch(/for (?:insert|all) to authenticated[\s\S]*?app_private\.is_workspace_owner\(workspace_id\)/);
    expect(migration).toMatch(/for update to authenticated[\s\S]*?app_private\.is_workspace_owner\(workspace_id\)[\s\S]*?with check \(app_private\.is_workspace_owner\(workspace_id\)\)/);
    expect(migration).toContain("grant select, insert, update on public.workspace_ai_settings to authenticated");
  });

  it("maps only allowlisted workspace secrets to Supabase Vault", () => {
    expect(migration).toContain("create table app_private.workspace_vault_secrets");
    expect(migration).toContain("vault_secret_id uuid not null");
    for (const key of allowedSecrets) expect(migration).toContain(`'${key}'`);
    expect(migration).toContain("vault.create_secret");
    expect(migration).toContain("vault.update_secret");
    expect(migration).toContain("vault.decrypted_secrets");
  });

  it("exposes authenticated owner-only status, replace and reveal RPCs without listing values", () => {
    for (const fn of ["workspace_secret_status", "replace_workspace_secret", "reveal_workspace_secret"]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
      expect(migration).toMatch(new RegExp(`public\\.${fn}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public, anon`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`));
    }
    expect(migration).toContain("app_private.is_workspace_owner(target_workspace_id)");
    const statusFunction = migration.match(/create or replace function public\.workspace_secret_status[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect(statusFunction).not.toContain("decrypted_secret");
  });

  it("keeps the internal secret reader service-role-only", () => {
    expect(migration).toContain("create or replace function app_private.get_workspace_secret");
    expect(migration).toContain("grant usage on schema app_private to service_role");
    expect(migration).toMatch(/revoke all on function app_private\.get_workspace_secret[\s\S]*?from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function app_private\.get_workspace_secret[\s\S]*?to service_role/);
  });

  it("hardens anon/default privileges and pins the memory matcher search_path", () => {
    expect(migration).toMatch(/revoke insert, update, delete, truncate, references, trigger\s+on all tables in schema public from anon/);
    expect(migration).not.toContain("revoke execute on all functions in schema public");
    expect(migration).toMatch(/revoke all on function public\.match_ai_memory_events[\s\S]*?from public, anon/);
    expect(migration).toMatch(/alter default privileges for role postgres in schema public\s+revoke execute on functions from public, anon/);
    expect(migration).toContain("alter function public.match_ai_memory_events");
    expect(migration).toContain("set search_path = extensions, public, pg_temp");
  });
});
