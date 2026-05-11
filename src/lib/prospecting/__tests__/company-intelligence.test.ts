import { describe, expect, it } from "vitest";

import type {
  AppCompany,
  AppContact,
  AppMessage,
  AppReply,
} from "../demo-data";
import {
  buildCompanyExplorerRecords,
  filterCompanyExplorerRecords,
  getCampaignCompanyDecisionPatch,
  getFrequencyWarning,
} from "../company-intelligence";

const pastoralCompany: AppCompany = {
  id: "company-social",
  campaignIds: ["pastoral-invierno-2026"],
  name: "Empresa Social",
  domain: "social.cl",
  website: "https://social.cl",
  industry: "Servicios",
  region: "RM",
  fitScore: 82,
  status: "qualified",
  notes: "Buen calce para proyectos sociales.",
  doNotContact: false,
  evidenceUrls: [],
};

const uandesOnlyCompany: AppCompany = {
  id: "company-brand",
  campaignIds: ["caa-eventos-2026"],
  name: "Marca Eventos",
  domain: "marca.cl",
  website: "https://marca.cl",
  industry: "Consumo masivo",
  region: "RM",
  fitScore: 76,
  status: "draft_ready",
  notes: "Buen fit para activaciones universitarias.",
  doNotContact: false,
  evidenceUrls: [],
};

const contacts: AppContact[] = [
  {
    id: "contact-brand",
    companyId: "company-brand",
    name: "Francisca Morales",
    role: "Brand Partnerships Manager",
    email: "francisca@marca.cl",
    phone: null,
    category: "Marketing",
    confidence: 0.8,
    source: "Excel histórico",
    isDecisionMaker: false,
    doNotContact: false,
    notes: "Contacto útil para activaciones.",
  },
];

const message: AppMessage = {
  id: "message-brand",
  campaignId: "caa-eventos-2026",
  companyId: "company-brand",
  contactId: "contact-brand",
  senderId: "sender-uandes",
  kind: "outbound_initial",
  status: "sent",
  subject: "Auspicio para semana universitaria",
  body: "Hola, queríamos revisar una posible activación de marca.",
  createdAt: "2026-04-25T12:00:00.000Z",
  sentAt: "2026-04-25T13:00:00.000Z",
};

const reply: AppReply = {
  id: "reply-brand",
  messageId: "message-brand",
  companyId: "company-brand",
  contactId: "contact-brand",
  senderId: "sender-uandes",
  classification: "needs_info",
  receivedAt: "2026-04-26T14:00:00.000Z",
  body: "Gracias. Manden monto objetivo y presentación.",
  draftResponse: "Gracias, te lo mando.",
  approvalStatus: "needs_review",
  futureNote: "Pidieron monto objetivo.",
};

describe("company intelligence", () => {
  it("shows global companies that have not been evaluated in the current campaign", () => {
    const records = buildCompanyExplorerRecords({
      scope: "pastoral-invierno-2026",
      allCompanies: [pastoralCompany, uandesOnlyCompany],
      campaignCompanies: [pastoralCompany],
      contacts,
      messages: [message],
      replies: [reply],
      now: "2026-05-02T00:00:00.000Z",
    });

    expect(records.map((record) => record.company.id)).toEqual([
      "company-social",
      "company-brand",
    ]);
    expect(records.find((record) => record.company.id === "company-brand"))
      .toMatchObject({
        membership: "not_evaluated",
        campaignStatus: "not_evaluated",
      });
  });

  it("searches by company, contact role, previous mail, and reply body", () => {
    const records = buildCompanyExplorerRecords({
      scope: "pastoral-invierno-2026",
      allCompanies: [pastoralCompany, uandesOnlyCompany],
      campaignCompanies: [pastoralCompany],
      contacts,
      messages: [message],
      replies: [reply],
      now: "2026-05-02T00:00:00.000Z",
    });

    expect(
      filterCompanyExplorerRecords(records, {
        query: "brand partnerships",
        membership: "all",
        status: "all",
      }).map((record) => record.company.id),
    ).toEqual(["company-brand"]);

    expect(
      filterCompanyExplorerRecords(records, {
        query: "monto objetivo",
        membership: "all",
        status: "all",
      }).map((record) => record.company.id),
    ).toEqual(["company-brand"]);
  });

  it("warns when a company was contacted too recently", () => {
    expect(
      getFrequencyWarning({
        lastInteractionAt: "2026-04-25T13:00:00.000Z",
        now: "2026-05-02T00:00:00.000Z",
        cooldownDays: 21,
      }),
    ).toMatchObject({
      blocked: true,
      daysSince: 6,
      nextAllowedAt: "2026-05-16",
    });
  });

  it("maps review decisions to per-campaign company states", () => {
    expect(getCampaignCompanyDecisionPatch("fit")).toMatchObject({
      status: "ready_to_draft",
      fitScore: 75,
      priorityScore: 70,
    });
    expect(getCampaignCompanyDecisionPatch("maybe")).toMatchObject({
      status: "needs_research",
      fitScore: 45,
    });
    expect(getCampaignCompanyDecisionPatch("not_fit")).toMatchObject({
      status: "closed_negative",
      fitScore: 0,
    });
  });
});
