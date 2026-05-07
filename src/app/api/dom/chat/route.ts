import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendAgentEvent } from "@/lib/agent/events";
import { getAllowedUser } from "@/lib/auth/request";
import {
  isAuthorizedDomRequest,
  persistDomCallbackResponse,
} from "@/lib/dom/client";
import {
  ensureDomChatThread,
  getDomCampaignContextById,
  getDomCampaignContextBySlug,
  getDomChatMessages,
  getDomTasksData,
  getDomWorkspaceData,
} from "@/lib/dom/repository";
import { isAllCampaignsScope } from "@/lib/prospecting/repository";
import { getPostgresClient } from "@/lib/supabase/postgres";

const userChatSchema = z.object({
  message: z.string().min(1),
  scope: z.string().min(1),
  threadId: z.string().uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAllowedUser({ allowDemoUser: true, request: req });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = req.nextUrl.searchParams.get("scope") || "all";
  const data = await getDomWorkspaceData(scope);

  return NextResponse.json({ ok: true, ...data });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (isAuthorizedDomRequest(authHeader)) {
    return handleDomCallback(await req.json().catch(() => ({})));
  }

  const user = await getAllowedUser({ allowDemoUser: true, request: req });
  const sql = getPostgresClient();
  if (!user || !sql) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = userChatSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid chat message" },
      { status: 400 },
    );
  }

  const { message, scope, threadId } = parsed.data;
  if (isAllCampaignsScope(scope)) {
    return NextResponse.json(
      { ok: false, error: "Choose a concrete campaign before chatting with Dom" },
      { status: 400 },
    );
  }

  const campaign = await getDomCampaignContextBySlug(scope);
  if (!campaign) {
    return NextResponse.json(
      { ok: false, error: "Campaign not found" },
      { status: 404 },
    );
  }

  const thread = threadId
    ? { id: threadId }
    : await ensureDomChatThread(campaign.dbId, campaign.name);
  if (!thread?.id) {
    return NextResponse.json(
      { ok: false, error: "Could not create chat thread" },
      { status: 500 },
    );
  }

  const inserted = await sql`
    insert into chat_messages (
      thread_id,
      role,
      content,
      metadata
    ) values (
      ${thread.id},
      'user',
      ${message},
      ${sql.json({ source: "dashboard", user_id: user.id, user_email: user.email })}
    )
    returning id::text as id
  `;
  const chatMessageId = String(inserted[0]?.id ?? "");

  const agentEvent = await sendAgentEvent({
    event: "user_chat_message",
    campaignId: campaign.dbId,
    data: {
      campaign_id: campaign.dbId,
      campaign_slug: campaign.id,
      message,
      user_id: user.id,
      user_email: user.email,
      chat_thread_id: thread.id,
      chat_message_id: chatMessageId,
    },
    priority: "normal",
    source: "app_chat",
  });

  const [messages, tasks] = await Promise.all([
    getDomChatMessages(thread.id),
    getDomTasksData(scope),
  ]);

  return NextResponse.json({
    ok: true,
    agentEvent,
    threadId: thread.id,
    messages,
    tasks,
  });
}

async function handleDomCallback(body: Record<string, unknown>) {
  const campaign = await resolveCampaignFromCallback(body);
  if (!campaign) {
    return NextResponse.json(
      { ok: false, error: "Campaign not found" },
      { status: 404 },
    );
  }

  const actions = Array.isArray(body.actions)
    ? (body.actions as Array<Record<string, unknown>>)
    : [];
  if (body.task_id && body.status) {
    actions.push({
      type: "update_task",
      task_id: body.task_id,
      status: body.status,
      result: body.result,
    });
  }

  await persistDomCallbackResponse({
    campaign,
    event: String(body.event ?? "dom_chat_callback"),
    response: {
      ok: body.ok === undefined ? true : Boolean(body.ok),
      message: typeof body.message === "string" ? body.message : undefined,
      tasks_created: Array.isArray(body.tasks_created)
        ? (body.tasks_created as [])
        : undefined,
      actions,
    },
    threadId: typeof body.thread_id === "string" ? body.thread_id : null,
  });

  return NextResponse.json({ ok: true });
}

async function resolveCampaignFromCallback(body: Record<string, unknown>) {
  const campaignPayload = body.campaign;
  if (campaignPayload && typeof campaignPayload === "object") {
    const campaignId = (campaignPayload as Record<string, unknown>).id;
    if (typeof campaignId === "string") {
      const campaign = await getDomCampaignContextBySlug(campaignId);
      if (campaign) return campaign;
    }
  }

  if (typeof body.campaign_id === "string") {
    const bySlug = await getDomCampaignContextBySlug(body.campaign_id);
    if (bySlug) return bySlug;

    const byId = await getDomCampaignContextById(body.campaign_id);
    if (byId) return byId;
  }

  if (typeof body.thread_id === "string") {
    const sql = getPostgresClient();
    if (!sql) return null;
    const rows = await sql`
      select campaign_id::text as campaign_id
      from chat_threads
      where id = ${body.thread_id}
      limit 1
    `;
    const campaignId = rows[0]?.campaign_id;
    if (campaignId) {
      return getDomCampaignContextById(String(campaignId));
    }
  }

  return null;
}
