import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { CompanyExplorer } from "@/components/company-explorer";
import type { ActionState } from "@/features/prospecting/actions";
import type { AppCampaign, AppCompany } from "@/lib/prospecting/demo-data";

const mocks = vi.hoisted(() => ({
  classifyCompanyForCampaignAction: vi.fn(),
  refresh: vi.fn(),
  updateCompanyQualityAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/prospecting/actions", () => ({
  classifyCompanyForCampaignAction: mocks.classifyCompanyForCampaignAction,
  updateCompanyQualityAction: mocks.updateCompanyQualityAction,
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

function company(id: string, name: string): AppCompany {
  return {
    id,
    campaignIds: [],
    name,
    domain: `${id}.test`,
    website: `https://${id}.test`,
    industry: "Consumo",
    region: "Chile",
    description: "Empresa de prueba.",
    qualityRating: 3,
    qualityNotes: "",
    fitScore: 50,
    status: "new",
    notes: "",
    doNotContact: false,
    evidenceUrls: [],
  };
}

describe("CompanyExplorer", () => {
  it("keeps other company actions enabled while one row is classifying", async () => {
    let resolveAction: ((value: ActionState) => void) | undefined;
    mocks.classifyCompanyForCampaignAction.mockImplementation(
      () =>
        new Promise<ActionState>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(
      <CompanyExplorer
        allCompanies={[
          company("gatorade", "Gatorade Chile"),
          company("watts", "Watts"),
        ]}
        campaignCompanies={[]}
        campaigns={[campaign]}
        contacts={[]}
        messages={[]}
        now="2026-05-08T12:00:00.000Z"
        replies={[]}
        scope={campaign.id}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Sirve" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Guardando" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Sirve" })).toBeEnabled();

    resolveAction?.({ ok: true, message: "Clasificada." });
    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });
});
