import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllowedUser, getSupabaseServerClient } = vi.hoisted(() => ({
  getAllowedUser: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ getAllowedUser }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient }));

import { PATCH } from "../route";

const senderIdentityId = "22222222-2222-4222-8222-222222222222";

function query(result: { data: unknown; error?: unknown }) {
  const chain = {
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
  };
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

function routeClient({
  draft = { id: "draft-id", workspace_id: "workspace-a" },
  identity = { id: senderIdentityId, workspace_id: "workspace-a", gmail_account_id: "account-id", active: true, gmail_accounts: { id: "account-id", active: true } },
  permission = { gmail_account_id: "account-id", can_draft: true, can_send: true },
  update = { id: "draft-id", status: "needs_review", sender_identity_id: senderIdentityId },
}: {
  draft?: unknown;
  identity?: unknown;
  permission?: unknown;
  update?: unknown;
} = {}) {
  const draftRead = query({ data: draft });
  const identityRead = query({ data: identity });
  const permissionRead = query({ data: permission });
  const updateChain = query({ data: update });
  const updateDraft = vi.fn().mockReturnValue(updateChain);
  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "sender_identities") return { select: vi.fn().mockReturnValue(identityRead) };
        if (table === "gmail_account_permissions") return { select: vi.fn().mockReturnValue(permissionRead) };
        return { select: vi.fn().mockReturnValue(draftRead), update: updateDraft };
      }),
    },
    updateDraft,
    updateChain,
  };
}

async function patchSender() {
  return PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ senderIdentityId }) }), { params: Promise.resolve({ draftId: "draft-id" }) });
}

describe("PATCH /api/v2/mail/drafts/[draftId]", () => {
  beforeEach(() => {
    getAllowedUser.mockReset().mockResolvedValue({ id: "user-id" });
    getSupabaseServerClient.mockReset();
  });

  it("persists an active same-workspace sender with draft and send permission", async () => {
    const { client, updateDraft, updateChain } = routeClient();
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await patchSender();

    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(expect.objectContaining({ sender_identity_id: senderIdentityId, status: "needs_review", approved_by: null }));
    expect(updateChain.eq).toHaveBeenCalledWith("workspace_id", "workspace-a");
  });

  it("rejects a sender identity from another workspace", async () => {
    const { client, updateDraft } = routeClient({ identity: { id: senderIdentityId, workspace_id: "workspace-b", gmail_account_id: "account-id", active: true, gmail_accounts: { id: "account-id", active: true } } });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await patchSender();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "sender_not_authorized" });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("rejects an inactive sender account", async () => {
    const { client, updateDraft } = routeClient({ identity: { id: senderIdentityId, workspace_id: "workspace-a", gmail_account_id: "account-id", active: true, gmail_accounts: { id: "account-id", active: false } } });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await patchSender();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "sender_not_authorized" });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("rejects a sender with draft-only permission", async () => {
    const { client, updateDraft } = routeClient({ permission: { gmail_account_id: "account-id", can_draft: true, can_send: false } });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await patchSender();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "sender_not_authorized" });
    expect(updateDraft).not.toHaveBeenCalled();
  });
});
