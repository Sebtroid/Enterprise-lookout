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

describe("pastoral Google Sheets service account", () => {
  it("normalizes service account config from env values", () => {
    const config = getPastoralSheetsConfig({
      GOOGLE_SHEETS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
      GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: "bot@example.iam.gserviceaccount.com",
      PASTORAL_CONTACT_SHEET_ID: "sheet-123",
      PASTORAL_CONTACT_SHEET_RANGE: "'Contactados'!A:F",
    });

    expect(config).toMatchObject({
      clientEmail: "bot@example.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      range: "'Contactados'!A:F",
      spreadsheetId: "sheet-123",
    });
    expect(isPastoralSheetsConfigured(config)).toBe(true);
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
      GOOGLE_SHEETS_PRIVATE_KEY: "key",
      GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: "bot@example.iam.gserviceaccount.com",
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
