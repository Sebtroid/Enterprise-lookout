import { describe, expect, it, vi } from "vitest";

import { formatGmailSyncSummary } from "@/components/gmail-sync-replies-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("GmailSyncRepliesButton", () => {
  it("separates sent messages checked from Gmail candidate messages", () => {
    expect(
      formatGmailSyncSummary({
        sentMessagesChecked: 42,
        gmailMessagesScanned: 6,
        inserted: 0,
      }),
    ).toBe(
      "Mails enviados revisados: 42. Mensajes candidatos encontrados en Gmail: 6. Respuestas nuevas: 0.",
    );
  });

  it("keeps the old scanned field as a fallback", () => {
    expect(
      formatGmailSyncSummary({
        scanned: 6,
        inserted: 2,
      }),
    ).toBe(
      "Mails enviados revisados: 0. Mensajes candidatos encontrados en Gmail: 6. Respuestas nuevas: 2.",
    );
  });
});
