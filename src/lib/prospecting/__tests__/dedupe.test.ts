import { describe, expect, it } from "vitest";

import {
  findDuplicateCompanies,
  mergeContactProfiles,
  scoreContactPriority,
} from "../dedupe";

describe("prospecting dedupe", () => {
  it("finds duplicate companies by normalized domain or name", () => {
    const existing = [
      {
        id: "company-1",
        name: "Banco de Chile",
        domain: "bancochile.cl",
      },
      {
        id: "company-2",
        name: "Constructora Andina",
        domain: null,
      },
    ];

    expect(
      findDuplicateCompanies(
        { name: "Banco de Chile S.A.", domain: "www.bancochile.cl" },
        existing,
      ),
    ).toEqual([{ companyId: "company-1", reason: "domain", confidence: 0.98 }]);

    expect(
      findDuplicateCompanies(
        { name: "Constructora Andina SpA", domain: null },
        existing,
      ),
    ).toEqual([{ companyId: "company-2", reason: "name", confidence: 0.9 }]);
  });

  it("merges contact profiles without losing decision-maker context", () => {
    const merged = mergeContactProfiles(
      {
        name: "Camila Soto",
        role: "Jefa de Comunicaciones",
        email: "camila@empresa.cl",
        isDecisionMaker: false,
        notes: "Base antigua",
        sources: ["Notion 2025"],
      },
      {
        name: "Camila Soto",
        role: "Gerenta de Sostenibilidad",
        email: "CAMILA@EMPRESA.CL",
        isDecisionMaker: true,
        notes: "Respondió bien en campaña anterior",
        sources: ["Sheet TP"],
      },
    );

    expect(merged).toMatchObject({
      email: "camila@empresa.cl",
      role: "Gerenta de Sostenibilidad",
      isDecisionMaker: true,
      notes: "Base antigua\nRespondió bien en campaña anterior",
      sources: ["Notion 2025", "Sheet TP"],
    });
  });

  it("prioritizes decision-makers and resource-related roles", () => {
    expect(
      scoreContactPriority({
        role: "Gerenta de sostenibilidad y asuntos corporativos",
        isDecisionMaker: true,
        confidence: 0.8,
      }),
    ).toBeGreaterThan(
      scoreContactPriority({
        role: "Analista de marketing",
        isDecisionMaker: false,
        confidence: 0.8,
      }),
    );
  });
});
