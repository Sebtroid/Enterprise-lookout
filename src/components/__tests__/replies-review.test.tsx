import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { RepliesReview } from "@/components/replies-review";
import type {
  AppCompany,
  AppContact,
  AppReply,
  AppSender,
} from "@/lib/prospecting/demo-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/prospecting/actions", () => ({
  updateReplyDraftAction: async () => ({ ok: true, message: "" }),
}));

const company: AppCompany = {
  id: "company-1",
  campaignIds: ["dia-del-ingeniero"],
  name: "Escapology",
  domain: "escapology.com",
  website: "https://escapology.com",
  industry: "Entretención",
  region: "RM",
  fitScore: 82,
  status: "replied",
  notes: "",
  doNotContact: false,
  evidenceUrls: [],
};

const contact: AppContact = {
  id: "contact-1",
  companyId: company.id,
  name: "Humberto de Escapology",
  role: "Contacto verificado por reply",
  email: "ventas@escapology.com",
  phone: null,
  category: "Reply verificado",
  confidence: 0.95,
  verificationStatus: "verified",
  verifiedAt: "2026-05-13T20:00:00.000Z",
  bounceCount: 0,
  source: "gmail_reply",
  isDecisionMaker: true,
  doNotContact: false,
  notes: "",
};

const sender: AppSender = {
  id: "sender-1",
  campaignId: "dia-del-ingeniero",
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

const reply: AppReply = {
  id: "reply-1",
  messageId: "reply-1",
  companyId: company.id,
  contactId: contact.id,
  senderId: sender.id,
  classification: "needs_info",
  receivedAt: "2026-05-13T20:00:00.000Z",
  body: "Perfecto Sebastian, nos interesa participar.",
  draftResponse: "Hola,\n\nMuchas gracias por responder.",
  approvalStatus: "needs_review",
  futureNote: "Reply detectado automáticamente desde Gmail.",
};

describe("RepliesReview", () => {
  it("keeps feedback controls mounted and offers no-reply for automatic messages", () => {
    render(
      <RepliesReview
        companies={[company]}
        contacts={[contact]}
        replies={[reply]}
        senders={[sender]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

    const feedback = screen.getByLabelText("Feedback para nueva respuesta");
    fireEvent.change(feedback, {
      target: { value: "Responder más breve y pedir datos logísticos." },
    });

    expect(feedback).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rechazar y redactar de nuevo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No responder" }),
    ).toBeInTheDocument();
  });
});
