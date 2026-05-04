import { describe, expect, it } from "vitest";

import {
  extractDomain,
  normalizeCompanyName,
  normalizeEmail,
} from "../normalize";

describe("prospecting normalization", () => {
  it("normalizes company names for duplicate detection", () => {
    expect(normalizeCompanyName("Banco de Chile S.A.")).toBe("banco de chile");
    expect(normalizeCompanyName("  Fundación Empresa UC SpA  ")).toBe(
      "fundacion empresa uc",
    );
  });

  it("normalizes emails and extracts comparable domains", () => {
    expect(normalizeEmail("  Persona@Empresa.CL ")).toBe("persona@empresa.cl");
    expect(extractDomain("https://www.empresa.cl/rse")).toBe("empresa.cl");
    expect(extractDomain("persona@sub.empresa.cl")).toBe("sub.empresa.cl");
  });
});
