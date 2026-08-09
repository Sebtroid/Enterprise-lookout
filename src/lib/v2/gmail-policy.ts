export type V2SendReadinessInput = {
  accountActive: boolean;
  accountConnected: boolean;
  alreadyContacted: boolean;
  approved: boolean;
  bounced: boolean;
  canSend: boolean;
  dailyLimit: number;
  hasReply: boolean;
  identityConflict: boolean;
  sentToday: number;
  suppressed: boolean;
};

export function evaluateV2SendReadiness(input: V2SendReadinessInput): { ok: true } | { ok: false; reason: string } {
  if (!input.approved) return { ok: false, reason: "not_approved" };
  if (!input.canSend) return { ok: false, reason: "missing_permission" };
  if (!input.accountActive || !input.accountConnected) return { ok: false, reason: "account_disconnected" };
  if (input.identityConflict) return { ok: false, reason: "identity_conflict" };
  if (input.suppressed) return { ok: false, reason: "suppressed" };
  if (input.bounced) return { ok: false, reason: "bounced" };
  if (input.hasReply) return { ok: false, reason: "reply_received" };
  if (input.alreadyContacted) return { ok: false, reason: "duplicate" };
  if (input.sentToday >= Math.min(input.dailyLimit, 30)) return { ok: false, reason: "daily_limit" };
  return { ok: true };
}
