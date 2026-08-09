import { createHash } from "node:crypto";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type ToolActor = {
  origin: "chatgpt" | "codex" | "automation";
  scopes: string[];
  userId: string;
  workspaceId: string;
};

const idempotencyKey = z.string().min(8).max(160);
const sourceSchema = z.object({ title: z.string().min(1), url: z.string().url(), capturedAt: z.string().datetime().optional() });

export const ENTERPRISE_TOOL_DEFINITIONS = [
  { name: "list_projects", title: "Listar proyectos", description: "Lista los proyectos visibles para el usuario conectado.", scope: "workspace:read", mutates: false, schema: z.object({ status: z.enum(["draft", "active", "paused", "archived"]).optional() }) },
  { name: "get_project_context", title: "Obtener contexto de proyecto", description: "Obtiene brief, empresas y acciones del proyecto antes de investigar o redactar.", scope: "workspace:read", mutates: false, schema: z.object({ projectId: z.string().min(1) }) },
  { name: "create_research_brief", title: "Crear brief de investigación", description: "Guarda un brief; no aprueba ni ejecuta investigación profunda.", scope: "research:write", mutates: true, schema: z.object({ projectId: z.string().min(1), request: z.string().min(10), confirmed: z.record(z.string(), z.unknown()).default({}), estimated: z.record(z.string(), z.unknown()).default({}), unknown: z.array(z.string()).default([]), idempotencyKey }) },
  { name: "save_research_candidates", title: "Guardar candidatos", description: "Guarda candidatos de descubrimiento superficial con fuentes; no los aprueba para investigación profunda.", scope: "research:write", mutates: true, schema: z.object({ projectId: z.string().min(1), briefId: z.string().uuid(), candidates: z.array(z.object({ name: z.string().min(1), domain: z.string().optional(), summary: z.string().optional(), fitReason: z.string().optional(), sourceUrls: z.array(z.string().url()).min(1) })).min(1).max(30), idempotencyKey }) },
  { name: "list_approved_research", title: "Listar investigación aprobada", description: "Lista exclusivamente jobs de investigación aprobados y pendientes.", scope: "research:read", mutates: false, schema: z.object({ projectId: z.string().optional(), limit: z.number().int().min(1).max(20).default(10) }) },
  { name: "save_research_report", title: "Guardar informe de investigación", description: "Guarda un informe profundo con fuentes para un candidato aprobado.", scope: "research:write", mutates: true, schema: z.object({ projectId: z.string().min(1), candidateId: z.string().min(1), summary: z.string().min(20), facts: z.array(z.object({ field: z.string(), value: z.unknown(), confidence: z.number().min(0).max(1) })), sources: z.array(sourceSchema).min(1), idempotencyKey }) },
  { name: "propose_fact", title: "Proponer dato", description: "Propone una revisión respaldada; nunca reemplaza silenciosamente un dato verificado.", scope: "knowledge:write", mutates: true, schema: z.object({ projectId: z.string().min(1), entityType: z.enum(["company", "contact"]), entityId: z.string().min(1), field: z.string().min(1), value: z.unknown(), status: z.enum(["estimated", "found", "verified", "confirmed", "disputed", "stale"]), evidenceSourceId: z.string().min(1), idempotencyKey }) },
  { name: "upsert_draft", title: "Crear o modificar borrador", description: "Guarda un borrador para revisión humana. Esta herramienta nunca envía correo.", scope: "mail:draft", mutates: true, schema: z.object({ projectId: z.string().min(1), threadId: z.string().optional(), companyId: z.string().optional(), contactId: z.string().optional(), senderIdentityId: z.string().optional(), toEmail: z.string().email().optional(), kind: z.enum(["first_contact", "reply", "followup"]), subject: z.string(), body: z.string().min(1), idempotencyKey }) },
  { name: "analyze_reply", title: "Analizar respuesta", description: "Clasifica una respuesta y prepara recomendaciones sin enviar correo.", scope: "mail:read", mutates: false, schema: z.object({ projectId: z.string().min(1), message: z.string().min(1) }) },
  { name: "save_feedback", title: "Guardar aprendizaje", description: "Guarda una regla derivada de feedback humano explícito.", scope: "knowledge:write", mutates: true, schema: z.object({ projectId: z.string().optional(), rule: z.string().min(5), sourceExample: z.string().optional(), idempotencyKey }) },
  { name: "complete_job", title: "Completar job", description: "Marca un job reclamado como completado o fallido y conserva el resultado.", scope: "jobs:write", mutates: true, schema: z.object({ jobId: z.string().min(1), outcome: z.enum(["completed", "failed"]), result: z.record(z.string(), z.unknown()).optional(), error: z.string().optional(), costUsd: z.number().min(0).default(0), idempotencyKey }) },
] as const;

type ToolName = (typeof ENTERPRISE_TOOL_DEFINITIONS)[number]["name"];

export function assertToolAuthorization(actor: ToolActor, name: ToolName, input: Record<string, unknown>) {
  const definition = ENTERPRISE_TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!definition) throw new Error("Herramienta desconocida");
  if (!actor.scopes.includes(definition.scope) && !actor.scopes.includes("workspace:admin")) {
    throw new Error(`Falta el scope ${definition.scope}`);
  }
  if (definition.mutates && !input.idempotencyKey) throw new Error("idempotencyKey es obligatorio para mutaciones");
}

export async function authenticateToolRequest(request: Request): Promise<ToolActor | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = getSupabaseAdminClient();

  if (admin) {
    const { data } = await admin.from("tool_connections").select("workspace_id,user_id,provider,scopes,expires_at,revoked_at").eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
    if (data && (!data.expires_at || new Date(data.expires_at) > new Date())) {
      const { data: membership } = await admin.from("workspace_members").select("status").eq("workspace_id", data.workspace_id).eq("user_id", data.user_id).eq("status", "active").maybeSingle();
      if (!membership) return null;
      await admin.from("tool_connections").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash);
      return { origin: data.provider as ToolActor["origin"], scopes: data.scopes, userId: data.user_id, workspaceId: data.workspace_id };
    }
  }

  if (process.env.NODE_ENV !== "production" && token === process.env.AGENT_API_TOKEN) {
    return { origin: "codex", scopes: ["workspace:admin"], userId: "demo-user", workspaceId: "00000000-0000-4000-8000-000000000001" };
  }
  return null;
}

export async function executeEnterpriseTool(name: ToolName, rawInput: unknown, actor: ToolActor): Promise<Record<string, unknown>> {
  const definition = ENTERPRISE_TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!definition) throw new Error("Herramienta desconocida");
  const input = definition.schema.parse(rawInput) as Record<string, unknown>;
  assertToolAuthorization(actor, name, input);
  if (definition.mutates) await assertProjectWriteAccess(actor, input.projectId as string | undefined);

  const replay = definition.mutates ? await getIdempotentResponse(actor, name, input) : null;
  if (replay) return replay;
  const result = await runTool(name, input, actor);
  if (definition.mutates) await saveIdempotentResponse(actor, name, input, result);
  return result;
}

async function runTool(name: ToolName, input: Record<string, unknown>, actor: ToolActor): Promise<Record<string, unknown>> {
  const admin = getSupabaseAdminClient();
  if (name === "analyze_reply") { const message = String(input.message).toLowerCase(); const classification = /no|baja|eliminar/.test(message) ? "do_not_contact" : /cu[aá]nt|fecha|propuesta|env[ií]a/.test(message) ? "interested" : "needs_review"; return { classification, advice: classification === "interested" ? ["Responder las preguntas concretas", "Proponer una siguiente acción"] : ["Revisar manualmente antes de responder"] }; }
  if (!admin) return { accepted: true, persisted: false, reason: "Modo de demostración sin Supabase", tool: name };

  if (name === "list_projects") {
    let query = admin.from("projects").select("id,name,status,access_mode,owner_user_id,updated_at").eq("workspace_id", actor.workspaceId).neq("status", "archived").order("updated_at", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw error;
    return { projects: data.map((project) => ({ id: project.id, name: project.name, status: project.status, accessMode: project.access_mode, ownerUserId: project.owner_user_id })) };
  }
  if (name === "get_project_context") {
    const projectId = await resolveProjectId(String(input.projectId), actor.workspaceId);
    const [{ data: project, error: projectError }, { data: companies, error: companiesError }, { data: tasks, error: tasksError }] = await Promise.all([
      admin.from("projects").select("id,name,status,access_mode,owner_user_id,description,value_proposition,brief,starts_on,ends_on").eq("workspace_id", actor.workspaceId).eq("id", projectId).single(),
      admin.from("project_companies").select("stage,fit_score,next_action,companies(id,canonical_name,domain,industry),contacts(id,full_name,role,email,verification_status,is_decision_maker)").eq("workspace_id", actor.workspaceId).eq("project_id", projectId),
      admin.from("project_tasks").select("id,title,status,due_at,assigned_to").eq("workspace_id", actor.workspaceId).eq("project_id", projectId).neq("status", "completed").order("due_at"),
    ]);
    if (projectError || companiesError || tasksError) throw projectError ?? companiesError ?? tasksError;
    return { project, companies, tasks };
  }

  if (name === "create_research_brief") { const { data, error } = await admin.from("research_briefs").insert({ workspace_id: actor.workspaceId, project_id: await resolveProjectId(String(input.projectId), actor.workspaceId), request_text: input.request, confirmed_context: input.confirmed, estimated_context: input.estimated, unknown_context: input.unknown, created_by: actor.userId }).select("id").single(); if (error) throw error; return { briefId: data.id, status: "draft", deepResearchApproved: false }; }
  if (name === "save_research_candidates") { const projectId = await resolveProjectId(String(input.projectId), actor.workspaceId); await assertRowScope("research_briefs", String(input.briefId), actor.workspaceId, projectId); const rows = (input.candidates as Array<{ name: string; domain?: string; summary?: string; fitReason?: string; sourceUrls: string[] }>).map((candidate) => ({ workspace_id: actor.workspaceId, project_id: projectId, brief_id: input.briefId, name: candidate.name, domain: candidate.domain, summary: candidate.summary, fit_reason: candidate.fitReason, source_urls: candidate.sourceUrls, status: "proposed" })); const { data, error } = await admin.from("research_candidates").upsert(rows, { onConflict: "brief_id,name" }).select("id,name,status"); if (error) throw error; return { candidates: data, deepResearchApproved: false }; }
  if (name === "list_approved_research") { let query = admin.from("ai_jobs").select("id,job_type,project_id,object_type,object_id,status,attempts").eq("workspace_id", actor.workspaceId).eq("status", "approved").limit(Number(input.limit)); if (input.projectId) query = query.eq("project_id", await resolveProjectId(String(input.projectId), actor.workspaceId)); const { data, error } = await query; if (error) throw error; return { jobs: data }; }
  if (name === "save_research_report") { const projectId = await resolveProjectId(String(input.projectId), actor.workspaceId); await assertRowScope("research_candidates", String(input.candidateId), actor.workspaceId, projectId); const sourceIds: string[] = []; for (const source of input.sources as Array<{ title: string; url: string; capturedAt?: string }>) { const { data, error } = await admin.from("evidence_sources").upsert({ workspace_id: actor.workspaceId, project_id: projectId, title: source.title, url: source.url, captured_at: source.capturedAt ?? new Date().toISOString(), origin: actor.origin, created_by: actor.userId }, { onConflict: "workspace_id,url" }).select("id").single(); if (error) throw error; sourceIds.push(data.id); } const { data, error } = await admin.from("research_reports").insert({ workspace_id: actor.workspaceId, project_id: projectId, candidate_id: input.candidateId, executive_summary: input.summary, background: { facts: input.facts }, source_ids: sourceIds, created_by_origin: actor.origin, created_by_user_id: actor.userId }).select("id").single(); if (error) throw error; return { reportId: data.id, sourcesSaved: sourceIds.length, status: "needs_review" }; }
  if (name === "propose_fact") { const projectId = await resolveProjectId(String(input.projectId), actor.workspaceId); await Promise.all([assertRowScope(input.entityType === "company" ? "companies" : "contacts", String(input.entityId), actor.workspaceId), assertRowScope("evidence_sources", String(input.evidenceSourceId), actor.workspaceId)]); const { data, error } = await admin.from("fact_revisions").insert({ workspace_id: actor.workspaceId, project_id: projectId, subject_type: input.entityType, subject_id: input.entityId, field_key: input.field, value: input.value, status: input.status, evidence_source_id: input.evidenceSourceId, origin: actor.origin, created_by: actor.userId }).select("id").single(); if (error) throw error; return { revisionId: data.id, status: "proposed" }; }
  if (name === "upsert_draft") { const projectId = await resolveProjectId(String(input.projectId), actor.workspaceId); await Promise.all([assertOptionalRowScope("mail_threads", input.threadId, actor.workspaceId), assertOptionalRowScope("companies", input.companyId, actor.workspaceId), assertOptionalRowScope("contacts", input.contactId, actor.workspaceId), assertOptionalRowScope("sender_identities", input.senderIdentityId, actor.workspaceId)]); const { data, error } = await admin.from("mail_drafts").upsert({ workspace_id: actor.workspaceId, project_id: projectId, thread_id: input.threadId, company_id: input.companyId, contact_id: input.contactId, sender_identity_id: input.senderIdentityId, to_email: input.toEmail, kind: input.kind, subject: input.subject, body: input.body, status: "needs_review", created_by_origin: actor.origin, created_by_user_id: actor.userId, idempotency_key: input.idempotencyKey }, { onConflict: "workspace_id,idempotency_key" }).select("id,status").single(); if (error) throw error; return { draftId: data.id, status: data.status, sent: false }; }
  if (name === "save_feedback") { const { data, error } = await admin.from("ai_feedback_rules").insert({ workspace_id: actor.workspaceId, project_id: input.projectId ? await resolveProjectId(String(input.projectId), actor.workspaceId) : null, rule: input.rule, source_example: input.sourceExample, created_by: actor.userId }).select("id").single(); if (error) throw error; return { ruleId: data.id, active: true }; }
  if (name === "complete_job") { const { data: job, error: jobError } = await admin.from("ai_jobs").select("id,project_id,status").eq("id", input.jobId).eq("workspace_id", actor.workspaceId).single(); if (jobError) throw jobError; if (job.project_id) await assertProjectWriteAccess(actor, job.project_id); const status = input.outcome === "completed" ? "completed" : "failed"; const { data, error } = await admin.from("ai_jobs").update({ status, result: input.result ?? null, error: input.error ?? null, updated_at: new Date().toISOString() }).eq("id", input.jobId).eq("workspace_id", actor.workspaceId).in("status", ["approved", "claimed", "running", "reviewing"]).select("id,status").single(); if (error) throw error; if (Number(input.costUsd) > 0) await admin.from("ai_usage_ledger").insert({ workspace_id: actor.workspaceId, job_id: data.id, provider: actor.origin, model: "external", cost_usd: input.costUsd }); return { jobId: data.id, status: data.status }; }
  throw new Error("Herramienta sin implementación");
}

async function assertProjectWriteAccess(actor: ToolActor, projectRef?: string) {
  if (!projectRef || actor.scopes.includes("workspace:admin")) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const projectId = await resolveProjectId(projectRef, actor.workspaceId);
  const { data: project } = await admin.from("projects").select("owner_user_id,access_mode").eq("id", projectId).single();
  if (project?.owner_user_id === actor.userId || project?.access_mode === "shared") return;
  const { data: membership } = await admin.from("project_members").select("can_edit").eq("project_id", projectId).eq("user_id", actor.userId).maybeSingle();
  if (!membership?.can_edit) throw new Error("El actor no puede modificar este proyecto personal");
}

async function resolveProjectId(reference: string, workspaceId: string) { const admin = getSupabaseAdminClient(); if (!admin) return reference; const query = /^[0-9a-f-]{36}$/i.test(reference) ? admin.from("projects").select("id").eq("workspace_id", workspaceId).eq("id", reference) : admin.from("projects").select("id").eq("workspace_id", workspaceId).eq("slug", reference); const { data, error } = await query.single(); if (error) throw new Error("Proyecto no encontrado o fuera del workspace"); return data.id as string; }
async function assertOptionalRowScope(table: string, id: unknown, workspaceId: string) { if (typeof id === "string" && id) await assertRowScope(table, id, workspaceId); }
async function assertRowScope(table: string, id: string, workspaceId: string, projectId?: string) { const admin = getSupabaseAdminClient(); if (!admin) return; let query = admin.from(table).select("id").eq("id", id).eq("workspace_id", workspaceId); if (projectId) query = query.eq("project_id", projectId); const { data } = await query.maybeSingle(); if (!data) throw new Error("Referencia fuera del workspace o proyecto"); }
async function getIdempotentResponse(actor: ToolActor, operation: string, input: Record<string, unknown>) { const admin = getSupabaseAdminClient(); if (!admin) return null; const { data } = await admin.from("idempotency_records").select("response,request_hash").eq("workspace_id", actor.workspaceId).eq("idempotency_key", input.idempotencyKey).maybeSingle(); if (!data) return null; const hash = hashRequest(operation, input); if (data.request_hash !== hash) throw new Error("La idempotencyKey ya fue usada con otra solicitud"); return data.response as Record<string, unknown> | null; }
async function saveIdempotentResponse(actor: ToolActor, operation: string, input: Record<string, unknown>, response: Record<string, unknown>) { const admin = getSupabaseAdminClient(); if (!admin) return; const { error } = await admin.from("idempotency_records").upsert({ workspace_id: actor.workspaceId, actor_user_id: actor.userId, idempotency_key: input.idempotencyKey, operation, request_hash: hashRequest(operation, input), response }, { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true }); if (error) throw error; }
function hashRequest(operation: string, input: Record<string, unknown>) { return createHash("sha256").update(`${operation}:${stableStringify(input)}`).digest("hex"); }
function stableStringify(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`; return JSON.stringify(value); }
