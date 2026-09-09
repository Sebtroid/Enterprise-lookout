import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllowedUser, getSupabaseAdminClient, getWorkspaceRuntimeConfig } = vi.hoisted(() => ({
  getAllowedUser: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
  getWorkspaceRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ getAllowedUser }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient }));
vi.mock("@/lib/v2/runtime-config", () => ({ getWorkspaceRuntimeConfig }));

import { GET as connectMicrosoft } from "../route";
import { GET as finishMicrosoftConnection } from "../callback/route";
import { POST as syncMicrosoftAccount } from "../../v2/microsoft/accounts/[accountId]/sync/route";

function membershipQuery() {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { workspace_id: "11111111-1111-4111-8111-111111111111" },
      error: null,
    }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

describe("Microsoft 365 OAuth routes", () => {
  beforeEach(() => {
    getAllowedUser.mockReset().mockResolvedValue({ id: "user-id" });
    getSupabaseAdminClient.mockReset();
    getWorkspaceRuntimeConfig.mockReset().mockResolvedValue({
      secrets: {
        "microsoft-client-id": "client-id",
        "microsoft-client-secret": "client-secret",
        "microsoft-tenant-id": "tenant-id",
        "gmail-token-encryption-key": "test-encryption-key-with-enough-length",
      },
      budgetUsd: 5,
    });
  });

  it("does not start OAuth without an authenticated Enterprise Lookout user", async () => {
    getAllowedUser.mockResolvedValue(null);

    const response = await connectMicrosoft(new Request("https://app.test/api/microsoft?action=connect") as never);

    expect(response.status).toBe(401);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("starts tenant-bound OAuth and persists a one-time nonce before redirecting", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    getSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => membershipQuery()), rpc });

    const response = await connectMicrosoft(new Request("https://app.test/api/microsoft?action=connect") as never);
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.origin + location.pathname).toBe("https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(response.headers.get("set-cookie")).toMatch(/microsoft_oauth_nonce=.*HttpOnly/i);
    expect(rpc).toHaveBeenCalledWith("create_microsoft_oauth_nonce", expect.objectContaining({
      target_workspace_id: "11111111-1111-4111-8111-111111111111",
      target_user_id: "user-id",
    }));
  });

  it("does not exchange a callback code without a signed-in user", async () => {
    getAllowedUser.mockResolvedValue(null);

    const response = await finishMicrosoftConnection(new Request("https://app.test/api/microsoft/callback?code=secret") as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("microsoft_error=unauthorized");
    expect(getWorkspaceRuntimeConfig).not.toHaveBeenCalled();
  });

  it("keeps Microsoft sync protected and explicitly unavailable until delta sync ships", async () => {
    getAllowedUser.mockResolvedValue(null);
    const unauthorized = await syncMicrosoftAccount(new Request("https://app.test/api/v2/microsoft/accounts/account-1/sync"), {
      params: Promise.resolve({ accountId: "account-1" }),
    });
    expect(unauthorized.status).toBe(401);

    getAllowedUser.mockResolvedValue({ id: "user-id" });
    const unavailable = await syncMicrosoftAccount(new Request("https://app.test/api/v2/microsoft/accounts/account-1/sync"), {
      params: Promise.resolve({ accountId: "account-1" }),
    });
    expect(unavailable.status).toBe(501);
    await expect(unavailable.json()).resolves.toEqual({
      error: "La sincronización Microsoft 365 todavía no está disponible",
    });
  });
});
