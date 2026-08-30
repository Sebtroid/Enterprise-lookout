import { beforeEach, describe, expect, it, vi } from "vitest";
const { getSupabaseAdminClient } = vi.hoisted(() => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient }));
import { authorizeWorkspaceCronRequest, getWorkspaceRuntimeConfig } from "../runtime-config";

function adminClient(secretValues: Record<string, string | null>, budget: number | null = 5) {
  const rpc = vi.fn((_name: string, args: { target_secret_key: string }) => Promise.resolve({ data: secretValues[args.target_secret_key] ?? null, error: null }));
  const maybeSingle = vi.fn().mockResolvedValue({ data: budget === null ? null : { minimax_monthly_budget_usd: budget }, error: null });
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  return { rpc, from: vi.fn(() => chain) };
}

describe("workspace runtime config", () => {
  beforeEach(() => { vi.unstubAllEnvs(); getSupabaseAdminClient.mockReset(); });
  it("prefers Vault secrets and DB budget, including a zero hard stop", async () => {
    getSupabaseAdminClient.mockReturnValue(adminClient({ "minimax-api-key": "vault-key", "minimax-model": "vault-model" }, 0));
    vi.stubEnv("MINIMAX_API_KEY", "env-key"); vi.stubEnv("MINIMAX_MODEL", "env-model"); vi.stubEnv("MINIMAX_MONTHLY_BUDGET_USD", "9");
    await expect(getWorkspaceRuntimeConfig("workspace", ["minimax-api-key", "minimax-model"])).resolves.toMatchObject({ budgetUsd: 0, secrets: { "minimax-api-key": "vault-key", "minimax-model": "vault-model" } });
  });
  it("falls back to env only when Vault/settings are absent", async () => {
    getSupabaseAdminClient.mockReturnValue(adminClient({}, null));
    vi.stubEnv("MINIMAX_API_KEY", "env-key"); vi.stubEnv("MINIMAX_MONTHLY_BUDGET_USD", "7");
    const config = await getWorkspaceRuntimeConfig("workspace", ["minimax-api-key"]);
    expect(config.secrets["minimax-api-key"]).toBe("env-key"); expect(config.budgetUsd).toBe(7);
  });
  it("does not fall back to env when the Vault RPC fails", async () => {
    const client = adminClient({}, null);
    client.rpc.mockResolvedValue({ data: null, error: { message: "sensitive database detail" } });
    getSupabaseAdminClient.mockReturnValue(client);
    vi.stubEnv("MINIMAX_API_KEY", "env-key");

    await expect(getWorkspaceRuntimeConfig("workspace", ["minimax-api-key"]))
      .rejects.toThrow("No se pudo leer la configuración segura del workspace");
    await expect(getWorkspaceRuntimeConfig("workspace", ["minimax-api-key"]))
      .rejects.not.toThrow("sensitive database detail");
  });
  it("authorizes bearer tokens against each workspace Vault secret", async () => {
    getSupabaseAdminClient.mockReturnValue(adminClient({ "cron-secret": "vault-cron-secret-123" }));
    await expect(authorizeWorkspaceCronRequest("Bearer vault-cron-secret-123", ["workspace-a"])).resolves.toEqual(["workspace-a"]);
    await expect(authorizeWorkspaceCronRequest("Bearer wrong", ["workspace-a"])).resolves.toEqual([]);
  });
});
