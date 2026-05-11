import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedDomRequest, persistDomCallbackResponse } from "@/lib/dom/client";
import {
  getDomCampaignContextById,
  getDomCampaignContextBySlug,
} from "@/lib/dom/repository";
import { getPostgresClient } from "@/lib/supabase/postgres";

export async function POST(req: NextRequest) {
  if (!isAuthorizedDomRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const campaign = await resolveCampaign(body);

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
    event: String(body.event ?? "dom_webhook_callback"),
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

async function resolveCampaign(body: Record<string, unknown>) {
  const payload = body.campaign;
  if (payload && typeof payload === "object") {
    const id = (payload as Record<string, unknown>).id;
    if (typeof id === "string") {
      const campaign = await getDomCampaignContextBySlug(id);
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
