import { describe, expect, it } from "vitest";

import {
  buildOutboundEnvelope,
  buildRedraftSubject,
  buildRedraftedBody,
  splitOutboundReviewQueue,
} from "../review";
import type { AppCompany, AppContact, AppMessage, AppSender } from "../demo-data";

const baseMessage: AppMessage = {
  id: "message-1",
  campaignId: "pastoral-invierno-2026",
  companyId: "company-1",
  contactId: "contact-1",
  senderId: "sender-1",
  kind: "outbound_initial",
  status: "needs_review",
  subject: "Apoyo Pastoral UC",
  body: "Hola,\n\nQueremos pedir apoyo para Pastoral UC.\n\nEquipo Pastoral UC",
  createdAt: "2026-05-01T00:00:00.000Z",
  sentAt: null,
};

const baseCompany: AppCompany = {
  id: "company-1",
  campaignIds: ["pastoral-invierno-2026"],
  name: "NotCo",
  domain: "notco.com",
  website: "https://notco.com",
  industry: "Alimentos",
  region: "RM",
  fitScore: 76,
  status: "draft_ready",
  notes: "",
  doNotContact: false,
  evidenceUrls: [],
};

const baseContact: AppContact = {
  id: "contact-1",
  companyId: "company-1",
  name: "Francisca Morales",
  role: "Brand Partnerships Manager",
  email: "francisca@notco.com",
  phone: null,
  category: "Marketing",
  confidence: 0.8,
  source: "base",
  isDecisionMaker: false,
  doNotContact: false,
  notes: "",
};

const baseSender: AppSender = {
  id: "sender-1",
  campaignId: "pastoral-invierno-2026",
  email: "sawitting@miuandes.cl",
  displayName: "Sebastian Witting",
  organization: "Pastoral UC / Trabajo País",
  accountType: "gmail",
  status: "active",
  isDefault: true,
  priority: 1,
  dailyLimit: 15,
  campaignDailyLimit: 15,
  sentToday: 0,
  signature: "Sebastian Witting",
};

describe("outbound review queue", () => {
  it("keeps approved messages out of the pending review queue", () => {
    const queues = splitOutboundReviewQueue([
      baseMessage,
      { ...baseMessage, id: "message-2", status: "approved" },
      { ...baseMessage, id: "message-3", status: "rejected" },
      { ...baseMessage, id: "message-4", status: "sent" },
    ]);

    expect(queues.pending.map((message) => message.id)).toEqual(["message-1"]);
    expect(queues.approved.map((message) => message.id)).toEqual(["message-2"]);
  });

  it("separates redrafts from the first-pass pending queue", () => {
    const queues = splitOutboundReviewQueue([
      baseMessage,
      {
        ...baseMessage,
        id: "message-redraft",
        futureNote: "Nuevo borrador generado desde rechazo del mensaje old-id.",
      },
    ]);

    expect(queues.pending.map((message) => message.id)).toEqual(["message-1"]);
    expect(queues.redrafts.map((message) => message.id)).toEqual([
      "message-redraft",
    ]);
  });

  it("labels regenerated draft subjects without duplicating the prefix", () => {
    expect(buildRedraftSubject("[TEST rechazar] Pastoral UC")).toBe(
      "Nuevo borrador: [TEST rechazar] Pastoral UC",
    );
    expect(buildRedraftSubject("Nuevo borrador: [TEST rechazar]")).toBe(
      "Nuevo borrador: [TEST rechazar]",
    );
  });

  it("builds a new draft from rejection feedback without losing context", () => {
    const redrafted = buildRedraftedBody({
      originalBody: baseMessage.body,
      reason: "bad_copy",
      feedback:
        "Hazlo más concreto, menos genérico y menciona que buscamos una reunión corta.",
      rememberedFeedback: ["Evitar tono demasiado formal en Pastoral."],
    });

    expect(redrafted).toContain("Hola");
    expect(redrafted).toContain("reunión corta");
    expect(redrafted).toContain("Feedback aplicado");
    expect(redrafted).toContain("Evitar tono demasiado formal");
  });

  it("builds a clear outbound envelope for review cards", () => {
    expect(
      buildOutboundEnvelope({
        company: baseCompany,
        contact: baseContact,
        sender: baseSender,
      }),
    ).toEqual({
      companyLabel: "NotCo",
      contactLabel: "Francisca Morales",
      recipientLabel:
        "Francisca Morales <francisca@notco.com>",
      senderLabel:
        "Sebastian Witting <sawitting@miuandes.cl>",
      senderOrganization: "Pastoral UC / Trabajo País",
    });
  });
});
