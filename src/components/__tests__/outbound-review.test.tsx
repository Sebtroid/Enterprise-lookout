import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { OutboundReview } from "@/components/outbound-review";
import type {
  AppCampaign,
  AppCompany,
  AppContact,
  AppMessage,
  AppSender,
} from "@/lib/prospecting/demo-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/prospecting/actions", () => ({
  markMessageSentManuallyAction: async () => ({ ok: true, message: "" }),
  rejectOutboundMessageAction: async () => ({ ok: true, message: "" }),
  updateOutboundMessageAction: async () => ({ ok: true, message: "" }),
}));

const campaign: AppCampaign = {
  id: "dia-del-ingeniero",
  name: "Día del Ingeniero",
  organization: "CDI Uandes",
  description: "Asado con actividades y premios.",
  status: "active",
  valueProposition: "Premios para estudiantes.",
  startsOn: "2026-05-14",
};

const company: AppCompany = {
  id: "company-1",
  campaignIds: [campaign.id],
  name: "CanchaPro Padel & Futbol",
  domain: "canchapro.test",
  website: "https://canchapro.test",
  industry: "Deportes",
  region: "RM",
  fitScore: 70,
  status: "draft_ready",
  notes: "",
  doNotContact: false,
  evidenceUrls: [],
};

const contact: AppContact = {
  id: "contact-1",
  companyId: company.id,
  name: "Sebastian Witting",
  role: "Destinatario interno de pruebas",
  email: "sawitting@miuandes.cl",
  phone: null,
  category: "Prueba",
  confidence: 1,
  source: "test",
  isDecisionMaker: true,
  doNotContact: false,
  notes: "",
};

const sender: AppSender = {
  id: "sender-1",
  campaignId: campaign.id,
  email: "sawitting@miuandes.cl",
  displayName: "Sebastian Witting",
  organization: "CDI Uandes",
  accountType: "gmail",
  status: "active",
  isDefault: true,
  priority: 1,
  dailyLimit: 15,
  campaignDailyLimit: 15,
  sentToday: 0,
  signature: "Sebastian Witting",
};

const message: AppMessage = {
  id: "message-1",
  campaignId: campaign.id,
  companyId: company.id,
  contactId: contact.id,
  senderId: sender.id,
  kind: "outbound_initial",
  status: "needs_review",
  subject: "[TEST FALSA] CanchaPro Padel & Futbol para Día del Ingeniero",
  body: "Hola Sebastian,\n\nEste es un mail de prueba.",
  createdAt: "2026-05-07T00:00:00.000Z",
  sentAt: null,
};

describe("OutboundReview", () => {
  it("keeps outbound mail bodies collapsed until the user expands them", () => {
    render(
      <OutboundReview
        campaigns={[campaign]}
        companies={[company]}
        contacts={[contact]}
        messages={[message]}
        scope={campaign.id}
        senders={[sender]}
        gmailConnectedEmails={[sender.email]}
      />,
    );

    expect(screen.queryByDisplayValue(message.body)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver mail" }));

    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ocultar mail" }),
    ).toBeInTheDocument();
  });

  it("keeps rejection fields mounted while submitting so feedback is included", () => {
    render(
      <OutboundReview
        campaigns={[campaign]}
        companies={[company]}
        contacts={[contact]}
        messages={[message]}
        scope={campaign.id}
        senders={[sender]}
        gmailConnectedEmails={[sender.email]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

    const feedback = screen.getByLabelText("Feedback para la nueva redacción");
    fireEvent.change(feedback, {
      target: { value: "Hazlo más corto y menos genérico." },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Rechazar y redactar de nuevo",
      }),
    );

    expect(
      screen.getByLabelText("Feedback para la nueva redacción"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Razón de rechazo" })).toHaveValue(
      "bad_copy",
    );
  });
});
