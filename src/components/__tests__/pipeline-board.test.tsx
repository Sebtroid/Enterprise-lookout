import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  getCompanyProjectLabels,
  PipelineBoard,
} from "@/components/pipeline-board";
import type { AppCampaign, AppCompany } from "@/lib/prospecting/demo-data";

const campaigns: AppCampaign[] = [
  {
    id: "dia-del-ingeniero",
    name: "Día del Ingeniero",
    organization: "CDI Uandes",
    description: "Asado con actividades y premios.",
    status: "active",
    valueProposition: "Premios, giftcards y activaciones.",
    startsOn: "2026-05-14",
  },
  {
    id: "pastoral-invierno-2026",
    name: "Pastoral UC Invierno 2026",
    organization: "Pastoral UC / Trabajo País",
    description: "Proyecto social universitario.",
    status: "active",
    valueProposition: "Aportes para proyecto social.",
    startsOn: "2026-06-01",
  },
];

const longNameCompany: AppCompany = {
  id: "company-long",
  campaignIds: ["dia-del-ingeniero", "pastoral-invierno-2026"],
  name: "Chocolates Artesanales Andes del Sur para Premios Universitarios",
  domain: "andesdulce.cl",
  website: "https://andesdulce.cl",
  industry: "Chocolates premium",
  region: "RM",
  description:
    "Productora de chocolates artesanales para regalos corporativos y activaciones.",
  fitScore: 88,
  status: "draft_ready",
  notes: "Tiene productos de premio y formato de gift box.",
  campaignNotes: "Buen fit para premios pequeños del Día del Ingeniero.",
  futureNotes: "Puede servir para gala o torneos con premios.",
  selectedContactReason: "Marca premium con capacidad de packs para estudiantes.",
  lastContactedAt: null,
  doNotContact: false,
  evidenceUrls: ["https://andesdulce.cl"],
};

describe("PipelineBoard", () => {
  it("maps company campaign ids to readable project labels", () => {
    expect(getCompanyProjectLabels(longNameCompany, campaigns)).toEqual([
      "Día del Ingeniero",
      "Pastoral UC Invierno 2026",
    ]);
  });

  it("renders long company names without truncating the visible title", () => {
    render(
      <PipelineBoard
        campaigns={campaigns}
        companies={[longNameCompany]}
        scopeLabel="Día del Ingeniero"
      />,
    );

    const title = screen
      .getAllByText(longNameCompany.name)
      .find((element) => element.tagName === "H2");

    expect(title).toBeTruthy();
    expect(title?.className).not.toContain("truncate");
  });
});
