import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  subject: z.string().max(998).optional(),
  body: z.string().min(1).max(100_000).optional(),
  senderIdentityId: z.string().uuid().optional(),
}).refine((value) => value.subject !== undefined || value.body !== undefined || value.senderIdentityId !== undefined);

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "auth_unavailable" }, { status: 503 });
  const { draftId } = await params;
  const { data: draft } = await supabase.from("mail_drafts").select("id,workspace_id").eq("id", draftId).maybeSingle();
  const workspaceId = typeof draft?.workspace_id === "string" ? draft.workspace_id : "";
  if (!draft || !workspaceId) return Response.json({ error: parsed.data.senderIdentityId ? "sender_not_authorized" : "draft_not_editable" }, { status: parsed.data.senderIdentityId ? 403 : 409 });

  if (parsed.data.senderIdentityId) {
    const { data: identity } = await supabase.from("sender_identities").select("id,workspace_id,gmail_account_id,active,gmail_accounts(id,active)").eq("id", parsed.data.senderIdentityId).maybeSingle();
    const identityRecord = identity as { workspace_id?: unknown; gmail_account_id?: unknown; active?: unknown; gmail_accounts?: { active?: unknown } | Array<{ active?: unknown }> | null } | null;
    const account = Array.isArray(identityRecord?.gmail_accounts) ? identityRecord.gmail_accounts[0] : identityRecord?.gmail_accounts;
    const accountId = typeof identityRecord?.gmail_account_id === "string" ? identityRecord.gmail_account_id : "";
    if (!identityRecord || identityRecord.workspace_id !== workspaceId || identityRecord.active !== true || account?.active !== true || !accountId) return Response.json({ error: "sender_not_authorized" }, { status: 403 });

    const { data: permission } = await supabase.from("gmail_account_permissions").select("can_draft,can_send").eq("gmail_account_id", accountId).eq("user_id", user.id).eq("active", true).maybeSingle();
    if (!permission?.can_draft || !permission.can_send) return Response.json({ error: "sender_not_authorized" }, { status: 403 });
  }

  const updates = {
    ...(parsed.data.subject !== undefined ? { subject: parsed.data.subject } : {}),
    ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
    ...(parsed.data.senderIdentityId !== undefined ? { sender_identity_id: parsed.data.senderIdentityId } : {}),
    status: "needs_review",
    approved_by: null,
    approved_at: null,
    send_error: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("mail_drafts").update(updates).eq("id", draftId).eq("workspace_id", workspaceId).in("status", ["draft", "needs_review", "approved", "failed"]).select("id,status,sender_identity_id").maybeSingle();
  if (error) return Response.json({ error: parsed.data.senderIdentityId ? "sender_not_authorized" : "draft_update_failed" }, { status: 403 });
  if (!data) return Response.json({ error: parsed.data.senderIdentityId ? "sender_not_authorized" : "draft_not_editable" }, { status: parsed.data.senderIdentityId ? 403 : 409 });
  return Response.json(data);
}
