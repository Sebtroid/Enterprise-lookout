import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { DomTaskList } from "@/components/dom-task-list";
import type { DomCompanyCandidate, DomTask } from "@/lib/dom/types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  reviewDomCandidateAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/prospecting/actions", () => ({
  reviewDomCandidateAction: mocks.reviewDomCandidateAction,
}));

const task: DomTask = {
  id: "11111111-1111-4111-8111-111111111111",
  campaignId: "campaign-1",
  campaignName: "Día del Ingeniero",
  description: "Buscar empresas de hidratación",
  status: "completed",
  createdBy: "dom",
  createdAt: "2026-05-07T12:00:00.000Z",
  updatedAt: "2026-05-07T12:05:00.000Z",
  context: null,
  result: "Encontré opciones.",
  chatThreadId: null,
  progressStep: null,
  progressMessage: null,
  progressPercent: 100,
  resultPreview: null,
  lastProgressAt: "2026-05-07T12:05:00.000Z",
  candidateCount: 1,
  pendingCandidateCount: 1,
};

const candidate: DomCompanyCandidate = {
  id: "22222222-2222-4222-8222-222222222222",
  taskId: task.id,
  campaignId: "campaign-1",
  campaignName: "Día del Ingeniero",
  companyId: null,
  name: "Gatorade Chile",
  domain: "gatorade.cl",
  website: "https://gatorade.cl",
  industry: "Bebidas deportivas",
  region: "Chile",
  description: "Marca masiva de hidratación deportiva.",
  evidenceUrls: ["https://gatorade.cl"],
  suggestedContacts: [
    {
      name: "Marketing Manager",
      role: "Marketing",
      email: "marketing@gatorade.cl",
      confidence: 0.7,
      source: "web",
    },
  ],
  fitScore: 92,
  fitReason: "Calza con evento deportivo universitario.",
  qualityRating: 5,
  qualityReason: "Marca grande y conocida.",
  status: "pending",
  userFeedback: null,
  reviewedAt: null,
  createdAt: "2026-05-07T12:05:00.000Z",
  updatedAt: "2026-05-07T12:05:00.000Z",
};

function buildTask(overrides: Partial<DomTask>): DomTask {
  return {
    ...task,
    id: overrides.id ?? crypto.randomUUID(),
    candidateCount: 0,
    pendingCandidateCount: 0,
    ...overrides,
  };
}

describe("DomTaskList", () => {
  it("shows pending candidates and removes the card after accepting", async () => {
    mocks.reviewDomCandidateAction.mockResolvedValue({
      ok: true,
      message: "Gatorade guardada.",
    });

    render(
      <DomTaskList
        initialCandidates={[candidate]}
        initialTasks={[task]}
        scope="dia-del-ingeniero"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Revisar resultados" }));
    expect(screen.getByText("Gatorade Chile")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Guardar y usar" }));

    await waitFor(() => {
      expect(screen.queryByText("Gatorade Chile")).not.toBeInTheDocument();
    });
    expect(mocks.reviewDomCandidateAction).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("filters tasks with visible section buttons", () => {
    render(
      <DomTaskList
        initialCandidates={[]}
        initialTasks={[
          buildTask({
            id: "11111111-1111-4111-8111-111111111111",
            description: "Buscar empresas de hidratación",
            context: { source: "manual_task_form" },
          }),
          buildTask({
            id: "33333333-3333-4333-8333-333333333333",
            description: "Redactar mail inicial para ÓBOLO Chocolate.",
            context: { requested_action: "draft_needed" },
          }),
          buildTask({
            id: "44444444-4444-4444-8444-444444444444",
            description: "Investigar contacto usable para Cecinas Bavaria.",
            context: { source: "company_marked_fit_without_contact" },
          }),
        ]}
        scope="dia-del-ingeniero"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Todas/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Búsqueda de empresas/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mails/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Investigación/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mails/i }));

    expect(screen.getByText("Redactar mail inicial para ÓBOLO Chocolate.")).toBeInTheDocument();
    expect(screen.queryByText("Buscar empresas de hidratación")).not.toBeInTheDocument();
    expect(screen.queryByText("Investigar contacto usable para Cecinas Bavaria.")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Búsqueda de empresas/i }),
    );

    expect(screen.getByText("Buscar empresas de hidratación")).toBeInTheDocument();
    expect(screen.queryByText("Redactar mail inicial para ÓBOLO Chocolate.")).not.toBeInTheDocument();
  });
});
