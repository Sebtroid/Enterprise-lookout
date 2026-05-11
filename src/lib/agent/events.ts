/**
 * Helper para enviar eventos al inbox del agente (Dom).
 * Usado desde componentes cliente o servidor cuando pasa algo relevante.
 */

export const AGENT_EVENT_TYPES = [
  "lead_created",
  "lead_updated",
  "company_classified",
  "mail_created",
  "mail_rejected",
  "mail_approved",
  "mail_sent",
  "reply_received",
  "campaign_created",
  "campaign_updated",
  "contact_added",
  "research_needed",
  "draft_needed",
  "dom_task_created",
  "followup_needed",
  "user_chat_message",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface AgentEventInput {
  event: AgentEventType;
  campaignId?: string;
  companyId?: string;
  contactId?: string;
  messageId?: string;
  data?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
  source?: string;
}

export async function sendAgentEvent(input: AgentEventInput) {
  if (typeof window === "undefined") {
    const { persistAgentEvent } = await import("./server-events");
    return persistAgentEvent(input);
  }

  try {
    const response = await fetch(getAgentEventsUrl(), {
      method: "POST",
      headers: getAgentEventHeaders(),
      body: JSON.stringify({
        event: input.event,
        campaign_id: input.campaignId,
        company_id: input.companyId,
        contact_id: input.contactId,
        message_id: input.messageId,
        data: input.data ?? {},
        priority: input.priority ?? "normal",
        source: input.source ?? "app",
      }),
    });

    if (!response.ok) {
      console.error("[sendAgentEvent] failed:", response.status, await response.text());
      return { ok: false, error: `HTTP ${response.status}` };
    }

    return (await response.json()) as { ok: true; inbox_id: string; created_at: string };
  } catch (err) {
    console.error("[sendAgentEvent] error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

function getAgentEventsUrl() {
  if (typeof window !== "undefined") return "/api/agent/events";

  if (process.env.NODE_ENV === "development") {
    return `http://localhost:${process.env.PORT || "3001"}/api/agent/events`;
  }

  const baseUrl =
    process.env.AGENT_EVENTS_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) return "/api/agent/events";
  return new URL("/api/agent/events", baseUrl).toString();
}

function getAgentEventHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window === "undefined") {
    const token = process.env.AGENT_API_TOKEN || process.env.DOM_API_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
