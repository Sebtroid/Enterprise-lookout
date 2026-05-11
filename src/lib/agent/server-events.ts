import {
  getDomUser,
  persistDomApiResponse,
} from "@/lib/dom/client";
import {
  getDomCampaignContextById,
  getDomCampaignContextBySlug,
} from "@/lib/dom/repository";
import {
  buildDomWebhookPayload,
  postDomWebhook,
  resolveDomWebhookUrl,
  type DomWebhookPostResult,
} from "@/lib/dom/webhook";
import {
  notifyDomViaTelegramForAgentEvent,
  type DomTelegramNotificationResult,
} from "@/lib/dom/telegram";
import { getPostgresClient } from "@/lib/supabase/postgres";

import type { AgentEventInput, AgentEventType } from "./events";

export const DOM_WEBHOOK_EVENT_TYPES = new Set<AgentEventType>([
  "dom_task_created",
  "company_classified",
  "contact_added",
  "mail_rejected",
  "campaign_created",
  "lead_created",
  "lead_updated",
  "reply_received",
  "user_chat_message",
  "mail_created",
  "mail_approved",
  "mail_sent",
  "campaign_updated",
  "research_needed",
  "followup_needed",
  "draft_needed",
]);

export function shouldDispatchDomWebhook(event: AgentEventType) {
  return DOM_WEBHOOK_EVENT_TYPES.has(event);
}

type PersistedAgentEventRow = {
  id: string;
  created_at: string | Date;
};

export type PersistAgentEventResult =
  | {
      ok: true;
      inbox_id: string;
      created_at: string;
      telegram: DomTelegramNotificationResult;
      webhook: DomWebhookPostResult | { ok: false; skipped: true; reason: string };
    }
  | {
      ok: false;
      error: string;
    };

export async function persistAgentEvent(
  input: AgentEventInput,
): Promise<PersistAgentEventResult> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, error: "Database unavailable" };

  try {
    const campaignId = nullIfEmpty(input.campaignId);
    const companyId = nullIfEmpty(input.companyId);
    const contactId = nullIfEmpty(input.contactId);
    const messageId = nullIfEmpty(input.messageId);
    const payload = input.data ?? {};

    const [row] = await sql<PersistedAgentEventRow[]>`
      insert into agent_inbox (
        event_type,
        campaign_id,
        company_id,
        contact_id,
        message_id,
        payload,
        priority,
        source,
        status
      ) values (
        ${input.event},
        ${campaignId},
        ${companyId},
        ${contactId},
        ${messageId},
        ${sql.json(payload as Parameters<typeof sql.json>[0])},
        ${input.priority ?? "normal"},
        ${input.source ?? "app"},
        'pending'
      )
      returning id::text as id, created_at
    `;

    const [telegram, webhook] = await Promise.all([
      notifyDomViaTelegramForAgentEvent({
        campaignId,
        eventType: input.event,
      }),
      dispatchDomWebhookForAgentEvent({
        campaignId,
        companyId,
        contactId,
        input,
        messageId,
        payload,
        row,
      }),
    ]);

    return {
      ok: true,
      inbox_id: row.id,
      created_at: toIsoString(row.created_at),
      telegram,
      webhook,
    };
  } catch (err) {
    console.error("[agent/events] insert failed:", err);
    return { ok: false, error: "Failed to persist event" };
  }
}

async function dispatchDomWebhookForAgentEvent({
  campaignId,
  companyId,
  contactId,
  input,
  messageId,
  payload,
  row,
}: {
  campaignId: string | null;
  companyId: string | null;
  contactId: string | null;
  input: AgentEventInput;
  messageId: string | null;
  payload: Record<string, unknown>;
  row: PersistedAgentEventRow;
}) {
  if (!shouldDispatchDomWebhook(input.event)) {
    return { ok: false as const, skipped: true as const, reason: "event_not_webhooked" };
  }

  const campaign = await resolveCampaignForEvent(campaignId, payload);
  if (!campaign) {
    return { ok: false as const, skipped: true as const, reason: "missing_campaign" };
  }

  const webhookPayload = buildDomWebhookPayload({
    eventType: input.event,
    eventId: row.id,
    campaign,
    payload: {
      ...payload,
      campaign_id: campaign.dbId,
      campaign_slug: campaign.id,
      company_id: companyId,
      contact_id: contactId,
      message_id: messageId,
      source: input.source ?? "app",
    },
    priority: input.priority ?? "normal",
    user: getUserFromPayload(payload),
  });

  const result = await postDomWebhook({
    url: resolveDomWebhookUrl(),
    eventType: input.event,
    body: webhookPayload,
  });

  if (result.ok) {
    await markDomTaskReceived(input.event, payload, result.status);
  }

  if (result.data) {
    await persistDomApiResponse({
      campaign,
      event: input.event,
      metadata: webhookPayload.payload,
      response: result.data,
      source: "webhook",
    });
  }

  return result;
}

async function markDomTaskReceived(
  event: AgentEventType,
  payload: Record<string, unknown>,
  webhookStatus: number,
) {
  if (event !== "dom_task_created") return;

  const taskId = stringOrNull(payload.task_id);
  if (!taskId) return;

  const sql = getPostgresClient();
  if (!sql) return;

  await sql`
    update dom_tasks
    set
      status = case
        when status = 'pending' then 'received'::dom_task_status
        else status
      end,
      progress_message = coalesce(progress_message, 'Dom recibio la tarea.'),
      progress_percent = coalesce(progress_percent, 0),
      last_progress_at = coalesce(last_progress_at, now()),
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        webhook_ack: {
          status: webhookStatus,
          received_at: new Date().toISOString(),
        },
      })}::jsonb,
      updated_at = now()
    where id = ${taskId}
  `;
}

async function resolveCampaignForEvent(
  campaignId: string | null,
  payload: Record<string, unknown>,
) {
  if (campaignId) {
    const campaign = await getDomCampaignContextById(campaignId);
    if (campaign) return campaign;
  }

  const campaignSlug = stringOrNull(payload.campaign_slug) ?? stringOrNull(payload.slug);
  if (campaignSlug) {
    const campaign = await getDomCampaignContextBySlug(campaignSlug);
    if (campaign) return campaign;
  }

  const payloadCampaignId = stringOrNull(payload.campaign_id);
  if (payloadCampaignId) {
    const campaign = await getDomCampaignContextById(payloadCampaignId);
    if (campaign) return campaign;
  }

  return null;
}

function getUserFromPayload(payload: Record<string, unknown>) {
  const fallback = getDomUser();
  return {
    id: stringOrNull(payload.user_id) ?? fallback.id,
    email: stringOrNull(payload.user_email) ?? fallback.email,
  };
}

function nullIfEmpty(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stringOrNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}
