import { describe, expect, it } from "vitest";

import {
  buildMemoryText,
  normalizeMemoryText,
  toPgVectorLiteral,
} from "@/lib/gpt/semantic-memory";

describe("semantic memory helpers", () => {
  it("normalizes memory text without destroying paragraph boundaries", () => {
    expect(
      normalizeMemoryText("  Feedback   importante\n\n\n\nUsar tono directo.  "),
    ).toBe("Feedback   importante\n\nUsar tono directo.");
  });

  it("builds reusable memory text from optional parts", () => {
    expect(
      buildMemoryText([
        "Mail aprobado.",
        null,
        "Empresa: Colun.",
        undefined,
        "Usar tono concreto.",
      ]),
    ).toBe("Mail aprobado.\n\nEmpresa: Colun.\n\nUsar tono concreto.");
  });

  it("formats embeddings as pgvector literals", () => {
    expect(toPgVectorLiteral([0.1, -0.25, 1, Number.NaN])).toBe("[0.1,-0.25,1,0]");
  });
});
