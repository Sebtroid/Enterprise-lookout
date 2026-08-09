import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ subject: z.string().max(998).optional(), body: z.string().min(1).max(100_000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "auth_unavailable" }, { status: 503 });
  const { draftId } = await params;
  const { data, error } = await supabase.from("mail_drafts").update({ ...parsed.data, status: "needs_review", approved_by: null, approved_at: null, send_error: null, updated_at: new Date().toISOString() }).eq("id", draftId).in("status", ["draft", "needs_review", "approved", "failed"]).select("id,status").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 403 });
  if (!data) return Response.json({ error: "draft_not_editable" }, { status: 409 });
  return Response.json(data);
}
