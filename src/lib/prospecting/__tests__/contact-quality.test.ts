import { describe, expect, it } from "vitest";

import {
  evaluateContactQuality,
  getPastoralInitialContactSendReadiness,
  inferEmailCandidates,
  isGenericInboxEmail,
} from "../contact-quality";

describe("contact quality", () => {
  it("blocks generic inboxes even when the domain is corporate", () => {
    const assessment = evaluateContactQuality({
      confidence: 0.95,
      email: "contacto@copec.cl",
      fullName: "Contacto Copec",
      isDecisionMaker: false,
      role: "Contacto general",
      source: "Sitio web",
      verificationStatus: "verified",
    });

    expect(isGenericInboxEmail("ventas@empresa.cl")).toBe(true);
    expect(assessment.sendReady).toBe(false);
    expect(assessment.blockers).toContain("generic_inbox");
  });

  it("requires verified direct human contacts before Pastoral initial sends", () => {
    expect(
      getPastoralInitialContactSendReadiness({
        confidence: 0.9,
        email: "maria.gonzalez@empresa.cl",
        fullName: "Maria Gonzalez",
        isDecisionMaker: true,
        role: "Gerente de Asuntos Corporativos",
        source: "Memoria anual 2025",
        verificationStatus: "unverified",
      }),
    ).toMatchObject({
      ok: false,
      assessment: { blockers: ["unverified_email"] },
    });

    expect(
      getPastoralInitialContactSendReadiness({
        confidence: 0.9,
        email: "maria.gonzalez@empresa.cl",
        fullName: "Maria Gonzalez",
        isDecisionMaker: true,
        role: "Gerente de Asuntos Corporativos",
        source: "Memoria anual 2025",
        verificationStatus: "verified",
      }),
    ).toMatchObject({
      ok: true,
      assessment: {
        directHumanContact: true,
        sendReady: true,
      },
    });
  });

  it("infers likely email candidates without treating them as verified", () => {
    expect(
      inferEmailCandidates({
        domain: "empresa.cl",
        fullName: "José Miguel Olavarría",
      }).map((candidate) => candidate.email),
    ).toEqual([
      "jose.olavarria@empresa.cl",
      "josemiguel.olavarria@empresa.cl",
      "jolavarria@empresa.cl",
      "joseolavarria@empresa.cl",
      "jose.miguel@empresa.cl",
      "jose@empresa.cl",
    ]);

    expect(
      inferEmailCandidates({
        domain: "gmail.com",
        fullName: "José Miguel Olavarría",
      }),
    ).toEqual([]);
  });
});
