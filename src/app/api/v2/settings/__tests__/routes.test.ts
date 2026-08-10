import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllowedUser, getSupabaseServerClient } = vi.hoisted(() => ({
  getAllowedUser: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ getAllowedUser }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient }));

import { PATCH as updateBudget } from "../budget/route";
import { POST as replaceSecret } from "../vault/replace/route";
import { POST as revealSecret } from "../vault/reveal/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function ownerQuery(role: "owner" | "member" = "owner") {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { workspace_id: workspaceId, role },
      error: null,
    }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function budgetClient({ role = "owner", error = null }: { role?: "owner" | "member"; error?: { message: string } | null } = {}) {
  const membership = ownerQuery(role);
  const single = vi.fn().mockResolvedValue({
    data: error ? null : { minimax_monthly_budget_usd: 8.5 },
    error,
  });
  const upsertChain = { select: vi.fn(), single };
  upsertChain.select.mockReturnValue(upsertChain);
  const upsert = vi.fn().mockReturnValue(upsertChain);
  return {
    client: {
      from: vi.fn((table: string) => table === "workspace_members" ? membership : { upsert }),
    },
    upsert,
  };
}

function vaultClient({ role = "owner", rpcData = null, rpcError = null }: {
  role?: "owner" | "member";
  rpcData?: unknown;
  rpcError?: { message: string } | null;
} = {}) {
  const membership = ownerQuery(role);
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  return {
    client: { from: vi.fn(() => membership), rpc },
    rpc,
  };
}

describe("workspace settings API", () => {
  beforeEach(() => {
    getAllowedUser.mockReset().mockResolvedValue({ id: "user-id" });
    getSupabaseServerClient.mockReset();
  });

  it("requires an authenticated user before updating the budget", async () => {
    getAllowedUser.mockResolvedValue(null);
    const response = await updateBudget(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ limitUsd: 8.5 }),
    }));

    expect(response.status).toBe(401);
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("lets an owner persist a validated monthly budget", async () => {
    const { client, upsert } = budgetClient();
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await updateBudget(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ limitUsd: 8.5 }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ limitUsd: 8.5 });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: workspaceId,
      minimax_monthly_budget_usd: 8.5,
      updated_by: "user-id",
    }), { onConflict: "workspace_id" });
  });

  it("rejects a non-owner without trying to update settings", async () => {
    const { client, upsert } = budgetClient({ role: "member" });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await updateBudget(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ limitUsd: 8.5 }),
    }));

    expect(response.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("validates budget input and sanitizes database errors", async () => {
    const { client } = budgetClient({ error: { message: "database exploded with a private detail" } });
    getSupabaseServerClient.mockResolvedValue(client);

    const invalid = await updateBudget(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ limitUsd: -1 }),
    }));
    const failed = await updateBudget(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ limitUsd: 8.5 }),
    }));

    expect(invalid.status).toBe(400);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("database exploded");
  });

  it("replaces an allowlisted secret without echoing its value", async () => {
    const { client, rpc } = vaultClient();
    getSupabaseServerClient.mockResolvedValue(client);
    const secret = "test-only-secret-value";

    const response = await replaceSecret(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ key: "minimax-api-key", value: secret }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ key: "minimax-api-key", configured: true });
    expect(rpc).toHaveBeenCalledWith("replace_workspace_secret", {
      target_workspace_id: workspaceId,
      target_secret_key: "minimax-api-key",
      target_secret_value: secret,
    });
  });

  it("reveals only an allowlisted secret for an owner and prevents caching", async () => {
    const { client, rpc } = vaultClient({ rpcData: "revealed-test-value" });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await revealSecret(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ key: "hunter-api-key" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ key: "hunter-api-key", value: "revealed-test-value" });
    expect(rpc).toHaveBeenCalledWith("reveal_workspace_secret", {
      target_workspace_id: workspaceId,
      target_secret_key: "hunter-api-key",
    });
  });

  it("rejects unsupported secret keys and sanitizes RPC errors", async () => {
    const { client } = vaultClient({ rpcError: { message: "vault internals must stay private" } });
    getSupabaseServerClient.mockResolvedValue(client);

    const unsupported = await revealSecret(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ key: "not-allowed" }),
    }));
    const failed = await revealSecret(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ key: "hunter-api-key" }),
    }));

    expect(unsupported.status).toBe(400);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("vault internals");
  });
});
