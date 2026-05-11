import { describe, expect, it } from "vitest";

import {
  normalizeDomCompanyCandidate,
  normalizeDomCompanyCandidates,
} from "@/lib/dom/company-candidates";

describe("Dom company candidates", () => {
  it("normalizes candidate quality and fit into bounded review values", () => {
    expect(
      normalizeDomCompanyCandidate({
        name: "  Gatorade Chile  ",
        domain: "https://www.gatorade.cl/productos",
        website: "https://www.gatorade.cl/productos",
        fit_score: 112,
        fit_reason: "Calza perfecto con hidratación deportiva universitaria.",
        quality_rating: 8,
        quality_reason: "Marca masiva y conocida.",
        evidence_urls: ["https://gatorade.cl", "", "https://pepsico.cl"],
        suggested_contacts: [
          {
            name: "Nombre Apellido",
            role: "Brand Manager",
            email: "PERSONA@GATORADE.CL",
            confidence: 2,
            source: "web",
          },
        ],
      }),
    ).toMatchObject({
      name: "Gatorade Chile",
      normalizedName: "gatorade chile",
      domain: "gatorade.cl",
      website: "https://www.gatorade.cl/productos",
      fitScore: 100,
      qualityRating: 5,
      evidenceUrls: ["https://gatorade.cl", "https://pepsico.cl"],
      suggestedContacts: [
        {
          name: "Nombre Apellido",
          role: "Brand Manager",
          email: "persona@gatorade.cl",
          confidence: 1,
          source: "web",
        },
      ],
    });
  });

  it("accepts legacy companies_added payloads as candidate batches", () => {
    const candidates = normalizeDomCompanyCandidates({
      companies_added: [
        {
          canonical_name: "Watts",
          website: "https://www.watts.cl",
          fit_score: 88,
          quality_rating: 5,
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Watts",
      domain: "watts.cl",
      qualityRating: 5,
    });
  });
});
