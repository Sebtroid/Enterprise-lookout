import { describe, expect, it } from "vitest";

import { requireGmailDraftProvider } from "../mail-provider";

describe("draft mail provider dispatch", () => {
  it("allows the existing Gmail send path", () => {
    expect(requireGmailDraftProvider({ gmailAccountId: "gmail-1", microsoftAccountId: null })).toBe("gmail-1");
  });

  it("blocks Microsoft sending explicitly instead of pretending to use Gmail", () => {
    expect(() => requireGmailDraftProvider({ gmailAccountId: null, microsoftAccountId: "microsoft-1" }))
      .toThrow("El envío Microsoft 365 todavía no está disponible");
  });
});
