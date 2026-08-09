import { describe, expect, it } from "vitest";
import { evaluateV2SendReadiness } from "@/lib/v2/gmail-policy";

const ready = { accountActive: true, accountConnected: true, alreadyContacted: false, approved: true, bounced: false, canSend: true, dailyLimit: 30, hasReply: false, identityConflict: false, sentToday: 12, suppressed: false };

describe("V2 Gmail send guard", () => {
  it("allows only an approved, permitted and unique send", () => {
    expect(evaluateV2SendReadiness(ready)).toEqual({ ok: true });
  });
  it.each([
    ["approved", false, "not_approved"], ["canSend", false, "missing_permission"], ["alreadyContacted", true, "duplicate"], ["suppressed", true, "suppressed"], ["bounced", true, "bounced"], ["hasReply", true, "reply_received"], ["identityConflict", true, "identity_conflict"], ["sentToday", 30, "daily_limit"], ["accountConnected", false, "account_disconnected"],
  ] as const)("blocks %s", (field, value, reason) => {
    expect(evaluateV2SendReadiness({ ...ready, [field]: value })).toEqual({ ok: false, reason });
  });
});
