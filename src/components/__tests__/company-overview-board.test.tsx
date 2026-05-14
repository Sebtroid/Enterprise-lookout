import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { CompanyOverviewBoard } from "@/components/company-overview-board";
import type {
  AppCampaign,
  AppCompany,
  AppContact,
  AppMessage,
  AppReply,
} from "@/lib/prospecting/demo-data";

const mocks = vi.hoisted(() => ({
  createCompanyOverviewDomTaskAction: vi.fn(async () => ({
    ok: true,
    message: "Tarea creada y enviada a Dom.",
  })),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/prospecting/actions", () => ({
  createCompanyOverviewDomTaskAction:
    mocks.createCompanyOverviewDomTaskAction,
}));

const campaign: AppCampaign = {
  id: "dia-del-ingeniero",
  name: "Día del Ingeniero",
  organization: "CDI Uandes",
  description: "Evento universitario.",
  status: "active",
  valueProposition: "Auspicios en especie.",
  startsOn: "2026-05-14",
};

const company: AppCompany = {
  id: "company-escapology",
  campaignIds: ["dia-del-ingeniero"],
  name: "Escapology Chile",
  domain: "escapology.cl",
  website: "https://escapology.cl",
  industry: "Entretención",
  region: "RM",
  description: "Salas de escape para grupos.",
  fitScore: 80,
  status: "replied",
  notes: "",
  doNotContact: false,
  evidenceUrls: [],
};

const contact: AppContact = {
  id: "contact-humberto",
  companyId: "company-escapology",
  name: "Humberto Jorquera",
  role: "Alianzas",
  email: "humberto@escapology.cl",
  phone: null,
  category: "Partnerships",
  confidence: 0.95,
  verificationStatus: "verified",
  verifiedAt: "2026-05-13T20:00:00.000Z",
  bounceCount: 0,
  source: "gmail_reply",
  isDecisionMaker: true,
  doNotContact: false,
  notes: "Respondió desde Gmail.",
};

const message: AppMessage = {
  id: "message-1",
  campaignId: "dia-del-ingeniero",
  companyId: "company-escapology",
  contactId: "contact-humberto",
  senderId: "sender-1",
  kind: "outbound_reply",
  status: "sent",
  subject: "Propuesta Día del Ingeniero",
  body: "Hola Humberto, te cuento el detalle de visibilidad.",
  createdAt: "2026-05-13T18:00:00.000Z",
  sentAt: "2026-05-13T18:10:00.000Z",
};

const reply: AppReply = {
  id: "reply-1",
  messageId: "message-1",
  companyId: "company-escapology",
  contactId: "contact-humberto",
  senderId: "sender-1",
  classification: "needs_info",
  receivedAt: "2026-05-13T20:00:00.000Z",
  body: "Perfecto, coméntanos para qué fecha necesitan la gift card.",
  draftResponse: "Gracias, te confirmo.",
  approvalStatus: "needs_review",
  futureNote: "Cerrado automáticamente.",
};

describe("CompanyOverviewBoard", () => {
  it("shows company communication counters and expands the contact registry", () => {
    render(
      <CompanyOverviewBoard
        campaign={campaign}
        companies={[company]}
        contacts={[contact]}
        messages={[message]}
        now="2026-05-14T00:00:00.000Z"
        replies={[reply]}
        scope={campaign.id}
      />,
    );

    expect(screen.getByText("Escapology Chile")).toBeInTheDocument();
    expect(screen.getByText("1 mail enviado")).toBeInTheDocument();
    expect(screen.getByText("1 respuesta")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver registro de Escapology Chile",
      }),
    );

    expect(screen.getByText("humberto@escapology.cl")).toBeInTheDocument();
    expect(screen.getByText("Propuesta Día del Ingeniero")).toBeInTheDocument();
    expect(screen.getByText("needs_info")).toBeInTheDocument();
  });

  it("creates a Dom task with the selected company and user instruction", async () => {
    render(
      <CompanyOverviewBoard
        campaign={campaign}
        companies={[company]}
        contacts={[contact]}
        messages={[message]}
        now="2026-05-14T00:00:00.000Z"
        replies={[reply]}
        scope={campaign.id}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver registro de Escapology Chile",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Pedir a Dom sobre Escapology Chile",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Qué quieres decirle a Dom sobre esta empresa"),
      {
        target: {
          value:
            "Ojo que respondió otra persona, revisa si hay que agregarla como contacto.",
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => {
      expect(mocks.createCompanyOverviewDomTaskAction).toHaveBeenCalled();
    });

    const formData = mocks.createCompanyOverviewDomTaskAction.mock.calls[0][1] as FormData;
    expect(formData.get("scope")).toBe("dia-del-ingeniero");
    expect(formData.get("companyId")).toBe("company-escapology");
    expect(formData.get("instruction")).toContain("respondió otra persona");
  });

  it("only lists companies that are approved or already contacted in the project", () => {
    const approvedCompany: AppCompany = {
      ...company,
      id: "company-approved",
      name: "Empresa aprobada",
      status: "approved_to_send",
    };
    const untouchedCompany: AppCompany = {
      ...company,
      id: "company-untouched",
      name: "Empresa sin aprobar",
      status: "qualified",
    };
    const contactedCompany: AppCompany = {
      ...company,
      id: "company-contacted",
      name: "Empresa contactada",
      status: "new",
    };
    const closedWithoutContactCompany: AppCompany = {
      ...company,
      id: "company-closed-without-contact",
      name: "Empresa cerrada sin contacto",
      status: "closed_negative",
    };
    const contactedMessage: AppMessage = {
      ...message,
      id: "message-contacted",
      companyId: "company-contacted",
      status: "sent",
    };

    render(
      <CompanyOverviewBoard
        campaign={campaign}
        companies={[
          approvedCompany,
          untouchedCompany,
          contactedCompany,
          closedWithoutContactCompany,
        ]}
        contacts={[]}
        messages={[contactedMessage]}
        now="2026-05-14T00:00:00.000Z"
        replies={[]}
        scope={campaign.id}
      />,
    );

    expect(screen.getByText("Empresa aprobada")).toBeInTheDocument();
    expect(screen.getByText("Empresa contactada")).toBeInTheDocument();
    expect(screen.queryByText("Empresa sin aprobar")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Empresa cerrada sin contacto"),
    ).not.toBeInTheDocument();
  });

  it("removes rejected mails from history and lets each remaining mail open", () => {
    const fullBody =
      "Hola Humberto,\n\nPrimera línea visible.\n\nDetalle interno de visibilidad, pantallas y menciones para entender el contexto completo.";
    const activeMessage: AppMessage = {
      ...message,
      body: fullBody,
    };
    const rejectedMessage: AppMessage = {
      ...message,
      id: "message-rejected",
      status: "rejected",
      subject: "Borrador rechazado",
      body: "Este texto rechazado no debería aparecer.",
    };
    const rejectedReply: AppReply = {
      ...reply,
      id: "reply-rejected",
      approvalStatus: "rejected",
      body: "Esta respuesta rechazada no debería aparecer.",
    };

    render(
      <CompanyOverviewBoard
        campaign={campaign}
        companies={[company]}
        contacts={[contact]}
        messages={[activeMessage, rejectedMessage]}
        now="2026-05-14T00:00:00.000Z"
        replies={[reply, rejectedReply]}
        scope={campaign.id}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver registro de Escapology Chile",
      }),
    );

    expect(screen.queryByText("Borrador rechazado")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Esta respuesta rechazada no debería aparecer."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Detalle interno de visibilidad/),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Abrir mail Propuesta Día del Ingeniero",
      }),
    );

    expect(screen.getByText(/Detalle interno de visibilidad/)).toBeInTheDocument();
  });
});
