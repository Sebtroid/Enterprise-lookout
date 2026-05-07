import { describe, expect, it } from "vitest";

import { shouldReplaceDomCollection } from "../chat-state";

describe("Dom chat polling state", () => {
  it("does not replace chat messages when polling returns the same snapshot", () => {
    const current = [
      {
        id: "message-1",
        role: "dom",
        content: "Estoy buscando contactos.",
        createdAt: "2026-05-06T22:00:00.000Z",
      },
    ];
    const next = current.map((message) => ({ ...message }));

    expect(shouldReplaceDomCollection(current, next)).toBe(false);
  });

  it("replaces chat messages when polling returns new content", () => {
    expect(
      shouldReplaceDomCollection(
        [
          {
            id: "message-1",
            role: "dom",
            content: "Estoy buscando contactos.",
            createdAt: "2026-05-06T22:00:00.000Z",
          },
        ],
        [
          {
            id: "message-1",
            role: "dom",
            content: "Encontré tres empresas.",
            createdAt: "2026-05-06T22:00:00.000Z",
          },
        ],
      ),
    ).toBe(true);
  });
});
