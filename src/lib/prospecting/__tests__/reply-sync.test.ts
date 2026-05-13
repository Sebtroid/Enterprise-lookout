import { describe, expect, it } from "vitest";

import {
  buildGmailReplySearchQuery,
  buildInboundReplyDraft,
  classifyInboundReply,
  isBounceReply,
  matchInboundReply,
  matchInboundReplyToKnownContact,
  normalizeEmailSubject,
  prepareInboundReplyRecord,
  resolveReplySyncScope,
  shouldSyncOutboundForReplies,
  shouldIngestReply,
  type GmailReplyCandidate,
  type ReplyContactMatchInput,
  type SentMessageMatchInput,
} from "../reply-sync";

const sentMessage: SentMessageMatchInput = {
  id: "message-1",
  campaignId: "pastoral-invierno-2026",
  companyId: "company-1",
  contactId: "contact-1",
  contactEmail: "alianzas@empresa.cl",
  contactName: "Francisca Morales",
  senderId: "sender-1",
  senderEmail: "sawitting@miuandes.cl",
  subject: "Trabajo Pais: posible apoyo de Empresa",
  sentAt: "2026-05-01T12:00:00.000Z",
  gmailThreadId: "thread-1",
};

const candidate: GmailReplyCandidate = {
  gmailMessageId: "gmail-reply-1",
  gmailThreadId: "thread-1",
  fromEmail: "alianzas@empresa.cl",
  toEmail: "sawitting@miuandes.cl",
  subject: "Re: Trabajo País: posible apoyo de Empresa",
  body: "Hola, gracias por escribir. Mándame la presentación y el monto objetivo.",
  receivedAt: "2026-05-02T15:00:00.000Z",
};

const bounceCandidate: GmailReplyCandidate = {
  gmailMessageId: "gmail-bounce-1",
  gmailThreadId: null,
  fromEmail: "mailer-daemon@googlemail.com",
  toEmail: "sawitting@miuandes.cl",
  subject: "Delivery Status Notification (Failure)",
  body: "Address not found alianzas@empresa.cl 550 5.1.1",
  receivedAt: "2026-05-02T15:05:00.000Z",
};

const contactMatch: ReplyContactMatchInput = {
  campaignId: "pastoral-invierno-2026",
  companyId: "company-1",
  contactId: "contact-1",
  contactEmail: "alianzas@empresa.cl",
  contactName: "Francisca Morales",
  senderId: "sender-1",
  senderEmail: "sawitting@miuandes.cl",
};

describe("reply sync", () => {
  it("normalizes reply subjects for Gmail matching", () => {
    expect(normalizeEmailSubject("RE: Fwd: Trabajo País - Apoyo")).toBe(
      "trabajo pais apoyo",
    );
  });

  it("matches by Gmail thread id before weaker fallbacks", () => {
    const match = matchInboundReply(candidate, [
      sentMessage,
      {
        ...sentMessage,
        id: "message-2",
        contactEmail: "otra@empresa.cl",
        gmailThreadId: "other-thread",
      },
    ]);

    expect(match).toMatchObject({
      message: { id: "message-1" },
      reason: "gmail_thread_id",
      confidence: 1,
    });
  });

  it("falls back to contact email and normalized subject", () => {
    const match = matchInboundReply(
      { ...candidate, gmailThreadId: null },
      [{ ...sentMessage, gmailThreadId: null }],
    );

    expect(match).toMatchObject({
      message: { id: "message-1" },
      reason: "contact_email_subject",
      confidence: 0.9,
    });
  });

  it("classifies replies and builds an approval draft", () => {
    expect(classifyInboundReply(candidate.body)).toBe("needs_info");
    expect(buildInboundReplyDraft(candidate)).toContain("presentación");
  });

  it("detects bounces and matches them to the bounced recipient", () => {
    expect(isBounceReply(bounceCandidate)).toBe(true);
    expect(classifyInboundReply(bounceCandidate.body)).toBe("bounced");

    const match = matchInboundReply(bounceCandidate, [sentMessage]);
    expect(match).toMatchObject({
      message: { id: "message-1" },
      reason: "bounce_recipient",
      confidence: 0.95,
    });

    expect(prepareInboundReplyRecord(bounceCandidate, sentMessage)).toMatchObject({
      classification: "bounced",
      draftResponse: expect.stringContaining("No responder"),
    });
  });

  it("prepares inbound reply records with explicit sender/campaign/contact ids", () => {
    expect(prepareInboundReplyRecord(candidate, sentMessage)).toMatchObject({
      campaignId: "pastoral-invierno-2026",
      companyId: "company-1",
      contactId: "contact-1",
      senderId: "sender-1",
      gmailMessageId: "gmail-reply-1",
      gmailThreadId: "thread-1",
      subject: "Re: Trabajo País: posible apoyo de Empresa",
      status: "needs_review",
      kind: "inbound_reply",
      classification: "needs_info",
    });
  });

  it("skips self-sent messages and already ingested Gmail ids", () => {
    expect(
      shouldIngestReply(candidate, {
        senderEmail: "sawitting@miuandes.cl",
        existingGmailMessageIds: new Set(["gmail-reply-1"]),
      }),
    ).toBe(false);

    expect(
      shouldIngestReply(
        { ...candidate, gmailMessageId: "gmail-reply-2", fromEmail: "sawitting@miuandes.cl" },
        {
          senderEmail: "sawitting@miuandes.cl",
          existingGmailMessageIds: new Set(),
        },
      ),
    ).toBe(false);
  });

  it("builds Gmail search queries scoped to replies to the sender", () => {
    expect(buildGmailReplySearchQuery(sentMessage)).toContain(
      "to:sawitting@miuandes.cl",
    );
    expect(buildGmailReplySearchQuery(sentMessage)).toContain(
      "-from:sawitting@miuandes.cl",
    );
    expect(buildGmailReplySearchQuery(sentMessage)).toContain(
      "after:2026/05/01",
    );
    expect(buildGmailReplySearchQuery(sentMessage)).not.toContain(
      "rfc822msgid:",
    );
  });

  it("resolves context scopes to the organizations that share that context", () => {
    expect(
      resolveReplySyncScope("context--pastoral-uc", [
        { organization: "Pastoral UC", slug: "pastoral-invierno-2026" },
        { organization: "Pastoral UC", slug: "pastoral-verano-2026" },
        { organization: "Techo", slug: "techo-2026" },
      ]),
    ).toEqual({
      kind: "organizations",
      organizations: ["Pastoral UC"],
    });
  });

  it("syncs replies for approved/manual compose messages from the connected Gmail account", () => {
    expect(
      shouldSyncOutboundForReplies({
        connectedEmail: "sawitting@miuandes.cl",
        contactEmail: "alianzas@empresa.cl",
        senderEmail: "sawitting@miuandes.cl",
        status: "approved",
      }),
    ).toBe(true);
  });

  it("does not sync drafts or messages from a different sender mailbox", () => {
    expect(
      shouldSyncOutboundForReplies({
        connectedEmail: "sawitting@miuandes.cl",
        contactEmail: "alianzas@empresa.cl",
        senderEmail: "otra@miuandes.cl",
        status: "sent",
      }),
    ).toBe(false);

    expect(
      shouldSyncOutboundForReplies({
        connectedEmail: "sawitting@miuandes.cl",
        contactEmail: "alianzas@empresa.cl",
        senderEmail: "sawitting@miuandes.cl",
        status: "needs_review",
      }),
    ).toBe(false);
  });

  it("matches an inbound Gmail reply directly to a known project contact", () => {
    const match = matchInboundReplyToKnownContact(candidate, [
      contactMatch,
      { ...contactMatch, contactId: "contact-2", contactEmail: "otra@empresa.cl" },
    ]);

    expect(match).toMatchObject({
      message: {
        id: "gmail-contact:gmail-reply-1",
        campaignId: "pastoral-invierno-2026",
        companyId: "company-1",
        contactId: "contact-1",
      },
      reason: "known_contact_email",
      confidence: 0.82,
    });
  });

  it("matches replies from a different address at the same company domain", () => {
    const match = matchInboundReply(
      {
        ...candidate,
        gmailThreadId: null,
        fromEmail: "ventas@empresa.cl",
        subject: "Propuesta de colaboración para el evento",
      },
      [
        {
          ...sentMessage,
          contactEmail: "alianzas@empresa.cl",
          gmailThreadId: null,
          subject: "Trabajo Pais: posible apoyo de Empresa",
          sentAt: "2026-05-01T12:00:00.000Z",
        },
      ],
    );

    expect(match).toMatchObject({
      message: { id: "message-1" },
      reason: "contact_domain_recent",
    });
  });

  it("matches known campaign contacts by company domain when the responder is new", () => {
    const match = matchInboundReplyToKnownContact(
      {
        ...candidate,
        fromEmail: "ventas@empresa.cl",
        subject: "Propuesta de colaboración para el evento",
      },
      [contactMatch],
    );

    expect(match).toMatchObject({
      message: {
        id: "gmail-contact:gmail-reply-1",
        companyId: "company-1",
        contactEmail: "alianzas@empresa.cl",
      },
      reason: "known_contact_domain",
    });
  });
});
