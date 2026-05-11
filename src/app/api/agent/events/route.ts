import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { AGENT_EVENT_TYPES } from "@/lib/agent/events";
import { persistAgentEvent } from "@/lib/agent/server-events";
import { getAllowedUser } from "@/lib/auth/request";
import { getPostgresClient } from "@/lib/supabase/postgres";

type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

interface AgentEventPayload {
  event: AgentEventType;
  campaign_id?: string;
  company_id?: string;
  contact_id?: string;
  message_id?: string;
  data: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
  source?: string;
}

/**
 * POST /api/agent/events
 *
 * Inbox de eventos para el agente (Dom).
 * La app dispara eventos acá cuando pasa algo relevante.
 * No requiere auth (intra-app).
 * Dom revisa esta tabla periódicamente y procesa lo que encuentre.
 */
export async function POST(req: NextRequest) {
  const user = isAuthorizedAgentRequest(req)
    ? { email: "agent" }
    : await getAllowedUser({ allowDemoUser: true, request: req });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<AgentEventPayload>;

  // Validar mínimo
  if (!body.event || !AGENT_EVENT_TYPES.includes(body.event as AgentEventType)) {
    return NextResponse.json(
      { ok: false, error: `Invalid or missing event. Valid: ${AGENT_EVENT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await persistAgentEvent({
    event: body.event as AgentEventType,
    campaignId: body.campaign_id,
    companyId: body.company_id,
    contactId: body.contact_id,
    messageId: body.message_id,
    data: body.data,
    priority: body.priority,
    source: body.source,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

/**
 * GET /api/agent/events
 *
 * Para uso del agente (Dom). Devuelve eventos pendientes.
 * Requiere Authorization: Bearer <DOM_API_TOKEN>.
 * ?status=pending&limit=20
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const campaignId = searchParams.get("campaign_id");

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  const rows = await sql`
    select
      id,
      event_type,
      campaign_id,
      company_id,
      contact_id,
      message_id,
      payload,
      priority,
      source,
      status,
      created_at
    from agent_inbox
    where status = ${status}
      ${campaignId ? sql`and campaign_id = ${campaignId}` : sql``}
    order by
      case priority
        when 'urgent' then 1
        when 'high' then 2
        when 'normal' then 3
        when 'low' then 4
        else 5
      end,
      created_at asc
    limit ${limit}
  `;

  return NextResponse.json({ ok: true, count: rows.length, events: rows });
}

/**
 * PATCH /api/agent/events
 *
 * Marcar eventos como procesados (o actualizar status).
 * Requiere Authorization: Bearer <DOM_API_TOKEN>.
 * Body: { ids: ["uuid", ...], status: "completed" | "in_progress" | "failed" }
 */
export async function PATCH(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ids?: string[];
    status?: "pending" | "in_progress" | "completed" | "failed";
    result?: Record<string, unknown>;
  };

  if (!body.ids?.length || !body.status) {
    return NextResponse.json(
      { ok: false, error: "Missing ids or status" },
      { status: 400 },
    );
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  try {
    const result = body.result
      ? (body.result as Parameters<typeof sql.json>[0])
      : null;
    await sql`
      update agent_inbox
      set
        status = ${body.status},
        result = ${result ? sql.json(result) : null},
        processed_at = ${body.status === "completed" || body.status === "failed" ? new Date().toISOString() : null}
      where id = any(${body.ids}::uuid[])
    `;

    return NextResponse.json({ ok: true, updated: body.ids.length });
  } catch (err) {
    console.error("[agent/events] patch failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update events" },
      { status: 500 },
    );
  }
}
