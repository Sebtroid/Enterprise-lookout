import { getPostgresClient } from "@/lib/supabase/postgres";

import {
  ensureDomChatThread,
  getActiveDomTasksForCampaign,
  getDomCampaignContextById,
  getDomCampaignContextBySlug,
  getRecentDomChatHistory,
} from "./repository";
import type {
  DomApiResponse,
  DomCampaignContext,
  DomChatPayload,
  DomUser,
} from "./types";
import { normalizeDomTaskStatus } from "./status";
import {
  buildDomWebhookPayload,
  getDomWebhookToken,
  postDomWebhook,
  resolveDomWebhookUrl,
} from "./webhook";

const defaultChatUrl =
  "https://dom-assistant.vercel.app/api/chat/enterprise-lookout";

export function getDomUser(): DomUser {
  const email =
    process.env.DOM_USER_EMAIL ||
    process.env.APP_ALLOWED_EMAILS?.split(",").map((item) => item.trim())[0] ||
    "sawitting@miuandes.cl";

  return {
    id: email.split("@")[0] || "sebastian",
    email,
  };
}

export function hasDomApiToken() {
  return Boolean(getDomWebhookToken());
}

export function isAuthorizedDomRequest(authHeader: string | null) {
  if (!authHeader) return false;
  return [process.env.AGENT_API_TOKEN, process.env.DOM_API_TOKEN]
    .filter(Boolean)
    .some((token) => authHeader === `Bearer ${token}`);
}

export async function notifyDomEventForCampaignSlug({
  data,
  event,
  scope,
  user = getDomUser(),
}: {
  event: string;
  scope: string;
  data: Record<string, unknown>;
  user?: DomUser;
}) {
  const campaign = await getDomCampaignContextBySlug(scope);
  if (!campaign) return { ok: false, skipped: true, reason: "missing_campaign" };

  return notifyDomEvent({ campaign, data, event, user });
}

export async function notifyDomEventForCampaignId({
  campaignId,
  data,
  event,
  user = getDomUser(),
}: {
  event: string;
  campaignId: string;
  data: Record<string, unknown>;
  user?: DomUser;
}) {
  const campaign = await getDomCampaignContextById(campaignId);
  if (!campaign) return { ok: false, skipped: true, reason: "missing_campaign" };

  return notifyDomEvent({ campaign, data, event, user });
}

export async function notifyDomEvent({
  campaign,
  data,
  event,
  user = getDomUser(),
}: {
  event: string;
  campaign: DomCampaignContext;
  data: Record<string, unknown>;
  user?: DomUser;
}) {
  const payload = buildDomWebhookPayload({
    eventType: event,
    eventId: getEventId(data),
    campaign,
    payload: data,
    priority: "normal",
    user,
  });

  const response = await postDomWebhook({
    url: resolveDomWebhookUrl(),
    eventType: event,
    body: payload,
  });

  if (response.data) {
    await persistDomApiResponse({
      campaign,
      event,
      metadata: data,
      response: response.data,
      source: "webhook",
    });
  }

  return response;
}

export async function sendChatMessageToDom({
  campaign,
  message,
  threadId,
  user = getDomUser(),
}: {
  campaign: DomCampaignContext;
  threadId: string;
  message: string;
  user?: DomUser;
}) {
  const [history, tasks] = await Promise.all([
    getRecentDomChatHistory(threadId, 20),
    getActiveDomTasksForCampaign(campaign.dbId),
  ]);
  const payload: DomChatPayload = {
    event: "chat_message",
    thread_id: threadId,
    campaign,
    message,
    history,
    tasks,
    user,
  };

  const response = await postDomWebhook({
    url: process.env.DOM_CHAT_URL || defaultChatUrl,
    eventType: "user_chat_message",
    body: payload,
  });

  if (response.data) {
    await persistDomApiResponse({
      campaign,
      event: "chat_message",
      metadata: { threadId },
      response: response.data,
      source: "chat",
      threadId,
    });
  }

  return response;
}

export async function persistDomApiResponse({
  campaign,
  event,
  metadata,
  response,
  source,
  threadId,
}: {
  campaign: DomCampaignContext;
  event: string;
  metadata?: Record<string, unknown>;
  response: DomApiResponse;
  source: "chat" | "webhook" | "callback";
  threadId?: string | null;
}) {
  const sql = getPostgresClient();
  if (!sql) return;

  const thread =
    threadId
      ? { id: threadId }
      : await ensureDomChatThread(campaign.dbId, campaign.name);
  if (!thread?.id) return;

  await sql.begin(async (tx) => {
    if (response.message) {
      await tx`
        insert into chat_messages (
          thread_id,
          role,
          content,
          metadata
        ) values (
          ${thread.id},
          'dom',
          ${response.message},
          ${tx.json({ event, source, ...metadata })}
        )
      `;
    }

    for (const task of response.tasks_created ?? []) {
      const description = String(task.description ?? "").trim();
      if (!description) continue;

      await tx`
        insert into dom_tasks (
          campaign_id,
          description,
          status,
          created_by,
          context,
          chat_thread_id
        ) values (
          ${campaign.dbId},
          ${description},
          ${normalizeDomTaskStatus(task.status)}::dom_task_status,
          'dom',
          ${tx.json({
            externalId: task.id ?? null,
            event,
            source,
            ...metadata,
          })},
          ${thread.id}
        )
      `;
    }

    await applyDomActionsInTransaction({
      actions: response.actions ?? [],
      campaign,
      source,
      threadId: thread.id,
      tx,
    });

    await tx`
      update chat_threads
      set updated_at = now()
      where id = ${thread.id}
    `;
  });
}

export async function persistDomCallbackResponse({
  campaign,
  event,
  response,
  threadId,
}: {
  campaign: DomCampaignContext;
  event: string;
  response: DomApiResponse;
  threadId?: string | null;
}) {
  await persistDomApiResponse({
    campaign,
    event,
    response,
    source: "callback",
    threadId,
  });
}

async function applyDomActionsInTransaction({
  actions,
  campaign,
  source,
  threadId,
  tx,
}: {
  actions: Array<Record<string, unknown>>;
  campaign: DomCampaignContext;
  source: string;
  threadId: string;
  // postgres.js transaction tags have helper overloads stricter than this use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
}) {
  for (const action of actions) {
    const type = String(action.type ?? "");

    if (type === "update_task" && action.task_id) {
      await tx`
        update dom_tasks
        set
          status = ${normalizeDomTaskStatus(action.status)}::dom_task_status,
          result = coalesce(${nullableText(action.result)}, result),
          updated_at = now()
        where id = ${String(action.task_id)}
      `;
    }

    if (type === "create_task" && action.description) {
      await tx`
        insert into dom_tasks (
          campaign_id,
          description,
          status,
          created_by,
          context,
          chat_thread_id
        ) values (
          ${campaign.dbId},
          ${String(action.description)},
          ${normalizeDomTaskStatus(action.status)}::dom_task_status,
          'dom',
          ${tx.json({ action, source })},
          ${threadId}
        )
      `;
    }

    if (type === "create_draft") {
      await createDraftFromDomAction({ action, campaign, source, threadId, tx });
    }
  }
}

async function createDraftFromDomAction({
  action,
  campaign,
  source,
  threadId,
  tx,
}: {
  action: Record<string, unknown>;
  campaign: DomCampaignContext;
  source: string;
  threadId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
}) {
  const companyId = nullableText(action.company_id);
  const subject = nullableText(action.subject);
  const body = nullableText(action.body);
  const sourceMessageId = nullableText(action.source_message_id);
  if (!companyId || !subject || !body) return;

  const contactRows = action.contact_id
    ? await tx`
        select id
        from contacts
        where id = ${String(action.contact_id)}
        limit 1
      `
    : await tx`
        select id
        from contacts
        where company_id = ${companyId}
          and do_not_contact = false
        order by
          (verification_status = 'verified') desc,
          confidence desc nulls last,
          created_at asc
        limit 1
      `;
  const contactId = contactRows[0]?.id ?? null;

  const senderRows = await tx`
    select csa.sender_account_id
    from campaign_sender_accounts csa
    join sender_accounts sa on sa.id = csa.sender_account_id
    where csa.campaign_id = ${campaign.dbId}
      and sa.status = 'active'
    order by csa.is_default desc, csa.priority asc
    limit 1
  `;
  const senderId = senderRows[0]?.sender_account_id ?? null;
  if (!senderId) return;

  const futureNote = sourceMessageId
    ? `Nuevo borrador generado desde rechazo del mensaje ${sourceMessageId}. Borrador creado por Dom desde ${source}; chat_thread_id=${threadId}.`
    : `Borrador creado por Dom desde ${source}; chat_thread_id=${threadId}.`;

  const inserted = await tx`
    insert into messages (
      campaign_id,
      company_id,
      contact_id,
      sender_account_id,
      kind,
      status,
      subject_draft,
      body_draft,
      future_note
    ) values (
      ${campaign.dbId},
      ${companyId},
      ${contactId},
      ${senderId},
      'outbound_initial',
      'needs_review',
      ${subject},
      ${body},
      ${futureNote}
    )
    returning id
  `;

  await tx`
    update campaign_contacts
    set
      status = 'draft_ready',
      contact_id = coalesce(contact_id, ${contactId}),
      updated_at = now()
    where campaign_id = ${campaign.dbId}
      and company_id = ${companyId}
  `;

  if (sourceMessageId && inserted[0]?.id) {
    await tx`
      update messages
      set
        future_note = concat_ws(
          ' ',
          nullif(future_note, ''),
          ${`Nueva redacción creada por Dom: ${inserted[0].id}.`}
        ),
        updated_at = now()
      where id = ${sourceMessageId}
        and status = 'rejected'
    `;
  }
}

function nullableText(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text || null;
}

function getEventId(data: Record<string, unknown>) {
  if (typeof data.event_id === "string" && data.event_id) return data.event_id;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
