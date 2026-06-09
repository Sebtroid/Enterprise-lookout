import { describe, expect, it } from "vitest";

import {
  buildPastoralInitialOutreachBody,
  containsPastoralInternalMetadataLeak,
} from "@/lib/pastoral/outreach-copy";

describe("pastoral outreach copy", () => {
  it("does not leak internal research metadata into the email body", () => {
    const body = buildPastoralInitialOutreachBody({
      company: "Rippconsulting",
      industry: "Minería, industria, energía y logística",
      region: "Chile",
    });

    expect(body).not.toMatch(/contacto y cargo ejecutivo/i);
    expect(body).not.toMatch(/cat[aá]logo oficial/i);
    expect(body).not.toMatch(/bloque de expositor/i);
    expect(body).not.toMatch(/fuente:/i);
    expect(body).not.toMatch(/especialmente\s+[A-Z]/);
    expect(body).toContain(
      "Por su experiencia industrial y capacidad de movilizar recursos",
    );
  });

  it("keeps rural context for food, agriculture, and local companies", () => {
    const foodBody = buildPastoralInitialOutreachBody({
      company: "Viña Ejemplo",
      industry: "Vitivinicultura",
      region: "Maule",
    });

    expect(foodBody).toContain("zona centro-sur");
    expect(foodBody).toContain("comunidad rural");
    expect(foodBody).toContain("Ninhue");
  });

  it("detects internal research metadata before Gmail send", () => {
    expect(
      containsPastoralInternalMetadataLeak(
        "Contacto y cargo ejecutivo publicados en el mismo bloque de expositor del catálogo oficial EXPONOR 2024.",
      ),
    ).toBe(true);
    expect(
      containsPastoralInternalMetadataLeak(
        "Por su experiencia industrial, creemos que podrían aportar de manera concreta al trabajo en terreno.",
      ),
    ).toBe(false);
  });
});
