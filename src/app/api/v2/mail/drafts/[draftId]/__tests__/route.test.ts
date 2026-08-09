import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllowedUser, getSupabaseServerClient } = vi.hoisted(() => ({
  getAllowedUser: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ getAllowedUser }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient }));

import { PATCH } from "../route";

function updateClient(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  const update = vi.fn().mockReturnValue(chain);
  return { client: { from: vi.fn().mockReturnValue({ update }) }, update };
}

describe("PATCH /api/v2/mail/drafts/[draftId]", () => {
  beforeEach(() => {
    getAllowedUser.mockReset().mockResolvedValue({ id: "user-id" });
    getSupabaseServerClient.mockReset();
  });

  it("persists an allowed sender identity and resets the draft approval", async () => {
    const { client, update } = updateClient({ data: { id: "draft-id", status: "needs_review", sender_identity_id: "22222222-2222-4222-8222-222222222222" }, error: null });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ senderIdentityId: "22222222-2222-4222-8222-222222222222" }) }), { params: Promise.resolve({ draftId: "draft-id" }) });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ sender_identity_id: "22222222-2222-4222-8222-222222222222", status: "needs_review", approved_by: null }));
  });

  it("rejects a sender identity that the authorized update cannot use", async () => {
    const { client } = updateClient({ data: null, error: { message: "permission denied" } });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ senderIdentityId: "22222222-2222-4222-8222-222222222222" }) }), { params: Promise.resolve({ draftId: "draft-id" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "sender_not_authorized" });
  });

  it("does not disguise an RLS-filtered sender identity as an editable draft", async () => {
    const { client } = updateClient({ data: null, error: null });
    getSupabaseServerClient.mockResolvedValue(client);

    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ senderIdentityId: "22222222-2222-4222-8222-222222222222" }) }), { params: Promise.resolve({ draftId: "draft-id" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "sender_not_authorized" });
  });
});
