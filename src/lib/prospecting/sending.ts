import {
  CampaignSender,
  SendGuardInput,
  SendGuardResult,
} from "./types";

export function chooseSenderForMessage({
  senders,
}: {
  senders: CampaignSender[];
}) {
  const eligible = senders.filter(
    (sender) =>
      sender.status === "active" && sender.sentToday < sender.dailyLimit,
  );

  return eligible.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sentToday - b.sentToday;
  })[0];
}

export function canSendMessage(input: SendGuardInput): SendGuardResult {
  if (input.contactDoNotContact) {
    return { ok: false, reason: "contact_do_not_contact" };
  }

  if (input.companyDoNotContact) {
    return { ok: false, reason: "company_do_not_contact" };
  }

  if (!input.hasSenderAccount) {
    return { ok: false, reason: "missing_sender_account" };
  }

  if (input.messageStatus !== "approved") {
    return { ok: false, reason: "message_not_approved" };
  }

  return { ok: true };
}
