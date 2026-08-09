import { z } from "zod";
import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ draftIds: z.array(z.string().uuid()).min(1).max(30) });
export async function POST(request: Request) { const user = await getAllowedUser(); if (!user) return Response.json({ error: "unauthorized" }, { status: 401 }); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 }); const supabase = await getSupabaseServerClient(); if (!supabase) return Response.json({ error: "auth_unavailable" }, { status: 503 }); const { data, error } = await supabase.from("mail_drafts").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", parsed.data.draftIds).eq("status", "needs_review").select("id,status"); if (error) return Response.json({ error: error.message }, { status: 403 }); return Response.json({ approved: data.length, drafts: data }); }
