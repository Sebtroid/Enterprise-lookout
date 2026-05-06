/**
 * Helper para enviar eventos al inbox del agente (Dom).
 * Usado desde componentes cliente o servidor cuando pasa algo relevante.
 */

export type AgentEventType =
  | "lead_created"
  | "lead_updated"
  | "mail_rejected"
  | "mail_approved"
  | "mail_sent"
  | "campaign_created"
  | "campaign_updated"
  | "contact_added"
  | "research_needed"
  | "draft_needed"
  | "followup_needed"
  | "user_chat_message";

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
  try {
    const response = await fetch("/api/agent/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
