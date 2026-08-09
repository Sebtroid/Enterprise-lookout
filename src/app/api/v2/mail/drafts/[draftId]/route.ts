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
  const { data, error } = await supabase.from("mail_drafts").update(updates).eq("id", draftId).in("status", ["draft", "needs_review", "approved", "failed"]).select("id,status,sender_identity_id").maybeSingle();
  if (error) return Response.json({ error: parsed.data.senderIdentityId ? "sender_not_authorized" : "draft_update_failed" }, { status: 403 });
  if (!data) return Response.json({ error: parsed.data.senderIdentityId ? "sender_not_authorized" : "draft_not_editable" }, { status: parsed.data.senderIdentityId ? 403 : 409 });
  return Response.json(data);
}
