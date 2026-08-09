import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { evaluateAiBudget } from "@/lib/v2/domain";

const librarianResultSchema = z.object({
  summary: z.string(),
  normalizedEntities: z.array(z.object({ kind: z.enum(["company", "contact"]), original: z.string(), normalized: z.string() })).default([]),
  duplicateCandidates: z.array(z.object({ leftId: z.string(), rightId: z.string(), reason: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  contradictions: z.array(z.object({ entityId: z.string(), field: z.string(), currentValue: z.unknown(), proposedValue: z.unknown(), reason: z.string() })).default([]),
  staleFacts: z.array(z.object({ factId: z.string(), reason: z.string() })).default([]),
  classification: z.string().optional(),
});

export type LibrarianResult = z.infer<typeof librarianResultSchema>;

export async function runMinimaxLibrarian(input: { workspaceId: string; jobId?: string; task: string; context: unknown }): Promise<LibrarianResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_MODEL;
  const baseUrl = (process.env.MINIMAX_API_URL ?? "https://api.minimax.io/v1").replace(/\/$/, "");
  if (!apiKey || !model) throw new Error("MiniMax no está configurado");
  const spent = await getMonthlyMinimaxSpend(input.workspaceId);
  const budget = evaluateAiBudget(spent, Number(process.env.MINIMAX_MONTHLY_BUDGET_USD ?? 5));
  if (budget.state === "paused") throw new Error("Presupuesto mensual de IA agotado; el job permanece pendiente");

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.1, messages: [
      { role: "system", content: "Eres el bibliotecario de un CRM. Normaliza, detecta duplicados, contradicciones y datos obsoletos. Nunca inventes evidencia, sobrescribas hechos verificados ni propongas envíos. Devuelve solo JSON válido con summary, normalizedEntities, duplicateCandidates, contradictions, staleFacts y classification opcional." },
      { role: "user", content: JSON.stringify({ task: input.task, context: input.context }) },
    ] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`MiniMax respondió ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("MiniMax devolvió una respuesta vacía");
  const parsed = librarianResultSchema.parse(JSON.parse(cleanJson(raw)));
  await recordUsage({ workspaceId: input.workspaceId, jobId: input.jobId, model, inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0, durationMs: Date.now() - startedAt });
  return parsed;
}

function cleanJson(value: string) { return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }
async function getMonthlyMinimaxSpend(workspaceId: string) { const admin = getSupabaseAdminClient(); if (!admin) return 0; const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0); const { data } = await admin.from("ai_usage_ledger").select("cost_usd").eq("workspace_id", workspaceId).eq("provider", "minimax").gte("created_at", start.toISOString()); return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0); }
async function recordUsage(input: { workspaceId: string; jobId?: string; model: string; inputTokens: number; outputTokens: number; durationMs: number }) { const admin = getSupabaseAdminClient(); if (!admin) return; const inputRate = Number(process.env.MINIMAX_INPUT_USD_PER_MILLION ?? 0); const outputRate = Number(process.env.MINIMAX_OUTPUT_USD_PER_MILLION ?? 0); const costUsd = (input.inputTokens * inputRate + input.outputTokens * outputRate) / 1_000_000; await admin.from("ai_usage_ledger").insert({ workspace_id: input.workspaceId, job_id: input.jobId ?? null, provider: "minimax", model: input.model, input_tokens: input.inputTokens, output_tokens: input.outputTokens, cost_usd: costUsd, duration_ms: input.durationMs }); }
