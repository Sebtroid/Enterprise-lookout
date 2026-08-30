import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const path = join(process.cwd(), "supabase", "migrations", "20260809058000_runtime_vault_access.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8").toLowerCase() : "";
describe("runtime Vault access migration", () => {
  it("exposes a service-role-only public bridge to the private reader", () => {
    expect(sql).toContain("create or replace function public.get_workspace_runtime_secret");
    expect(sql).toContain("security definer"); expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("app_private.get_workspace_secret(target_workspace_id, target_secret_key)");
    expect(sql).toMatch(/revoke all on function public\.get_workspace_runtime_secret[\s\S]*?from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.get_workspace_runtime_secret[\s\S]*?to service_role/);
  });
  it("removes authenticated access to every Vault security-definer RPC", () => {
    for (const fn of ["workspace_secret_status", "replace_workspace_secret", "reveal_workspace_secret"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to service_role`));
    }
    expect(sql).not.toContain("auth.uid()");
  });
});
