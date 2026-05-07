import { describe, expect, it } from "vitest";

import {
  canSendMessage,
  chooseSenderForMessage,
  shouldAutoSendAfterApproval,
} from "../sending";

describe("prospecting sending rules", () => {
  it("chooses the default campaign sender when under the daily cap", () => {
    const sender = chooseSenderForMessage({
      senders: [
        {
          id: "sender-1",
          email: "hermano@estudiante.uc.cl",
          displayName: "Equipo Pastoral UC",
          isDefault: true,
          priority: 1,
          dailyLimit: 15,
          sentToday: 14,
          status: "active",
        },
        {
          id: "sender-2",
          email: "yo@miuandes.cl",
          displayName: "Centro de Alumnos",
          isDefault: false,
          priority: 2,
          dailyLimit: 15,
          sentToday: 0,
          status: "active",
        },
      ],
    });

    expect(sender?.id).toBe("sender-1");
  });

  it("falls back to the next active sender when the default is capped", () => {
    const sender = chooseSenderForMessage({
      senders: [
        {
          id: "sender-1",
          email: "hermano@estudiante.uc.cl",
          displayName: "Equipo Pastoral UC",
          isDefault: true,
          priority: 1,
          dailyLimit: 15,
          sentToday: 15,
          status: "active",
        },
        {
          id: "sender-2",
          email: "yo@miuandes.cl",
          displayName: "Centro de Alumnos",
          isDefault: false,
          priority: 2,
          dailyLimit: 15,
          sentToday: 1,
          status: "active",
        },
      ],
    });

    expect(sender?.id).toBe("sender-2");
  });

  it("blocks sends when contact, company, or approval state is unsafe", () => {
    expect(
      canSendMessage({
        messageStatus: "approved",
        contactDoNotContact: true,
        companyDoNotContact: false,
        hasSenderAccount: true,
      }),
    ).toEqual({ ok: false, reason: "contact_do_not_contact" });

    expect(
      canSendMessage({
        messageStatus: "needs_review",
        contactDoNotContact: false,
        companyDoNotContact: false,
        hasSenderAccount: true,
      }),
    ).toEqual({ ok: false, reason: "message_not_approved" });

    expect(
      canSendMessage({
        messageStatus: "approved",
        contactDoNotContact: false,
        companyDoNotContact: false,
        hasSenderAccount: true,
      }),
    ).toEqual({ ok: true });
  });

  it("auto-sends approved messages only for connected active Gmail senders", () => {
    expect(
      shouldAutoSendAfterApproval({
        connectedGmailEmails: ["SAWITTING@miuandes.cl"],
        senderAccountType: "gmail",
        senderEmail: "sawitting@miuandes.cl",
        senderStatus: "active",
      }),
    ).toBe(true);

    expect(
      shouldAutoSendAfterApproval({
        connectedGmailEmails: ["sawitting@miuandes.cl"],
        senderAccountType: "outlook",
        senderEmail: "sawitting@miuandes.cl",
        senderStatus: "active",
      }),
    ).toBe(false);

    expect(
      shouldAutoSendAfterApproval({
        connectedGmailEmails: [],
        senderAccountType: "gmail",
        senderEmail: "sawitting@miuandes.cl",
        senderStatus: "active",
      }),
    ).toBe(false);
  });
});
