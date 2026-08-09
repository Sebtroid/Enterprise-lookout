import { decryptToken, encryptToken, isEncryptedToken } from "@/lib/gmail/token-crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertProjectWriteAccessForUser, assertWorkspaceRow } from "@/lib/v2/project-authorization";

type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; threadId: string; historyId?: string; internalDate?: string; labelIds?: string[]; snippet?: string; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } };

export async function syncGmailAccount(accountId: string, userId: string) {
  const { admin, account, accessToken } = await getReadableGmailAccount(accountId, userId, "can_read");
  await admin.from("gmail_accounts").update({ sync_status: "syncing" }).eq("id", accountId);
  try {
    let messageIds: string[] = [];
    if (account.history_id) messageIds = await listHistoryMessageIds(accessToken, account.history_id);
    if (!account.history_id || messageIds.length === 0) messageIds = await listRecentMessageIds(accessToken, account.initial_sync_after);
    const messages: GmailMessage[] = [];
    for (let index = 0; index < messageIds.length; index += 10) {
      messages.push(...(await Promise.all(messageIds.slice(index, index + 10).map((id) => getGmailMessage(accessToken, id, "metadata")))));
    }
    for (const message of messages) await persistMessageMetadata(admin, account, message);
    const profile = await gmailJson<{ historyId?: string }>(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
    await admin.from("gmail_accounts").update({ history_id: profile.historyId ?? account.history_id, sync_status: "ready", last_synced_at: new Date().toISOString() }).eq("id", accountId);
    return { accountId, indexed: messages.length, mode: account.history_id ? "incremental" : "initial" };
  } catch (error) { await admin.from("gmail_accounts").update({ sync_status: "error" }).eq("id", accountId); throw error; }
}

export async function readGmailThread(threadId: string, userId: string) {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Supabase no está configurado");
  const { data: thread } = await admin.from("mail_threads").select("*, gmail_accounts!inner(id,email)").eq("id", threadId).single();
  if (!thread) throw new Error("Hilo no encontrado");
  const { accessToken } = await getReadableGmailAccount(thread.gmail_account_id, userId, "can_read");
  const data = await gmailJson<{ messages?: GmailMessage[] }>(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(thread.gmail_thread_id)}?format=full`);
  const messages = (data.messages ?? []).map((message) => extractGmailMessage(message, thread.gmail_accounts.email));
  if (thread.is_crm_linked) {
    for (const message of messages) await admin.from("mail_messages").upsert({ workspace_id: thread.workspace_id, thread_id: thread.id, gmail_message_id: message.id, sender: message.sender, recipients: message.recipients, cc: message.cc, subject: message.subject, snippet: message.snippet, body_text: message.bodyText, body_html: message.bodyHtml, is_crm_linked: true, attachment_links: message.attachments, sent_at: message.sentAt }, { onConflict: "thread_id,gmail_message_id" });
  }
  return { ...thread, messages };
}

export async function linkGmailThread(input: { threadId: string; userId: string; projectId: string; companyId?: string | null; contactId?: string | null }) {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Supabase no está configurado");
  const { data: thread } = await admin.from("mail_threads").select("workspace_id,gmail_account_id").eq("id", input.threadId).single(); if (!thread) throw new Error("Hilo no encontrado");
  await getReadableGmailAccount(thread.gmail_account_id, input.userId, "can_read");
  const project = await assertProjectWriteAccessForUser(input.projectId, input.userId); if (project.workspace_id !== thread.workspace_id) throw new Error("Proyecto fuera del workspace");
  await Promise.all([input.companyId ? assertWorkspaceRow("companies", input.companyId, thread.workspace_id) : null, input.contactId ? assertWorkspaceRow("contacts", input.contactId, thread.workspace_id) : null]);
  const { error } = await admin.from("mail_threads").update({ project_id: input.projectId, company_id: input.companyId ?? null, contact_id: input.contactId ?? null, is_crm_linked: true, updated_at: new Date().toISOString() }).eq("id", input.threadId); if (error) throw error;
  return readGmailThread(input.threadId, input.userId);
}

export function extractGmailMessage(message: GmailMessage, accountEmail = "") {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const bodies = collectBodies(message.payload);
  const attachments = collectAttachments(message.payload).map((attachment) => ({ ...attachment, gmailUrl: `https://mail.google.com/mail/u/${encodeURIComponent(accountEmail)}/#all/${message.threadId}` }));
  return { id: message.id, threadId: message.threadId, sender: headers.from ?? "", recipients: splitAddresses(headers.to), cc: splitAddresses(headers.cc), subject: headers.subject ?? "", snippet: message.snippet ?? "", bodyText: bodies.text, bodyHtml: bodies.html, attachments, sentAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null };
}

export async function getReadableGmailAccount(accountId: string, userId: string, permission: "can_read" | "can_send" | "can_manage") {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Supabase no está configurado");
  const { data: permissionRow } = await admin.from("gmail_account_permissions").select("can_read,can_send,can_manage").eq("gmail_account_id", accountId).eq("user_id", userId).eq("active", true).maybeSingle();
  if (!permissionRow || !Boolean((permissionRow as Record<string, unknown>)[permission])) throw new Error("El usuario no tiene permiso sobre esta cuenta Gmail");
  const { data: account } = await admin.from("gmail_accounts").select("*").eq("id", accountId).eq("active", true).single(); if (!account) throw new Error("Cuenta Gmail desconectada");
  if (!isEncryptedToken(account.encrypted_access_token) || !isEncryptedToken(account.encrypted_refresh_token)) throw new Error("La cuenta Gmail requiere reconexión segura");
  let accessToken = decryptToken(account.encrypted_access_token); if (new Date(account.expires_at) <= new Date()) { const refreshed = await refreshGmailToken(decryptToken(account.encrypted_refresh_token)); accessToken = refreshed.access_token; await admin.from("gmail_accounts").update({ encrypted_access_token: encryptToken(accessToken), expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() }).eq("id", accountId); }
  return { admin, account, accessToken };
}
async function refreshGmailToken(refreshToken: string) { if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) throw new Error("Gmail OAuth no está configurado"); const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, grant_type: "refresh_token" }) }); const data = await response.json() as { access_token?: string; expires_in?: number }; if (!response.ok || !data.access_token) throw new Error("La cuenta Gmail requiere reconexión"); return { access_token: data.access_token, expires_in: data.expires_in ?? 3600 }; }
async function listRecentMessageIds(token: string, after: string) { const ids: string[] = []; let pageToken = ""; do { const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages"); url.searchParams.set("maxResults", "100"); url.searchParams.set("q", `after:${Math.floor(new Date(after).getTime() / 1000)}`); if (pageToken) url.searchParams.set("pageToken", pageToken); const data = await gmailJson<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(token, url.toString()); ids.push(...(data.messages ?? []).map((item) => item.id)); pageToken = data.nextPageToken ?? ""; } while (pageToken && ids.length < 500); return ids; }
async function listHistoryMessageIds(token: string, historyId: string) { const ids = new Set<string>(); let pageToken = ""; do { const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history"); url.searchParams.set("startHistoryId", historyId); url.searchParams.set("historyTypes", "messageAdded"); if (pageToken) url.searchParams.set("pageToken", pageToken); const data = await gmailJson<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; nextPageToken?: string }>(token, url.toString()); for (const entry of data.history ?? []) for (const added of entry.messagesAdded ?? []) ids.add(added.message.id); pageToken = data.nextPageToken ?? ""; } while (pageToken); return [...ids]; }
async function getGmailMessage(token: string, id: string, format: "metadata" | "full") { const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`); url.searchParams.set("format", format); if (format === "metadata") for (const header of ["From", "To", "Cc", "Subject", "Date"]) url.searchParams.append("metadataHeaders", header); return gmailJson<GmailMessage>(token, url.toString()); }
async function persistMessageMetadata(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, account: Record<string, unknown>, message: GmailMessage) { const parsed = extractGmailMessage(message); const { data: thread, error } = await admin.from("mail_threads").upsert({ workspace_id: account.workspace_id, gmail_account_id: account.id, gmail_thread_id: message.threadId, subject: parsed.subject || "(Sin asunto)", snippet: parsed.snippet, labels: message.labelIds ?? [], last_message_at: parsed.sentAt, is_crm_linked: false }, { onConflict: "gmail_account_id,gmail_thread_id" }).select("id,is_crm_linked").single(); if (error) throw error; const { error: messageError } = await admin.from("mail_messages").upsert({ workspace_id: account.workspace_id, thread_id: thread.id, gmail_message_id: message.id, sender: parsed.sender, recipients: parsed.recipients, cc: parsed.cc, subject: parsed.subject, snippet: parsed.snippet, body_text: null, body_html: null, is_crm_linked: thread.is_crm_linked, attachment_links: [], sent_at: parsed.sentAt }, { onConflict: "thread_id,gmail_message_id" }); if (messageError) throw messageError; }
async function gmailJson<T>(token: string, url: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`Gmail API respondió ${response.status}`); return response.json() as Promise<T>; }
function decodeBody(data?: string) { return data ? Buffer.from(data, "base64url").toString("utf8") : ""; }
function collectBodies(part?: GmailPart): { text: string; html: string } { if (!part) return { text: "", html: "" }; let text = part.mimeType === "text/plain" ? decodeBody(part.body?.data) : ""; let html = part.mimeType === "text/html" ? decodeBody(part.body?.data) : ""; for (const child of part.parts ?? []) { const nested = collectBodies(child); text += nested.text; html += nested.html; } return { text: text.trim(), html: html.trim() }; }
function collectAttachments(part?: GmailPart): Array<{ filename: string; attachmentId: string }> { if (!part) return []; const own = part.filename && part.body?.attachmentId ? [{ filename: part.filename, attachmentId: part.body.attachmentId }] : []; return [...own, ...(part.parts ?? []).flatMap(collectAttachments)]; }
function splitAddresses(value?: string) { return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []; }
