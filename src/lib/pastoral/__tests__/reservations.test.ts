import { describe, expect, it } from "vitest";

import {
  createPastoralLocalReservation,
  getPastoralReservationDomain,
  type PastoralReservationStore,
} from "@/lib/pastoral/reservations";

describe("pastoral local sheet reservations", () => {
  it("reserves by message id and blocks another message using the same corporate domain", async () => {
    const rows: Array<{
      contactDomain: string | null;
      contactEmail: string;
      messageId: string;
      status: string;
    }> = [];
    const store: PastoralReservationStore = {
      async findByMessage(messageId) {
        return rows.find((row) => row.messageId === messageId) ?? null;
      },
      async findConflict(input) {
        return (
          rows.find(
            (row) =>
              row.messageId !== input.messageId &&
              (row.contactEmail === input.contactEmail ||
                (row.contactDomain && row.contactDomain === input.contactDomain)),
          ) ?? null
        );
      },
      async upsert(input) {
        rows.push({
          contactDomain: input.contactDomain,
          contactEmail: input.contactEmail,
          messageId: input.messageId,
          status: "reserved",
        });
      },
    };

    await expect(
      createPastoralLocalReservation(store, {
        campaignId: "campaign-1",
        companyId: "company-1",
        contactEmail: "ventas@empresa.cl",
        contactName: "Empresa",
        messageId: "message-1",
        sheetId: "sheet-1",
        sheetRange: "A:F",
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      createPastoralLocalReservation(store, {
        campaignId: "campaign-1",
        companyId: "company-2",
        contactEmail: "finanzas@empresa.cl",
        contactName: "Empresa 2",
        messageId: "message-2",
        sheetId: "sheet-1",
        sheetRange: "A:F",
      }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "local_domain_conflict",
    });
  });

  it("does not reserve common email domains as company domains", () => {
    expect(getPastoralReservationDomain("persona@gmail.com")).toBeNull();
    expect(getPastoralReservationDomain("donaciones@empresa.cl")).toBe("empresa.cl");
  });
});
