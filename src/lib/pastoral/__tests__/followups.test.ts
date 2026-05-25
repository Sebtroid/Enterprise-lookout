import { describe, expect, it } from "vitest";

import {
  buildPastoralFollowupDraft,
  evaluatePastoralFollowupEligibility,
  isPastoralFollowupWindow,
} from "@/lib/pastoral/followups";

describe("pastoral follow-up automation", () => {
  it("only opens the automatic send window Monday to Wednesday from 9 to 12 in Chile", () => {
    expect(isPastoralFollowupWindow(new Date("2026-05-25T13:30:00.000Z"))).toBe(true);
    expect(isPastoralFollowupWindow(new Date("2026-05-25T17:30:00.000Z"))).toBe(false);
    expect(isPastoralFollowupWindow(new Date("2026-05-28T13:30:00.000Z"))).toBe(false);
  });

  it("requires a sent initial mail, no reply, no bounce, Sheets registration, Gmail and daily capacity", () => {
    const base = {
      contactDoNotContact: false,
      gmailConnected: true,
      hasBounce: false,
      hasReply: false,
      kind: "outbound_initial" as const,
      sentAt: "2026-05-18T13:00:00.000Z",
      senderDailyLimit: 15,
      senderSentToday: 3,
      sheetRegistered: true,
      status: "sent" as const,
    };
    const now = new Date("2026-05-25T13:30:00.000Z");

    expect(evaluatePastoralFollowupEligibility(base, now)).toMatchObject({
      eligible: true,
      reason: "ready",
    });
    expect(
      evaluatePastoralFollowupEligibility({ ...base, hasReply: true }, now),
    ).toMatchObject({ eligible: false, reason: "already_replied" });
    expect(
      evaluatePastoralFollowupEligibility({ ...base, sheetRegistered: false }, now),
    ).toMatchObject({ eligible: false, reason: "missing_sheet_registration" });
  });

  it("builds an operational follow-up draft from the Pastoral template", () => {
    expect(
      buildPastoralFollowupDraft({
        companyName: "Empresa Zona",
        contactName: "Francisca",
      }),
    ).toContain("Empresa Zona");
  });
});
