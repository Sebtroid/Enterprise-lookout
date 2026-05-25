import { pastoralMailTemplates } from "@/lib/pastoral/templates";

export type PastoralFollowupCandidate = {
  contactDoNotContact: boolean;
  gmailConnected: boolean;
  hasBounce: boolean;
  hasReply: boolean;
  kind: "outbound_followup" | "outbound_initial" | "outbound_reply";
  sentAt: string | null;
  senderDailyLimit: number;
  senderSentToday: number;
  sheetRegistered: boolean;
  status: "approved" | "failed" | "needs_review" | "rejected" | "sent";
};

export type PastoralFollowupEligibilityReason =
  | "already_replied"
  | "bounced"
  | "contact_blocked"
  | "daily_limit_reached"
  | "gmail_not_connected"
  | "invalid_sent_at"
  | "missing_sheet_registration"
  | "not_due"
  | "not_initial_sent"
  | "outside_window"
  | "ready";

export function evaluatePastoralFollowupEligibility(
  candidate: PastoralFollowupCandidate,
  now = new Date(),
): {
  daysSinceSent: number;
  eligible: boolean;
  reason: PastoralFollowupEligibilityReason;
} {
  if (candidate.kind !== "outbound_initial" || candidate.status !== "sent") {
    return { daysSinceSent: 0, eligible: false, reason: "not_initial_sent" };
  }
  if (!candidate.sentAt) {
    return { daysSinceSent: 0, eligible: false, reason: "invalid_sent_at" };
  }

  const sentAt = new Date(candidate.sentAt);
  if (Number.isNaN(sentAt.getTime())) {
    return { daysSinceSent: 0, eligible: false, reason: "invalid_sent_at" };
  }

  const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / 86_400_000);
  if (daysSinceSent < 5) {
    return { daysSinceSent, eligible: false, reason: "not_due" };
  }
  if (candidate.hasReply) {
    return { daysSinceSent, eligible: false, reason: "already_replied" };
  }
  if (candidate.hasBounce) {
    return { daysSinceSent, eligible: false, reason: "bounced" };
  }
  if (candidate.contactDoNotContact) {
    return { daysSinceSent, eligible: false, reason: "contact_blocked" };
  }
  if (!candidate.sheetRegistered) {
    return { daysSinceSent, eligible: false, reason: "missing_sheet_registration" };
  }
  if (!candidate.gmailConnected) {
    return { daysSinceSent, eligible: false, reason: "gmail_not_connected" };
  }
  if (candidate.senderSentToday >= candidate.senderDailyLimit) {
    return { daysSinceSent, eligible: false, reason: "daily_limit_reached" };
  }
  if (!isPastoralFollowupWindow(now)) {
    return { daysSinceSent, eligible: false, reason: "outside_window" };
  }

  return { daysSinceSent, eligible: true, reason: "ready" };
}

export function isPastoralFollowupWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
    weekday: "short",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return ["Mon", "Tue", "Wed"].includes(weekday ?? "") && hour >= 9 && hour < 12;
}

export function buildPastoralFollowupDraft({
  companyName,
  contactName,
}: {
  companyName: string;
  contactName?: string | null;
}) {
  const template =
    pastoralMailTemplates.find((item) => item.id === "empresa-seguimiento-2")
      ?.body ?? "";
  return template
    .replaceAll("[Nombre de la empresa]", companyName)
    .replaceAll("[Nombre o equipo]", contactName?.trim() || "equipo");
}
