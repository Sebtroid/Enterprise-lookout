import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { evaluateFollowupReadiness } from "@/lib/v2/domain";
import { sendApprovedV2Draft } from "@/lib/v2/gmail-send";

export async function activateFollowupSequence(sequenceId: string, userId: string) {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Supabase no está configurado");
  const { data: sequence } = await admin.from("followup_sequences").select("*, projects!inner(owner_user_id)").eq("id", sequenceId).single(); if (!sequence) throw new Error("Secuencia no encontrada");
  if (sequence.projects.owner_user_id !== userId) throw new Error("Solo el dueño del proyecto puede activar la automatización");
  const { data: steps } = await admin.from("followup_steps").select("step_number,interval_days,approved_at").eq("sequence_id", sequenceId).order("step_number");
  const readiness = evaluateFollowupReadiness({ approvedFollowups: sequence.approved_followups, sentFollowups: sequence.sent_followups, complianceAlerts: sequence.compliance_alerts, steps: (steps ?? []).map((step) => ({ stepNumber: step.step_number, intervalDays: step.interval_days, approved: Boolean(step.approved_at) })) });
  if (!readiness.eligible) throw new Error(readiness.reasons.join("; "));
  const { error } = await admin.from("followup_sequences").update({ status: "active", activated_by: userId, activated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sequenceId); if (error) throw error;
  return { sequenceId, status: "active" };
}

export async function processDueFollowups(limit = 10, workspaceIds?: string[]) {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Supabase no está configurado");
  let query = admin.from("followup_enrollments").select("*").eq("status", "pending").lte("due_at", new Date().toISOString()).order("due_at").limit(limit);
  if (workspaceIds) query = query.in("workspace_id", workspaceIds);
  const { data: enrollments, error } = await query; if (error) throw error;
  const results: Array<{ id: string; status: string }> = [];
  for (const enrollment of enrollments ?? []) {
    const { data: sequence } = await admin.from("followup_sequences").select("*").eq("id", enrollment.sequence_id).single();
    if (!sequence || sequence.status !== "active" || !sequence.activated_by) { await stop(enrollment.id, "sequence_inactive"); results.push({ id: enrollment.id, status: "stopped" }); continue; }
    const { data: step } = await admin.from("followup_steps").select("*").eq("sequence_id", enrollment.sequence_id).eq("step_number", enrollment.next_step).not("approved_at", "is", null).maybeSingle();
    if (!step) { await stop(enrollment.id, "step_not_approved"); results.push({ id: enrollment.id, status: "stopped" }); continue; }
    const stopReason = await getStopReason(enrollment);
    if (stopReason) { await stop(enrollment.id, stopReason); results.push({ id: enrollment.id, status: "stopped" }); continue; }
    const idempotencyKey = `followup:${enrollment.id}:step:${enrollment.next_step}`;
    const { data: draft, error: draftError } = await admin.from("mail_drafts").upsert({ workspace_id: enrollment.workspace_id, project_id: enrollment.project_id, thread_id: enrollment.thread_id, company_id: enrollment.company_id, contact_id: enrollment.contact_id, sender_identity_id: sequence.sender_identity_id, kind: "followup", subject: step.subject_template ?? "Seguimiento", to_email: enrollment.to_email, body: step.body_template, status: "approved", created_by_origin: "system", created_by_user_id: sequence.activated_by, approved_by: sequence.activated_by, approved_at: new Date().toISOString(), idempotency_key: idempotencyKey }, { onConflict: "workspace_id,idempotency_key" }).select("id").single();
    if (draftError) { results.push({ id: enrollment.id, status: "failed" }); continue; }
    try {
      await sendApprovedV2Draft(draft.id, sequence.activated_by);
      const nextStep = enrollment.next_step + 1;
      if (nextStep > 3) await admin.from("followup_enrollments").update({ status: "completed", last_draft_id: draft.id, updated_at: new Date().toISOString() }).eq("id", enrollment.id);
      else { const { data: next } = await admin.from("followup_steps").select("interval_days").eq("sequence_id", enrollment.sequence_id).eq("step_number", nextStep).maybeSingle(); if (!next) await admin.from("followup_enrollments").update({ status: "completed", last_draft_id: draft.id, updated_at: new Date().toISOString() }).eq("id", enrollment.id); else await admin.from("followup_enrollments").update({ next_step: nextStep, due_at: new Date(Date.now() + next.interval_days * 86_400_000).toISOString(), last_draft_id: draft.id, updated_at: new Date().toISOString() }).eq("id", enrollment.id); }
      results.push({ id: enrollment.id, status: "sent" });
    } catch (sendError) { const reason = sendError instanceof Error ? sendError.message : "send_failed"; await stop(enrollment.id, reason); results.push({ id: enrollment.id, status: "stopped" }); }
  }
  return results;
}

async function getStopReason(enrollment: Record<string, unknown>) { const admin = getSupabaseAdminClient()!; const email = String(enrollment.to_email); const domain = email.split("@")[1] ?? ""; const { count: suppressed } = await admin.from("suppression_entries").select("id", { count: "exact", head: true }).eq("workspace_id", enrollment.workspace_id).or(`email.eq.${email},domain.eq.${domain}`); if (suppressed) return "suppressed"; if (enrollment.thread_id) { const { data: thread } = await admin.from("mail_threads").select("gmail_account_id,gmail_accounts!inner(email,active)").eq("id", enrollment.thread_id).single(); const linkedAccount = Array.isArray(thread?.gmail_accounts) ? thread.gmail_accounts[0] : thread?.gmail_accounts; if (!thread || !linkedAccount?.active) return "account_disconnected"; const { data: messages } = await admin.from("mail_messages").select("sender").eq("thread_id", enrollment.thread_id); if ((messages ?? []).some((message) => !String(message.sender).toLowerCase().includes(String(linkedAccount.email).toLowerCase()))) return "reply_received"; } return null; }
async function stop(id: string, reason: string) { const admin = getSupabaseAdminClient()!; await admin.from("followup_enrollments").update({ status: "stopped", stopped_reason: reason, updated_at: new Date().toISOString() }).eq("id", id); }
