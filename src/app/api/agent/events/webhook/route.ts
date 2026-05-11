import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { AGENT_EVENT_TYPES, type AgentEventType } from "@/lib/agent/events";
import { persistAgentEvent } from "@/lib/agent/server-events";

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const event = normalizeEventType(body.event ?? body.event_type);
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing event" },
      { status: 400 },
    );
  }

  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : {};

  const result = await persistAgentEvent({
    event,
    campaignId: stringOrUndefined(body.campaign_id ?? payload.campaign_id),
    companyId: stringOrUndefined(body.company_id ?? payload.company_id),
    contactId: stringOrUndefined(body.contact_id ?? payload.contact_id),
    messageId: stringOrUndefined(body.message_id ?? payload.message_id),
    data: {
      ...payload,
      webhook_event_id: stringOrUndefined(body.event_id),
    },
    priority: normalizePriority(body.priority),
    source: "agent_events_webhook_compat",
  });

  return NextResponse.json(result, { status: result.ok ? 202 : 500 });
}

function normalizeEventType(value: unknown): AgentEventType | null {
  if (typeof value !== "string") return null;
  return AGENT_EVENT_TYPES.includes(value as AgentEventType)
    ? (value as AgentEventType)
    : null;
}

function normalizePriority(value: unknown) {
  if (
    value === "low" ||
    value === "normal" ||
    value === "high" ||
    value === "urgent"
  ) {
    return value;
  }

  return "normal";
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
