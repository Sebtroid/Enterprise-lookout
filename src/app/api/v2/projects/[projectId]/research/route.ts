import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("discover"),
    request: z.string().trim().min(10).max(4_000),
    confirmed: z.record(z.string(), z.unknown()).default({}),
    estimated: z.record(z.string(), z.unknown()).default({}),
    unknown: z.array(z.string().trim().min(1)).max(20).default([]),
  }),
  z.object({ action: z.literal("approve_candidates"), candidateIds: z.array(z.string().uuid()).min(1).max(20) }),
]);

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "auth_unavailable" }, { status: 503 });
  const { projectId } = await params;
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });
  const { data: brief, error: briefError } = await supabase.from("research_briefs").select("id,request_text,confirmed_context,estimated_context,unknown_context,status,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (briefError) return Response.json({ error: briefError.message }, { status: 403 });
  const { data: candidates, error: candidateError } = brief ? await supabase.from("research_candidates").select("id,name,domain,summary,fit_reason,source_urls,status").eq("brief_id", brief.id).order("created_at") : { data: [], error: null };
  if (candidateError) return Response.json({ error: candidateError.message }, { status: 403 });
  return Response.json({ brief, candidates: candidates ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "auth_unavailable" }, { status: 503 });
  const { projectId } = await params;
  const { data: project } = await supabase.from("projects").select("id,workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });

  if (parsed.data.action === "discover") {
    const { data: brief, error: briefError } = await supabase.from("research_briefs").insert({ workspace_id: project.workspace_id, project_id: projectId, request_text: parsed.data.request, confirmed_context: parsed.data.confirmed, estimated_context: parsed.data.estimated, unknown_context: parsed.data.unknown, status: "discovering", created_by: user.id }).select("id,status").single();
    if (briefError) return Response.json({ error: briefError.message }, { status: 403 });
    const { data: job, error: jobError } = await supabase.from("ai_jobs").insert({ workspace_id: project.workspace_id, project_id: projectId, requested_by: user.id, approved_by: user.id, job_type: "chatgpt_candidate_discovery", object_type: "research_brief", object_id: brief.id, status: "approved", input: { briefId: brief.id }, idempotency_key: `discover:${brief.id}:${randomUUID()}` }).select("id,status").single();
    if (jobError) return Response.json({ error: jobError.message }, { status: 403 });
    return Response.json({ brief, job }, { status: 201 });
  }

  const { data: candidates, error: candidateError } = await supabase.from("research_candidates").select("id,brief_id,name").eq("project_id", projectId).in("id", parsed.data.candidateIds);
  if (candidateError || candidates?.length !== parsed.data.candidateIds.length) return Response.json({ error: "candidate_scope_mismatch" }, { status: 403 });
  const now = new Date().toISOString();
  const { error: selectError } = await supabase.from("research_candidates").update({ status: "selected", selected_by: user.id, selected_at: now }).eq("project_id", projectId).in("id", parsed.data.candidateIds);
  if (selectError) return Response.json({ error: selectError.message }, { status: 403 });
  const jobs = candidates.map((candidate) => ({ workspace_id: project.workspace_id, project_id: projectId, requested_by: user.id, approved_by: user.id, job_type: "chatgpt_deep_research", object_type: "research_candidate", object_id: candidate.id, status: "approved", input: { candidateId: candidate.id, briefId: candidate.brief_id }, idempotency_key: `deep-research:${candidate.id}` }));
  const { data: queued, error: queueError } = await supabase.from("ai_jobs").upsert(jobs, { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true }).select("id,object_id,status");
  if (queueError) return Response.json({ error: queueError.message }, { status: 403 });
  return Response.json({ selected: candidates.length, jobs: queued ?? [] });
}
