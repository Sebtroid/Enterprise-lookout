import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { runMinimaxLibrarian } from "@/lib/v2/minimax";

export async function processMinimaxQueue(limit = 5, workspaceIds?: string[]) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Worker sin service role configurada");
  let query = admin.from("ai_jobs").select("id,workspace_id,job_type,input,attempts").eq("status", "approved").like("job_type", "minimax_%").order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(limit);
  if (workspaceIds) query = query.in("workspace_id", workspaceIds);
  const { data: jobs, error } = await query;
  if (error) throw error;
  const results: Array<{ id: string; status: string }> = [];
  for (const job of jobs ?? []) {
    if (job.attempts >= 2) { await admin.from("ai_jobs").update({ status: "failed", error: "Máximo de dos intentos alcanzado", updated_at: new Date().toISOString() }).eq("id", job.id); results.push({ id: job.id, status: "failed" }); continue; }
    const { data: claimed } = await admin.from("ai_jobs").update({ status: "running", claimed_by: "minimax-worker", claimed_until: new Date(Date.now() + 60_000).toISOString(), attempts: job.attempts + 1, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "approved").select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const result = await runMinimaxLibrarian({ workspaceId: job.workspace_id, jobId: job.id, task: job.job_type, context: job.input });
      await admin.from("ai_jobs").update({ status: "reviewing", result, claimed_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, status: "reviewing" });
    } catch (workerError) {
      const message = workerError instanceof Error ? workerError.message : "Error desconocido";
      const budgetPaused = message.includes("Presupuesto mensual");
      await admin.from("ai_jobs").update({ status: budgetPaused ? "budget_paused" : job.attempts + 1 >= 2 ? "failed" : "approved", error: message, claimed_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, status: budgetPaused ? "budget_paused" : "retry" });
    }
  }
  return results;
}
