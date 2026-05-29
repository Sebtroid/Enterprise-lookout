import { describe, expect, it, vi } from "vitest";

import {
  appendPastoralSheetContact,
  fetchPastoralSheetContactsFromApi,
  getPastoralSheetsConfig,
  isPastoralSheetsConfigured,
  parsePastoralSheetValues,
  verifyPastoralSheetContact,
} from "@/lib/pastoral/google-sheets";
import { buildPastoralSheetRow } from "@/lib/pastoral/sheet";

describe("pastoral Google Sheets OAuth", () => {
  it("reads sheet config from env values without technical account credentials", () => {
    const config = getPastoralSheetsConfig({
      PASTORAL_CONTACT_SHEET_ID: "sheet-123",
      PASTORAL_CONTACT_SHEET_RANGE: "'Contactados'!A:F",
    });

    expect(config).toMatchObject({
      range: "'Contactados'!A:F",
      spreadsheetId: "sheet-123",
    });
    expect(isPastoralSheetsConfigured(config)).toBe(true);
    expect(
      isPastoralSheetsConfigured(
        getPastoralSheetsConfig({
          PASTORAL_CONTACT_SHEET_ID: "",
          PASTORAL_CONTACT_SHEET_RANGE: "A:F",
        }),
      ),
    ).toBe(false);
  });

  it("parses values returned by the Sheets API using the shared columns", () => {
    expect(
      parsePastoralSheetValues([
        ["-", "Mail de contacto", "Contactado por", "Estado", "Comentarios"],
        ["Olivo Capital", "ves@olivocapital.cl", "Margarita", "Contactado", "OK"],
      ]),
    ).toEqual([
      {
        comments: "OK",
        contactedBy: "Margarita",
        email: "ves@olivocapital.cl",
        name: "Olivo Capital",
        status: "Contactado",
      },
    ]);
  });

  it("appends a contact row and verifies it by reading the sheet again", async () => {
    const config = getPastoralSheetsConfig({
      PASTORAL_CONTACT_SHEET_ID: "sheet-123",
      PASTORAL_CONTACT_SHEET_RANGE: "A:F",
    });
    const row = buildPastoralSheetRow({
      comments: "Message ID: msg-1",
      contactedBy: "Sebastian",
      email: "contacto@empresa.cl",
      name: "Empresa",
      status: "Contactado",
    });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes(":append")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ values: [row] });
        return Response.json({ updates: { updatedRows: 1 } });
      }

      return Response.json({
        values: [
          ["-", "Mail de contacto", "Contactado por", "Estado", "Comentarios"],
          ["Empresa", "contacto@empresa.cl", "Sebastian", "Contactado", "Message ID: msg-1"],
        ],
      });
    });

    await expect(
      appendPastoralSheetContact({
        accessToken: "token",
        config,
        fetcher: fetcher as unknown as typeof fetch,
        row,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      fetchPastoralSheetContactsFromApi({
        accessToken: "token",
        config,
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).resolves.toHaveLength(1);

    expect(
      verifyPastoralSheetContact({
        contacts: parsePastoralSheetValues([
          ["-", "Mail de contacto", "Contactado por", "Estado", "Comentarios"],
          ["Empresa", "contacto@empresa.cl", "Sebastian", "Contactado", "Message ID: msg-1"],
        ]),
        email: "contacto@empresa.cl",
        name: "Empresa",
      }),
    ).toBe(true);
  });
});
