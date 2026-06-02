import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = {
    markStatus: vi.fn(),
  };

  return {
    appendPastoralSheetContact: vi.fn(),
    createPastoralLocalReservation: vi.fn(),
    createPostgresPastoralReservationStore: vi.fn(() => store),
    fetchPastoralSheetContactsFromApi: vi.fn(),
    getPastoralSheetsConfig: vi.fn(),
    isPastoralSheetsConfigured: vi.fn(),
    store,
    verifyPastoralSheetContact: vi.fn(),
  };
});

vi.mock("@/lib/pastoral/google-sheets", () => ({
  appendPastoralSheetContact: mocks.appendPastoralSheetContact,
  fetchPastoralSheetContactsFromApi: mocks.fetchPastoralSheetContactsFromApi,
  getPastoralSheetsConfig: mocks.getPastoralSheetsConfig,
  isPastoralSheetsConfigured: mocks.isPastoralSheetsConfigured,
  verifyPastoralSheetContact: mocks.verifyPastoralSheetContact,
}));

vi.mock("@/lib/pastoral/reservations", () => ({
  createPastoralLocalReservation: mocks.createPastoralLocalReservation,
  createPostgresPastoralReservationStore: mocks.createPostgresPastoralReservationStore,
}));

import {
  preparePastoralInitialSendGuard,
  type PastoralSendGuardMessage,
} from "@/lib/pastoral/send-guard";

const message: PastoralSendGuardMessage = {
  campaign_id: "campaign-1",
  company_id: "company-1",
  company_name: "Empresa Zona",
  contact_id: "contact-1",
  contact_name: "Francisca",
  id: "11111111-1111-1111-1111-111111111111",
  sender_display_name: "Sebastian",
  sender_email: "sawitting@miuandes.cl",
  to_email: "contacto@empresazona.cl",
};

describe("Pastoral initial send guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPastoralSheetsConfig.mockReturnValue({
      range: "A:F",
      spreadsheetId: "sheet-1",
    });
    mocks.isPastoralSheetsConfigured.mockReturnValue(true);
    mocks.fetchPastoralSheetContactsFromApi.mockResolvedValue([]);
    mocks.createPastoralLocalReservation.mockResolvedValue({ ok: true });
    mocks.appendPastoralSheetContact.mockResolvedValue({ ok: true });
    mocks.verifyPastoralSheetContact.mockReturnValue(true);
  });

  it("fails closed before reading Sheets when OAuth access token is missing", async () => {
    const result = await preparePastoralInitialSendGuard({
      accessToken: "",
      message,
      sql: {},
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(result.ok === false ? result.error : "").toContain(
      "OAuth",
    );
    expect(mocks.fetchPastoralSheetContactsFromApi).not.toHaveBeenCalled();
    expect(mocks.createPastoralLocalReservation).not.toHaveBeenCalled();
  });

  it("blocks duplicate contacts from Sheets before local reservation or append", async () => {
    mocks.fetchPastoralSheetContactsFromApi.mockResolvedValue([
      {
        comments: "ya lo tomó otra zona",
        contactedBy: "Margarita",
        email: "contacto@empresazona.cl",
        name: "Empresa Zona",
        status: "Contactado",
      },
    ]);

    const result = await preparePastoralInitialSendGuard({
      accessToken: "access-token",
      message,
      sql: {},
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(result.ok === false ? result.error : "").toContain("ya aparece");
    expect(mocks.createPastoralLocalReservation).not.toHaveBeenCalled();
    expect(mocks.appendPastoralSheetContact).not.toHaveBeenCalled();
  });

  it("reserves locally, appends to Sheets, verifies by rereading, then exposes sent/failed markers", async () => {
    mocks.fetchPastoralSheetContactsFromApi
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          comments: "",
          contactedBy: "José Miguel Olavarría",
          email: "contacto@empresazona.cl",
          name: "Empresa Zona",
          status: "Esperando respuesta",
        },
      ]);

    const result = await preparePastoralInitialSendGuard({
      accessToken: "access-token",
      message,
      sql: {},
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.createPastoralLocalReservation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactEmail: "contacto@empresazona.cl",
        messageId: "11111111-1111-1111-1111-111111111111",
        sheetId: "sheet-1",
      }),
    );
    expect(mocks.appendPastoralSheetContact).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        row: expect.arrayContaining([
          "Empresa Zona",
          "contacto@empresazona.cl",
          "José Miguel Olavarría",
          "Esperando respuesta",
          "",
        ]),
      }),
    );
    expect(mocks.store.markStatus).toHaveBeenNthCalledWith(
      1,
      message.id,
      "appended",
    );
    expect(mocks.store.markStatus).toHaveBeenNthCalledWith(
      2,
      message.id,
      "verified",
    );

    if (result.ok) {
      await result.markSent({ gmail_message_id: "gmail-1" });
      await result.markFailed({ stage: "manual-test" });
    }

    expect(mocks.store.markStatus).toHaveBeenCalledWith(message.id, "sent", {
      gmail_message_id: "gmail-1",
    });
    expect(mocks.store.markStatus).toHaveBeenCalledWith(message.id, "failed", {
      stage: "manual-test",
    });
  });

  it("marks the reservation failed and blocks Gmail when append fails", async () => {
    mocks.appendPastoralSheetContact.mockResolvedValue({
      ok: false,
      error: "Sheets append failed",
    });

    const result = await preparePastoralInitialSendGuard({
      accessToken: "access-token",
      message,
      sql: {},
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(result.ok === false ? result.error : "").toContain(
      "Sheets append failed",
    );
    expect(mocks.store.markStatus).toHaveBeenCalledWith(message.id, "failed", {
      error: "Sheets append failed",
      stage: "append",
    });
  });
});
