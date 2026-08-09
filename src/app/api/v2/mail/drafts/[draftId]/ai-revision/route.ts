import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ instruction: z.string().trim().min(3).max(2_000) });

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "auth_unavailable" }, { status: 503 });
  const { draftId } = await params;
  const { data: draft } = await supabase.from("mail_drafts").select("id,workspace_id,project_id").eq("id", draftId).maybeSingle();
  if (!draft?.project_id) return Response.json({ error: "draft_not_found" }, { status: 404 });
  const { data, error } = await supabase.from("ai_jobs").insert({ workspace_id: draft.workspace_id, project_id: draft.project_id, requested_by: user.id, approved_by: user.id, job_type: "chatgpt_revise_draft", object_type: "mail_draft", object_id: draft.id, status: "approved", input: { draftId: draft.id, instruction: parsed.data.instruction }, idempotency_key: `revise-draft:${draft.id}:${crypto.randomUUID()}` }).select("id,status").single();
  if (error) return Response.json({ error: error.message }, { status: 403 });
  return Response.json(data, { status: 201 });
}
