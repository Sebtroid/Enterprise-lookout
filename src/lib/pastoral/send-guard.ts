import {
  appendPastoralSheetContact,
  fetchPastoralSheetContactsFromApi,
  getPastoralSheetsConfig,
  isPastoralSheetsConfigured,
  verifyPastoralSheetContact,
} from "@/lib/pastoral/google-sheets";
import {
  createPastoralLocalReservation,
  createPostgresPastoralReservationStore,
} from "@/lib/pastoral/reservations";
import {
  buildPastoralSheetRow,
  findPastoralDuplicate,
} from "@/lib/pastoral/sheet";

export type PastoralSendGuardMessage = {
  campaign_id: string;
  company_id: string | null;
  company_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  id: string;
  sender_display_name: string | null;
  sender_email: string;
  to_email: string;
};

export async function preparePastoralInitialSendGuard({
  accessToken,
  message,
  sql,
}: {
  accessToken: string;
  message: PastoralSendGuardMessage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any;
}) {
  const config = getPastoralSheetsConfig();
  if (!isPastoralSheetsConfigured(config)) {
    return {
      ok: false as const,
      error:
        "Falta configurar PASTORAL_CONTACT_SHEET_ID o PASTORAL_CONTACT_SHEET_RANGE antes de enviar Pastoral.",
      status: 409,
    };
  }
  if (!accessToken) {
    return {
      ok: false as const,
      error:
        "Falta permiso OAuth de Google Sheets para Pastoral. Reconecta Google desde la app para autorizar Sheets antes de enviar.",
      status: 409,
    };
  }

  let sheetContacts: Awaited<ReturnType<typeof fetchPastoralSheetContactsFromApi>>;
  try {
    sheetContacts = await fetchPastoralSheetContactsFromApi({
      accessToken,
      config,
    });
  } catch (error) {
    return {
      ok: false as const,
      error: `Bloqueado por Sheets Pastoral antes de enviar: ${error instanceof Error ? error.message : "no pude leer la planilla"}.`,
      status: 409,
    };
  }

  const duplicate = findPastoralDuplicate({
    companyName: message.company_name,
    email: message.to_email,
    sheetContacts,
  });

  if (duplicate) {
    return {
      ok: false as const,
      error: `Bloqueado por Sheets Pastoral: ya aparece ${duplicate.contact.name || duplicate.contact.email} (${formatPastoralDuplicateReason(duplicate.reason)}), contactado por ${duplicate.contact.contactedBy || "sin responsable"}.`,
      status: 409,
    };
  }

  const contactName = String(
    message.company_name || message.contact_name || message.to_email,
  );
  const store = createPostgresPastoralReservationStore(sql);
  let reservation: Awaited<ReturnType<typeof createPastoralLocalReservation>>;
  try {
    reservation = await createPastoralLocalReservation(store, {
      campaignId: String(message.campaign_id),
      companyId: message.company_id ? String(message.company_id) : null,
      contactEmail: String(message.to_email),
      contactId: message.contact_id ? String(message.contact_id) : null,
      contactName,
      messageId: String(message.id),
      senderEmail: String(message.sender_email),
      sheetId: config.spreadsheetId,
      sheetRange: config.range,
    });
  } catch (error) {
    return {
      ok: false as const,
      error: `Bloqueado por reserva local Pastoral: ${error instanceof Error ? error.message : "no pude crear reserva idempotente"}.`,
      status: 409,
    };
  }

  if (!reservation.ok) {
    return {
      ok: false as const,
      error:
        reservation.reason === "local_email_conflict"
          ? `Bloqueado por reserva local Pastoral: ${message.to_email} ya fue reservado para otro envío.`
          : `Bloqueado por reserva local Pastoral: el dominio de ${message.to_email} ya fue reservado para otro envío.`,
      status: 409,
    };
  }

  const row = buildPastoralSheetRow({
    comments: `Registrado por Enterprise Lookout antes de enviar Gmail. Message ID: ${message.id}.`,
    contactedBy: String(message.sender_display_name || message.sender_email),
    email: String(message.to_email),
    name: contactName,
    status: "Contactado",
  });
  const appendResult = await appendPastoralSheetContact({
    accessToken,
    config,
    row,
  }).catch((error: Error) => ({
    ok: false as const,
    error: error.message,
  }));

  if (!appendResult.ok) {
    await store.markStatus(String(message.id), "failed", {
      error: appendResult.error,
      stage: "append",
    });
    return { ok: false as const, error: appendResult.error, status: 409 };
  }

  await store.markStatus(String(message.id), "appended");
  let contactsAfterAppend: Awaited<ReturnType<typeof fetchPastoralSheetContactsFromApi>>;
  try {
    contactsAfterAppend = await fetchPastoralSheetContactsFromApi({
      accessToken,
      config,
    });
  } catch (error) {
    const messageText = `Registré la fila en Sheets, pero falló la relectura de verificación: ${error instanceof Error ? error.message : "error desconocido"}. No envío Gmail.`;
    await store.markStatus(String(message.id), "failed", {
      error: messageText,
      stage: "verify_read",
    });
    return { ok: false as const, error: messageText, status: 409 };
  }
  const verified = verifyPastoralSheetContact({
    contacts: contactsAfterAppend,
    email: String(message.to_email),
    name: contactName,
  });

  if (!verified) {
    const error =
      "Registré la fila en Sheets, pero no pude verificarla al releer la planilla. No envío Gmail para evitar inconsistencias.";
    await store.markStatus(String(message.id), "failed", {
      error,
      stage: "verify",
    });
    return { ok: false as const, error, status: 409 };
  }

  await store.markStatus(String(message.id), "verified");
  return {
    ok: true as const,
    markSent: async (detail: unknown) => {
      await store.markStatus(String(message.id), "sent", detail);
    },
    markFailed: async (detail: unknown) => {
      await store.markStatus(String(message.id), "failed", detail);
    },
  };
}

function formatPastoralDuplicateReason(reason: "domain" | "email" | "name") {
  if (reason === "email") return "mismo mail";
  if (reason === "domain") return "mismo dominio";
  return "mismo nombre";
}
