import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type postgres from "postgres";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import {
  buildGmailSendBody,
  buildMimeMessage,
  encodeRawMessage,
} from "@/lib/gmail/mime";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";
import {
  PASTORAL_CAMPAIGN_SLUG,
  PASTORAL_SHEET_CONTACTED_BY,
  pastoralZone,
} from "@/lib/pastoral/config";
import { getPastoralBenefitAttachments } from "@/lib/pastoral/attachments";
import { buildPastoralInitialOutreachBody } from "@/lib/pastoral/outreach-copy";
import {
  fetchPastoralSheetContactsFromApi,
  getPastoralSheetsConfig,
  isPastoralSheetsConfigured,
} from "@/lib/pastoral/google-sheets";
import {
  createPastoralLocalReservation,
  createPostgresPastoralReservationStore,
} from "@/lib/pastoral/reservations";
import {
  buildPastoralSheetRow,
  findPastoralDuplicate,
  type PastoralSheetContact,
} from "@/lib/pastoral/sheet";
import {
  extractDomain,
  normalizeCompanyName,
  normalizeEmail,
} from "@/lib/prospecting/normalize";
import { getPostgresClient } from "@/lib/supabase/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SENDER_EMAIL = "sawitting@miuandes.cl";
const DEFAULT_SHEET_NAME = "2026";
const DEFAULT_START_ROW = 1372;
const HISTORICAL_SHEET_GIDS = ["1643256420"];

const candidateSchema = z.object({
  company: z.string().min(2),
  email: z.string().email(),
  contactName: z.string().optional(),
  role: z.string().optional(),
  source: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  region: z.string().optional(),
  reason: z.string().optional(),
});

const requestSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(60),
  dryRun: z.boolean().optional().default(false),
  senderEmail: z.string().email().optional().default(DEFAULT_SENDER_EMAIL),
  sheetName: z.string().min(1).optional().default(DEFAULT_SHEET_NAME),
  stageOnly: z.boolean().optional().default(false),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  startRow: z.number().int().min(2).max(20000).optional().default(DEFAULT_START_ROW),
});

type Candidate = z.infer<typeof candidateSchema>;
type SqlClient = postgres.Sql;
type TransactionSql = postgres.TransactionSql;

type PreparedRecord = {
  campaignId: string;
  companyId: string;
  contactId: string;
  messageId: string;
  senderAccountId: string;
  subject: string;
  body: string;
};

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json(
      { ok: false, error: "Missing database configuration" },
      { status: 500 },
    );
  }

  const config = getPastoralSheetsConfig();
  if (!isPastoralSheetsConfigured(config)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Falta configurar PASTORAL_CONTACT_SHEET_ID o PASTORAL_CONTACT_SHEET_RANGE.",
      },
      { status: 409 },
    );
  }

  const tokenResult = await getFreshGoogleAccessToken({
    senderEmail: parsed.data.senderEmail,
    sql,
  });
  if (!tokenResult.ok) {
    return NextResponse.json(
      { ok: false, error: tokenResult.error },
      { status: tokenResult.status },
    );
  }

  const campaignSender = await getCampaignSender({
    senderEmail: parsed.data.senderEmail,
    sql,
  });
  if (!campaignSender) {
    return NextResponse.json(
      {
        ok: false,
        error: `No encontré ${parsed.data.senderEmail} como remitente activo de Pastoral.`,
      },
      { status: 409 },
    );
  }

  const attachments = parsed.data.dryRun || parsed.data.stageOnly
    ? []
    : await getPastoralBenefitAttachments({ baseUrl: req.nextUrl.origin });

  const results = [];
  let nextRow = parsed.data.startRow;
  const initialSheetContacts = await readAllKnownSheetContacts({
    accessToken: tokenResult.accessToken,
    spreadsheetId: config.spreadsheetId,
  });

  if (!initialSheetContacts.ok) {
    return NextResponse.json(
      { ok: false, error: initialSheetContacts.error },
      { status: 409 },
    );
  }

  const knownSheetContacts = [...initialSheetContacts.contacts];

  for (const candidate of parsed.data.candidates) {
    const duplicate = findPastoralDuplicate({
      companyName: candidate.company,
      email: candidate.email,
      sheetContacts: knownSheetContacts,
    });

    if (duplicate) {
      results.push({
        company: candidate.company,
        email: candidate.email,
        ok: false,
        skipped: true,
        reason: `Duplicado en Sheets por ${duplicate.reason}: ${duplicate.contact.name || duplicate.contact.email}`,
        contactadoPor: duplicate.contact.contactedBy || null,
      });
      continue;
    }

    const contactName = candidate.contactName?.trim() || `Equipo de ${candidate.company}`;
    const subject = buildSubject();
    const body = buildInitialOutreachBody(candidate);

    if (parsed.data.dryRun) {
      results.push({
        company: candidate.company,
        email: candidate.email,
        ok: true,
        dryRun: true,
        subject,
        body,
      });
      knownSheetContacts.push(buildMemorySheetContact({ candidate, contactName }));
      continue;
    }

    const prepared = await prepareDatabaseRecords({
      body,
      campaignId: campaignSender.campaignId,
      candidate,
      contactName,
      senderAccountId: campaignSender.senderAccountId,
      scheduledFor: parsed.data.scheduledFor ?? null,
      subject,
      sql,
    });

    if (!prepared.ok) {
      results.push({
        company: candidate.company,
        email: candidate.email,
        ok: false,
        error: prepared.error,
      });
      continue;
    }

    if (parsed.data.stageOnly) {
      results.push({
        company: candidate.company,
        email: candidate.email,
        messageId: prepared.record.messageId,
        ok: true,
        scheduledFor: parsed.data.scheduledFor ?? null,
        staged: true,
      });
      knownSheetContacts.push(buildMemorySheetContact({ candidate, contactName }));
      continue;
    }

    const reservationStore = createPostgresPastoralReservationStore(sql);
    const reservation = await createPastoralLocalReservation(reservationStore, {
      campaignId: prepared.record.campaignId,
      companyId: prepared.record.companyId,
      contactEmail: candidate.email,
      contactId: prepared.record.contactId,
      contactName,
      messageId: prepared.record.messageId,
      senderEmail: parsed.data.senderEmail,
      sheetId: config.spreadsheetId,
      sheetRange: `${parsed.data.sheetName}!A:F`,
    });

    if (!reservation.ok) {
      await markMessageFailed({
        detail:
          reservation.reason === "local_email_conflict"
            ? `Reserva local duplicada por email: ${candidate.email}`
            : `Reserva local duplicada por dominio: ${candidate.email}`,
        messageId: prepared.record.messageId,
        sql,
      });
      results.push({
        company: candidate.company,
        email: candidate.email,
        ok: false,
        skipped: true,
        reason:
          reservation.reason === "local_email_conflict"
            ? "Reserva local duplicada por email"
            : "Reserva local duplicada por dominio",
      });
      continue;
    }

    const sheetWrite = await writeVerifiedSheetRow({
      accessToken: tokenResult.accessToken,
      candidate,
      contactName,
      rowStart: nextRow,
      sheetName: parsed.data.sheetName,
      spreadsheetId: config.spreadsheetId,
    });

    if (!sheetWrite.ok) {
      await reservationStore.markStatus(prepared.record.messageId, "failed", {
        error: sheetWrite.error,
        stage: "sheet_update",
      });
      await markMessageFailed({
        detail: sheetWrite.error,
        messageId: prepared.record.messageId,
        sql,
      });
      results.push({
        company: candidate.company,
        email: candidate.email,
        ok: false,
        error: sheetWrite.error,
      });
      continue;
    }

    nextRow = sheetWrite.nextRow;
    await reservationStore.markStatus(prepared.record.messageId, "verified", {
      sheet_row: sheetWrite.row,
      sheet_range: sheetWrite.range,
    });

    const gmailResult = await sendGmail({
      accessToken: tokenResult.accessToken,
      attachments,
      body: prepared.record.body,
      from: parsed.data.senderEmail,
      subject: prepared.record.subject,
      to: candidate.email,
    });

    if (!gmailResult.ok) {
      const sheetRollback = await clearSheetRow({
        accessToken: tokenResult.accessToken,
        range: sheetWrite.range,
        spreadsheetId: config.spreadsheetId,
      });
      const failureDetail = sheetRollback.ok
        ? `${gmailResult.error} Fila ${sheetWrite.range} limpiada porque Gmail no aceptó el envío.`
        : `${gmailResult.error} Además no pude limpiar ${sheetWrite.range}: ${sheetRollback.error}`;
      await reservationStore.markStatus(prepared.record.messageId, "failed", {
        error: failureDetail,
        stage: "gmail_send",
      });
      await markMessageFailed({
        detail: failureDetail,
        messageId: prepared.record.messageId,
        sql,
      });
      results.push({
        company: candidate.company,
        email: candidate.email,
        ok: false,
        error: failureDetail,
        sheetRow: sheetWrite.row,
      });
      continue;
    }

    await markMessageSent({
      gmailMessageId: gmailResult.gmailMessageId,
      gmailThreadId: gmailResult.gmailThreadId,
      messageId: prepared.record.messageId,
      prepared: prepared.record,
      sql,
    });
    await reservationStore.markStatus(prepared.record.messageId, "sent", {
      gmail_message_id: gmailResult.gmailMessageId,
      gmail_thread_id: gmailResult.gmailThreadId,
      sheet_row: sheetWrite.row,
    });
    knownSheetContacts.push(buildMemorySheetContact({ candidate, contactName }));

    results.push({
      company: candidate.company,
      email: candidate.email,
      ok: true,
      gmailMessageId: gmailResult.gmailMessageId,
      gmailThreadId: gmailResult.gmailThreadId,
      messageId: prepared.record.messageId,
      sheetRow: sheetWrite.row,
    });
  }

  const sent = results.filter(
    (result) => result.ok && !("dryRun" in result) && !("staged" in result),
  ).length;
  const skipped = results.filter((result) => "skipped" in result && result.skipped).length;
  const failed = results.filter((result) => !result.ok && !("skipped" in result)).length;

  return NextResponse.json({
    ok: failed === 0,
    dryRun: parsed.data.dryRun,
    stageOnly: parsed.data.stageOnly,
    sent,
    skipped,
    failed,
    results,
  });
}

function buildMemorySheetContact({
  candidate,
  contactName,
}: {
  candidate: Candidate;
  contactName: string;
}): PastoralSheetContact {
  return {
    comments: "",
    contactedBy: PASTORAL_SHEET_CONTACTED_BY,
    email: candidate.email,
    name: candidate.company || contactName,
    status: "Esperando respuesta",
  };
}

async function getCampaignSender({
  senderEmail,
  sql,
}: {
  senderEmail: string;
  sql: SqlClient;
}) {
  const rows = await sql`
    select
      c.id::text as campaign_id,
      sa.id::text as sender_account_id
    from campaigns c
    join campaign_sender_accounts csa on csa.campaign_id = c.id
    join sender_accounts sa on sa.id = csa.sender_account_id
    where c.slug = ${PASTORAL_CAMPAIGN_SLUG}
      and lower(sa.email::text) = ${senderEmail.toLowerCase()}
      and sa.status = 'active'
    order by csa.is_default desc, csa.priority asc
    limit 1
  `;

  return rows[0]
    ? {
        campaignId: String(rows[0].campaign_id),
        senderAccountId: String(rows[0].sender_account_id),
      }
    : null;
}

async function getFreshGoogleAccessToken({
  senderEmail,
  sql,
}: {
  senderEmail: string;
  sql: SqlClient;
}) {
  const tokenRows = await sql`
    select access_token, refresh_token, expires_at
    from gmail_tokens
    where lower(user_email::text) = ${senderEmail.toLowerCase()}
    limit 1
  `;

  if (!tokenRows[0]) {
    return {
      ok: false as const,
      error: `No hay token Gmail/Sheets para ${senderEmail}. Reconecta Gmail desde la app.`,
      status: 401,
    };
  }

  let accessToken = decryptToken(String(tokenRows[0].access_token));
  const refreshToken = decryptToken(String(tokenRows[0].refresh_token));

  if (new Date(tokenRows[0].expires_at) >= new Date()) {
    return { ok: true as const, accessToken };
  }

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed) {
    return {
      ok: false as const,
      error: "Token expirado y refresh falló. Reconecta Gmail desde la app.",
      status: 401,
    };
  }

  accessToken = refreshed.access_token;
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await sql`
    update gmail_tokens
    set access_token = ${encryptToken(accessToken)},
        expires_at = ${newExpiresAt},
        updated_at = now()
    where lower(user_email::text) = ${senderEmail.toLowerCase()}
  `;

  return { ok: true as const, accessToken };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") return null;
  return {
    access_token: data.access_token,
    expires_in: Number(data.expires_in ?? 3600),
  };
}

async function readAllKnownSheetContacts({
  accessToken,
  spreadsheetId,
}: {
  accessToken: string;
  spreadsheetId: string;
}) {
  try {
    const [primaryContacts, ...historicalSets] = await Promise.all([
      fetchPastoralSheetContactsFromApi({ accessToken }),
      ...HISTORICAL_SHEET_GIDS.map((gid) =>
        fetchLooseCsvContacts({ gid, spreadsheetId }).catch(() => []),
      ),
    ]);
    return {
      ok: true as const,
      contacts: [...primaryContacts, ...historicalSets.flat()],
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? `No pude leer Sheets fresco antes de enviar: ${error.message}`
          : "No pude leer Sheets fresco antes de enviar.",
    };
  }
}

async function fetchLooseCsvContacts({
  gid,
  spreadsheetId,
}: {
  gid: string;
  spreadsheetId: string;
}): Promise<PastoralSheetContact[]> {
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const parsed = Papa.parse<string[]>(await response.text(), {
    skipEmptyLines: true,
  });

  return parsed.data
    .map((row) => {
      const cells = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
      const email = cells.find((cell) => /\S+@\S+\.\S+/.test(cell)) ?? "";
      const emailIndex = email ? cells.indexOf(email) : -1;
      const name =
        cells.find((cell, index) => index !== emailIndex && !cell.includes("@")) ??
        "";
      return {
        comments: cells.join(" | "),
        contactedBy: cells.find((cell) => /jose|josé|miguel|olavarr/i.test(cell)) ?? "",
        email,
        name,
        status: "",
      };
    })
    .filter((contact) => contact.name || contact.email || contact.comments);
}

async function prepareDatabaseRecords({
  body,
  campaignId,
  candidate,
  contactName,
  senderAccountId,
  scheduledFor,
  subject,
  sql,
}: {
  body: string;
  campaignId: string;
  candidate: Candidate;
  contactName: string;
  senderAccountId: string;
  scheduledFor: string | null;
  subject: string;
  sql: SqlClient;
}): Promise<
  | { ok: true; record: PreparedRecord }
  | { ok: false; error: string }
> {
  try {
    const record = await sql.begin(async (tx: TransactionSql) => {
      const company = await upsertCompany({ candidate, tx });
      const contact = await upsertContact({
        candidate,
        companyId: company.id,
        contactName,
        tx,
      });

      await tx`
        insert into campaign_contacts (
          campaign_id,
          company_id,
          contact_id,
          fit_score,
          priority_score,
          status,
          selected_contact_reason,
          campaign_notes,
          future_notes,
          next_followup_at
        ) values (
          ${campaignId},
          ${company.id},
          ${contact.id},
          78,
          90,
          'approved_to_send',
          ${candidate.reason ?? "Contacto oficial validado para outreach Pastoral."},
          ${`Outreach Pastoral para ${pastoralZone.locality}, ${pastoralZone.commune}, Región de ${pastoralZone.region}.`},
          ${[
            candidate.source ? `Fuente: ${candidate.source}` : null,
            scheduledFor ? `Preparado para envío manual el ${scheduledFor}.` : null,
          ]
            .filter(Boolean)
            .join(" ") || null},
          ${scheduledFor}
        )
        on conflict (campaign_id, company_id, contact_id) do update
        set
          status = case
            when campaign_contacts.status in ('replied', 'closed_positive', 'closed_negative', 'do_not_contact')
              then campaign_contacts.status
            else 'approved_to_send'
          end,
          fit_score = greatest(campaign_contacts.fit_score, excluded.fit_score),
          priority_score = greatest(campaign_contacts.priority_score, excluded.priority_score),
          selected_contact_reason = excluded.selected_contact_reason,
          campaign_notes = concat_ws(E'\n', nullif(campaign_contacts.campaign_notes, ''), excluded.campaign_notes),
          future_notes = concat_ws(E'\n', nullif(campaign_contacts.future_notes, ''), excluded.future_notes),
          next_followup_at = coalesce(excluded.next_followup_at, campaign_contacts.next_followup_at),
          updated_at = now()
      `;

      const messageRows = await tx`
        insert into messages (
          campaign_id,
          company_id,
          contact_id,
          sender_account_id,
          kind,
          status,
          subject_draft,
          body_draft,
          subject_final,
          body_final,
          approved_at,
          future_note
        ) values (
          ${campaignId},
          ${company.id},
          ${contact.id},
          ${senderAccountId},
          'outbound_initial',
          'approved',
          ${subject},
          ${body},
          ${subject},
          ${body},
          now(),
          ${[
            `Outreach Pastoral batch. Fuente: ${candidate.source ?? "investigacion manual/web"}.`,
            scheduledFor ? `Preparado para envío manual el ${scheduledFor}.` : null,
          ]
            .filter(Boolean)
            .join(" ")}
        )
        returning id::text as id
      `;

      return {
        body,
        campaignId,
        companyId: company.id,
        contactId: contact.id,
        messageId: String(messageRows[0].id),
        senderAccountId,
        subject,
      } satisfies PreparedRecord;
    });

    return { ok: true, record };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No pude preparar registros en la base de datos.",
    };
  }
}

async function upsertCompany({
  candidate,
  tx,
}: {
  candidate: Candidate;
  tx: TransactionSql;
}) {
  const normalizedName = normalizeCompanyName(candidate.company);
  const domain = getCompanyDomain(candidate);

  const existingRows = domain
    ? await tx`
        select id::text as id
        from companies
        where normalized_name = ${normalizedName}
          or domain = ${domain}
        limit 1
      `
    : await tx`
        select id::text as id
        from companies
        where normalized_name = ${normalizedName}
        limit 1
      `;

  if (existingRows[0]) {
    await tx`
      update companies
      set
        canonical_name = coalesce(nullif(canonical_name, ''), ${candidate.company}),
        domain = coalesce(domain, ${domain}),
        website = coalesce(website, ${candidate.website ?? null}),
        industry = coalesce(industry, ${candidate.industry ?? null}),
        region = coalesce(region, ${candidate.region ?? pastoralZone.region}),
        global_notes = concat_ws(E'\n', nullif(global_notes, ''), ${candidate.reason ?? null}),
        updated_at = now()
      where id = ${existingRows[0].id}
    `;
    return { id: String(existingRows[0].id) };
  }

  const rows = await tx`
    insert into companies (
      canonical_name,
      normalized_name,
      domain,
      website,
      industry,
      region,
      description,
      global_notes,
      quality_rating,
      quality_notes
    ) values (
      ${candidate.company},
      ${normalizedName},
      ${domain},
      ${candidate.website ?? null},
      ${candidate.industry ?? null},
      ${candidate.region ?? pastoralZone.region},
      ${`Potencial colaborador para Trabajo País UC en ${pastoralZone.locality}, ${pastoralZone.commune}.`},
      ${candidate.reason ?? null},
      4,
      'Prioridad alta por encaje territorial o capacidad de aporte.'
    )
    returning id::text as id
  `;

  return { id: String(rows[0].id) };
}

async function upsertContact({
  candidate,
  companyId,
  contactName,
  tx,
}: {
  candidate: Candidate;
  companyId: string;
  contactName: string;
  tx: TransactionSql;
}) {
  const email = String(normalizeEmail(candidate.email));
  const rows = await tx`
    insert into contacts (
      company_id,
      full_name,
      normalized_name,
      role,
      category,
      email,
      source,
      confidence,
      verification_status,
      verified_at,
      is_decision_maker,
      global_notes
    ) values (
      ${companyId},
      ${contactName},
      ${normalizeCompanyName(contactName)},
      ${candidate.role ?? "Contacto oficial"},
      'Pastoral outreach',
      ${email},
      ${candidate.source ?? "investigacion_web"},
      0.82,
      'verified',
      now(),
      ${Boolean(candidate.contactName)},
      ${candidate.reason ?? null}
    )
    on conflict (email) do update
    set
      company_id = coalesce(contacts.company_id, excluded.company_id),
      full_name = case
        when contacts.full_name = contacts.email::text or contacts.full_name = split_part(contacts.email::text, '@', 1)
          then excluded.full_name
        else contacts.full_name
      end,
      normalized_name = case
        when contacts.full_name = contacts.email::text or contacts.full_name = split_part(contacts.email::text, '@', 1)
          then excluded.normalized_name
        else contacts.normalized_name
      end,
      role = coalesce(nullif(contacts.role, ''), excluded.role),
      category = coalesce(nullif(contacts.category, ''), excluded.category),
      source = concat_ws(', ', nullif(contacts.source, ''), excluded.source),
      confidence = greatest(contacts.confidence, excluded.confidence),
      verification_status = 'verified',
      verified_at = coalesce(contacts.verified_at, now()),
      is_decision_maker = contacts.is_decision_maker or excluded.is_decision_maker,
      global_notes = concat_ws(E'\n', nullif(contacts.global_notes, ''), excluded.global_notes),
      updated_at = now()
    returning id::text as id
  `;

  return { id: String(rows[0].id) };
}

async function writeVerifiedSheetRow({
  accessToken,
  candidate,
  contactName,
  rowStart,
  sheetName,
  spreadsheetId,
}: {
  accessToken: string;
  candidate: Candidate;
  contactName: string;
  rowStart: number;
  sheetName: string;
  spreadsheetId: string;
}) {
  const row = buildPastoralSheetRow({
    comments: "",
    contactedBy: PASTORAL_SHEET_CONTACTED_BY,
    email: candidate.email,
    name: candidate.company || contactName,
    status: "Esperando respuesta",
  });

  const emptyRow = await findNextEmptyRow({
    accessToken,
    rowStart,
    sheetName,
    spreadsheetId,
  });
  if (!emptyRow.ok) return emptyRow;

  const range = `${sheetName}!A${emptyRow.row}:F${emptyRow.row}`;
  const response = await fetch(
    buildValuesUrl(spreadsheetId, range, { valueInputOption: "USER_ENTERED" }),
    {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorDimension: "ROWS",
      range,
      values: [row],
    }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false as const,
      error: readGoogleError(data) || `No pude escribir Sheets (${response.status}).`,
    };
  }

  const verify = await readSheetRange({ accessToken, range, spreadsheetId });
  if (!verify.ok) {
    return {
      ok: false as const,
      error: `Escribí ${range}, pero no pude verificarlo: ${verify.error}`,
    };
  }

  const firstRow = verify.values[0] ?? [];
  const verifiedEmail = String(firstRow[1] ?? "").trim().toLowerCase();
  const verifiedStatus = String(firstRow[3] ?? "").trim();
  const verifiedOwner = String(firstRow[2] ?? "").trim();
  if (
    verifiedEmail !== candidate.email.trim().toLowerCase() ||
    verifiedOwner !== PASTORAL_SHEET_CONTACTED_BY ||
    verifiedStatus !== "Esperando respuesta"
  ) {
    return {
      ok: false as const,
      error: `Escribí ${range}, pero la relectura no coincide. No envío Gmail.`,
    };
  }

  return {
    ok: true as const,
    nextRow: emptyRow.row + 1,
    range,
    row: emptyRow.row,
  };
}

async function findNextEmptyRow({
  accessToken,
  rowStart,
  sheetName,
  spreadsheetId,
}: {
  accessToken: string;
  rowStart: number;
  sheetName: string;
  spreadsheetId: string;
}) {
  const scanEnd = Math.min(rowStart + 250, 20000);
  const range = `${sheetName}!A${rowStart}:F${scanEnd}`;
  const read = await readSheetRange({ accessToken, range, spreadsheetId });
  if (!read.ok) return read;

  for (let offset = 0; offset <= scanEnd - rowStart; offset += 1) {
    const row = read.values[offset] ?? [];
    if (row.every((cell) => String(cell ?? "").trim() === "")) {
      return { ok: true as const, row: rowStart + offset };
    }
  }

  return {
    ok: false as const,
    error: `No encontré filas vacías entre ${rowStart} y ${scanEnd}.`,
  };
}

async function readSheetRange({
  accessToken,
  range,
  spreadsheetId,
}: {
  accessToken: string;
  range: string;
  spreadsheetId: string;
}) {
  const response = await fetch(buildValuesUrl(spreadsheetId, range), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false as const,
      error: readGoogleError(data) || `No pude leer ${range} (${response.status}).`,
    };
  }
  return {
    ok: true as const,
    values: Array.isArray(data.values) ? (data.values as unknown[][]) : [],
  };
}

async function sendGmail({
  accessToken,
  attachments,
  body,
  from,
  subject,
  to,
}: {
  accessToken: string;
  attachments: Awaited<ReturnType<typeof getPastoralBenefitAttachments>>;
  body: string;
  from: string;
  subject: string;
  to: string;
}) {
  const encodedMessage = encodeRawMessage(
    buildMimeMessage({
      attachments,
      body,
      from,
      subject,
      to,
    }),
  );
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGmailSendBody({ raw: encodedMessage })),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false as const,
      error: readGoogleError(data) || `Gmail API error (${response.status}).`,
    };
  }

  return {
    ok: true as const,
    gmailMessageId: typeof data.id === "string" ? data.id : null,
    gmailThreadId: typeof data.threadId === "string" ? data.threadId : null,
  };
}

async function clearSheetRow({
  accessToken,
  range,
  spreadsheetId,
}: {
  accessToken: string;
  range: string;
  spreadsheetId: string;
}) {
  const response = await fetch(`${buildValuesUrl(spreadsheetId, range)}:clear`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false as const,
      error: readGoogleError(data) || `No pude limpiar ${range} (${response.status}).`,
    };
  }
  return { ok: true as const };
}

async function markMessageFailed({
  detail,
  messageId,
  sql,
}: {
  detail: string;
  messageId: string;
  sql: SqlClient;
}) {
  await sql`
    update messages
    set
      status = 'failed',
      future_note = concat_ws(E'\n', nullif(future_note, ''), ${detail}),
      updated_at = now()
    where id = ${messageId}
  `;
}

async function markMessageSent({
  gmailMessageId,
  gmailThreadId,
  messageId,
  prepared,
  sql,
}: {
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  messageId: string;
  prepared: PreparedRecord;
  sql: SqlClient;
}) {
  await sql.begin(async (tx: TransactionSql) => {
    const updated = await tx`
      update messages
      set
        status = 'sent',
        sent_at = now(),
        gmail_message_id = ${gmailMessageId},
        gmail_thread_id = ${gmailThreadId},
        future_note = concat_ws(E'\n', nullif(future_note, ''), 'Enviado via Gmail API por batch Pastoral.'),
        updated_at = now()
      where id = ${messageId}
        and status in ('approved', 'failed')
      returning id, thread_id
    `;

    if (!updated[0]) return;

    const threadRows = await tx`
      insert into threads (
        campaign_id,
        company_id,
        contact_id,
        sender_account_id,
        gmail_thread_id,
        subject,
        status,
        last_message_at
      ) values (
        ${prepared.campaignId},
        ${prepared.companyId},
        ${prepared.contactId},
        ${prepared.senderAccountId},
        ${gmailThreadId},
        ${prepared.subject},
        'open',
        now()
      )
      returning id::text as id
    `;

    await tx`
      update messages
      set thread_id = ${threadRows[0].id}
      where id = ${messageId}
    `;

    await tx`
      update campaign_contacts
      set
        status = 'sent',
        last_contacted_at = now(),
        next_followup_at = (now() + interval '6 days'),
        updated_at = now()
      where campaign_id = ${prepared.campaignId}
        and company_id = ${prepared.companyId}
        and contact_id = ${prepared.contactId}
    `;
  });
}

function buildSubject() {
  return "Trabajo País UC 2026 | posible colaboración en Ninhue";
}

function buildInitialOutreachBody(candidate: Candidate) {
  return buildPastoralInitialOutreachBody(candidate);
}

function getCompanyDomain(candidate: Candidate) {
  const websiteDomain = extractDomain(candidate.website);
  if (websiteDomain && !COMMON_EMAIL_DOMAINS.has(websiteDomain)) return websiteDomain;

  const emailDomain = extractDomain(candidate.email);
  if (emailDomain && !COMMON_EMAIL_DOMAINS.has(emailDomain)) return emailDomain;

  return null;
}

function buildValuesUrl(
  spreadsheetId: string,
  range: string,
  params: Record<string, string> = {},
) {
  const query = new URLSearchParams(params).toString();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  return query ? `${base}?${query}` : base;
}

function readGoogleError(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const error = (data as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

const COMMON_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.cl",
  "hotmail.com",
  "icloud.com",
  "live.cl",
  "live.com",
  "me.com",
  "outlook.cl",
  "outlook.com",
  "uc.cl",
  "yahoo.com",
  "yahoo.es",
]);
