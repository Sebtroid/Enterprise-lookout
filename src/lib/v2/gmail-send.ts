import { buildGmailSendBody, buildMimeMessage, encodeRawMessage } from "@/lib/gmail/mime";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { evaluateV2SendReadiness } from "@/lib/v2/gmail-policy";
import { getReadableGmailAccount } from "@/lib/v2/gmail-sync";
import { requireGmailDraftProvider } from "@/lib/v2/mail-provider";
import { assertProjectWriteAccessForUser } from "@/lib/v2/project-authorization";

export async function sendApprovedV2Draft(draftId: string, userId: string) {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Supabase no está configurado");
  const { data: draft } = await admin.from("mail_drafts").select("*, sender_identities!inner(id,gmail_account_id,microsoft_account_id,display_name,active)").eq("id", draftId).single();
  if (!draft) throw new Error("Borrador no encontrado");
  if (!draft.project_id) throw new Error("El borrador no pertenece a un proyecto");
  await assertProjectWriteAccessForUser(draft.project_id, userId);
  const identity = draft.sender_identities as { gmail_account_id: string | null; microsoft_account_id: string | null; display_name: string; active: boolean };
  const gmailAccountId = requireGmailDraftProvider({ gmailAccountId: identity.gmail_account_id, microsoftAccountId: identity.microsoft_account_id });
  const { account, accessToken } = await getReadableGmailAccount(gmailAccountId, userId, "can_send");
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const { count: sentToday } = await admin.from("mail_drafts").select("id", { count: "exact", head: true }).eq("sender_identity_id", draft.sender_identity_id).eq("status", "sent").gte("sent_at", dayStart.toISOString());
  const { data: suppressions } = await admin.from("suppression_entries").select("reason").eq("workspace_id", draft.workspace_id).or(`email.eq.${draft.to_email},domain.eq.${String(draft.to_email ?? "").split("@")[1] ?? ""}`);
  const { count: duplicateCount } = await admin.from("mail_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", draft.workspace_id).eq("project_id", draft.project_id).eq("to_email", draft.to_email).eq("kind", "first_contact").eq("status", "sent").neq("id", draft.id);
  let hasReply = false;
  let gmailThreadId: string | null = null;
  if (draft.thread_id) { const { data: thread } = await admin.from("mail_threads").select("gmail_thread_id").eq("id", draft.thread_id).single(); gmailThreadId = thread?.gmail_thread_id ?? null; const { data: messages } = await admin.from("mail_messages").select("sender").eq("thread_id", draft.thread_id); hasReply = (messages ?? []).some((message) => !String(message.sender).toLowerCase().includes(String(account.email).toLowerCase())); }
  const readiness = evaluateV2SendReadiness({ accountActive: Boolean(account.active), accountConnected: account.sync_status !== "disconnected", alreadyContacted: Boolean(duplicateCount), approved: draft.status === "approved", bounced: (suppressions ?? []).some((item) => item.reason === "bounce"), canSend: true, dailyLimit: 30, hasReply: draft.kind === "followup" && hasReply, identityConflict: !identity.active, sentToday: sentToday ?? 0, suppressed: Boolean(suppressions?.length) });
  if (!readiness.ok) throw new Error(`Envío bloqueado: ${readiness.reason}`);
  if (!draft.to_email || !draft.subject || !draft.body) throw new Error("El borrador no tiene destinatario, asunto o cuerpo");
  const { data: claimed } = await admin.from("mail_drafts").update({ status: "sending", send_claimed_at: new Date().toISOString(), send_error: null, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "approved").select("id").maybeSingle();
  if (!claimed) throw new Error("Envío bloqueado: el borrador ya fue reclamado");
  let sent: { id?: string; threadId?: string; error?: { message?: string } };
  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(buildGmailSendBody({ raw: encodeRawMessage(buildMimeMessage({ from: account.email, to: draft.to_email, subject: draft.subject, body: draft.body })), threadId: draft.kind === "reply" || draft.kind === "followup" ? gmailThreadId : null })) });
    sent = await response.json() as { id?: string; threadId?: string; error?: { message?: string } };
    if (!response.ok || !sent.id) throw new Error(sent.error?.message ?? "Gmail rechazó el envío");
  } catch (error) {
    await admin.from("mail_drafts").update({ status: "failed", send_error: error instanceof Error ? error.message.slice(0, 500) : "gmail_send_failed", updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "sending");
    throw error;
  }
  await admin.from("mail_drafts").update({ status: "sent", sent_at: new Date().toISOString(), sent_gmail_message_id: sent.id, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "sending");
  await admin.from("activity_events").insert({ workspace_id: draft.workspace_id, project_id: draft.project_id, actor_user_id: userId, origin: "gmail", event_type: "mail_sent", object_type: "mail_draft", object_id: draft.id, summary: `Correo enviado a ${draft.to_email}`, detail: { gmailMessageId: sent.id, gmailThreadId: sent.threadId ?? gmailThreadId } });
  return { draftId: draft.id, gmailMessageId: sent.id, gmailThreadId: sent.threadId ?? gmailThreadId, sent: true };
}
