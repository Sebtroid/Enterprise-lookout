import { NextRequest, NextResponse } from "next/server";

import { sendAgentEvent } from "@/lib/agent/events";
import { getAllowedUser } from "@/lib/auth/request";
import {
  buildGmailSendBody,
  buildMimeMessage,
  encodeRawMessage,
} from "@/lib/gmail/mime";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";
import { PASTORAL_CAMPAIGN_SLUG } from "@/lib/pastoral/config";
import {
  buildPastoralFollowupDraft,
  evaluatePastoralFollowupEligibility,
  isPastoralFollowupWindow,
} from "@/lib/pastoral/followups";
import {
  fetchPastoralSheetContactsFromApi,
  verifyPastoralSheetContact,
} from "@/lib/pastoral/google-sheets";
import type { PastoralSheetContact } from "@/lib/pastoral/sheet";
import { getPostgresClient } from "@/lib/supabase/postgres";

export const dynamic = "force-dynamic";

type CandidateRow = {
  body: string;
  campaign_id: string;
  company_do_not_contact: boolean;
  company_id: string;
  company_name: string;
  contact_do_not_contact: boolean;
  contact_email: string;
  contact_id: string;
  contact_name: string;
  contact_verification_status: string;
  daily_limit: number;
  gmail_thread_id: string | null;
  has_bounce: boolean;
  has_existing_followup: boolean;
  has_reply: boolean;
  initial_message_id: string;
  sender_account_id: string;
  sender_email: string;
  sender_sent_today: number;
  sent_at: string;
  subject: string;
  thread_id: string | null;
  token_access: string;
  token_expires_at: string;
  token_refresh: string;
};

export async function GET(req: NextRequest) {
  return runPastoralFollowups(req);
}

export async function POST(req: NextRequest) {
  return runPastoralFollowups(req);
}

async function runPastoralFollowups(req: NextRequest) {
  const authResult = await authorize(req);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: 401 });
  }

  const now = new Date();
  if (!isPastoralFollowupWindow(now)) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: true,
      reason: "Fuera de ventana segura: lunes a miércoles, 9:00-12:00 Chile.",
    });
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json(
      { ok: false, error: "Falta SUPABASE_DB_URL." },
      { status: 500 },
    );
  }

  const rows = await sql<CandidateRow[]>`
    select
      initial.id::text as initial_message_id,
      initial.campaign_id::text as campaign_id,
      initial.company_id::text as company_id,
      initial.contact_id::text as contact_id,
      initial.sender_account_id::text as sender_account_id,
      initial.thread_id::text as thread_id,
      coalesce(initial.gmail_thread_id, t.gmail_thread_id) as gmail_thread_id,
      co.canonical_name as company_name,
      coalesce(co.do_not_contact, false) as company_do_not_contact,
      ct.full_name as contact_name,
      ct.email::text as contact_email,
      coalesce(ct.do_not_contact, false) as contact_do_not_contact,
      ct.verification_status::text as contact_verification_status,
      sa.email::text as sender_email,
      coalesce(initial.subject_final, initial.subject_draft, '(sin asunto)') as subject,
      coalesce(initial.sent_at, initial.created_at)::text as sent_at,
      gt.access_token as token_access,
      gt.refresh_token as token_refresh,
      gt.expires_at::text as token_expires_at,
      coalesce(sender_counts.sent_today, 0)::int as sender_sent_today,
      least(sa.daily_limit, csa.campaign_daily_limit)::int as daily_limit,
      exists (
        select 1
        from messages inbound
        where inbound.campaign_id = initial.campaign_id
          and inbound.company_id = initial.company_id
          and inbound.kind = 'inbound_reply'
          and inbound.status in ('needs_review', 'approved', 'sent')
          and coalesce(inbound.received_at, inbound.created_at) > coalesce(initial.sent_at, initial.created_at)
      ) as has_reply,
      exists (
        select 1
        from messages bounce
        where bounce.campaign_id = initial.campaign_id
          and bounce.company_id = initial.company_id
          and bounce.kind = 'inbound_reply'
          and bounce.reply_classification = 'bounced'
          and coalesce(bounce.received_at, bounce.created_at) > coalesce(initial.sent_at, initial.created_at)
      ) as has_bounce,
      exists (
        select 1
        from messages followup
        where followup.campaign_id = initial.campaign_id
          and followup.company_id = initial.company_id
          and followup.kind = 'outbound_followup'
          and followup.status in ('needs_review', 'approved', 'sent')
          and followup.created_at > coalesce(initial.sent_at, initial.created_at)
      ) as has_existing_followup,
      ''::text as body
    from messages initial
    join campaigns c on c.id = initial.campaign_id
    join companies co on co.id = initial.company_id
    join contacts ct on ct.id = initial.contact_id
    join sender_accounts sa on sa.id = initial.sender_account_id
    join campaign_sender_accounts csa
      on csa.campaign_id = initial.campaign_id
      and csa.sender_account_id = initial.sender_account_id
    join gmail_tokens gt on gt.user_email = sa.email
    left join threads t on t.id = initial.thread_id
    left join lateral (
      select count(*)::int as sent_today
      from messages sent
      where sent.sender_account_id = sa.id
        and sent.status = 'sent'
        and sent.sent_at::date = current_date
    ) sender_counts on true
    where c.slug = ${PASTORAL_CAMPAIGN_SLUG}
      and initial.kind = 'outbound_initial'
      and initial.status = 'sent'
      and coalesce(initial.sent_at, initial.created_at) <= now() - interval '5 days'
    order by coalesce(initial.sent_at, initial.created_at) asc
    limit 40
  `;

  const sentTodayBySender = new Map<string, number>();
  const sheetContactsBySender = new Map<
    string,
    { contacts: PastoralSheetContact[]; error: string | null }
  >();
  const results = [];

  for (const row of rows) {
    const alreadySentToday =
      sentTodayBySender.get(row.sender_email) ?? Number(row.sender_sent_today);

    const accessToken = await getValidAccessToken({
      accessToken: row.token_access,
      expiresAt: row.token_expires_at,
      refreshToken: row.token_refresh,
      sql,
      userEmail: row.sender_email,
    });

    if (!accessToken) {
      results.push({
        company: row.company_name,
        ok: false,
        reason:
          "Google OAuth expiró o no tiene refresh válido; reconecta Google antes de follow-ups.",
      });
      continue;
    }

    let sheetContacts = sheetContactsBySender.get(row.sender_email);
    if (!sheetContacts) {
      sheetContacts = await fetchPastoralSheetContactsFromApi({
        accessToken,
      })
        .then((contacts) => ({ contacts, error: null }))
        .catch((error: Error) => ({
          contacts: [],
          error:
            error instanceof Error
              ? error.message
              : "No pude leer Sheets con la cuenta Google del remitente.",
        }));
      sheetContactsBySender.set(row.sender_email, sheetContacts);
    }

    if (sheetContacts.error) {
      results.push({
        company: row.company_name,
        ok: false,
        reason: `Bloqueado por Sheets OAuth: ${sheetContacts.error}`,
      });
      continue;
    }

    const registeredInSheets = verifyPastoralSheetContact({
      contacts: sheetContacts.contacts,
      email: row.contact_email,
      name: row.company_name,
    });
    const eligibility = evaluatePastoralFollowupEligibility(
      {
        contactDoNotContact: row.contact_do_not_contact,
        gmailConnected: true,
        hasBounce: row.has_bounce || row.contact_verification_status === "bounced",
        hasReply: row.has_reply || row.has_existing_followup,
        kind: "outbound_initial",
        senderDailyLimit: Number(row.daily_limit),
        senderSentToday: alreadySentToday,
        sentAt: row.sent_at,
        sheetRegistered: registeredInSheets,
        status: "sent",
      },
      now,
    );

    if (!eligibility.eligible) {
      results.push({
        company: row.company_name,
        ok: false,
        reason: eligibility.reason,
      });
      continue;
    }

    const draftBody = buildPastoralFollowupDraft({
      companyName: row.company_name,
      contactName: row.contact_name,
    });
    const sendResult = await createAndSendFollowup({
      accessToken,
      body: draftBody,
      row,
      sql,
    });

    if (sendResult.ok) {
      sentTodayBySender.set(row.sender_email, alreadySentToday + 1);
    }

    results.push({
      company: row.company_name,
      ok: sendResult.ok,
      reason: sendResult.ok ? "sent" : sendResult.error,
    });
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((result) => result.ok).length,
    checked: rows.length,
    results,
  });
}

async function createAndSendFollowup({
  accessToken,
  body,
  row,
  sql,
}: {
  accessToken: string;
  body: string;
  row: CandidateRow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any;
}) {
  const inserted = await sql`
    insert into messages (
      thread_id,
      campaign_id,
      company_id,
      contact_id,
      sender_account_id,
      kind,
      status,
      subject_draft,
      subject_final,
      body_draft,
      body_final,
      gmail_thread_id,
      approved_at,
      future_note
    ) values (
      ${row.thread_id},
      ${row.campaign_id},
      ${row.company_id},
      ${row.contact_id},
      ${row.sender_account_id},
      'outbound_followup',
      'approved',
      ${row.subject},
      ${row.subject},
      ${body},
      ${body},
      ${row.gmail_thread_id},
      now(),
      ${`Follow-up automático Pastoral creado tras ${row.initial_message_id}.`}
    )
    returning id::text as id
  `;
  const messageId = inserted[0]?.id ? String(inserted[0].id) : null;
  if (!messageId) {
    return { ok: false as const, error: "No pude crear el follow-up." };
  }

  const encodedMessage = encodeRawMessage(
    buildMimeMessage({
      body,
      from: row.sender_email,
      subject: row.subject,
      to: row.contact_email,
    }),
  );
  const sendResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildGmailSendBody({
          raw: encodedMessage,
          threadId: row.gmail_thread_id,
        }),
      ),
    },
  );
  const sendResult = await sendResponse.json().catch(() => ({}));

  if (!sendResponse.ok) {
    await sql`
      update messages
      set
        status = 'failed',
        future_note = concat_ws(E'\n', nullif(future_note, ''), ${sendResult.error?.message ?? "Gmail API error"}::text),
        updated_at = now()
      where id = ${messageId}
    `;
    return {
      ok: false as const,
      error: sendResult.error?.message ?? "Gmail API error",
    };
  }

  await sql.begin(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ) => {
    await tx`
      update messages
      set
        status = 'sent',
        sent_at = now(),
        gmail_message_id = ${sendResult.id ?? null},
        gmail_thread_id = coalesce(${sendResult.threadId ?? null}, gmail_thread_id),
        updated_at = now()
      where id = ${messageId}
    `;

    if (row.thread_id) {
      await tx`
        update threads
        set
          gmail_thread_id = coalesce(${sendResult.threadId ?? row.gmail_thread_id}, gmail_thread_id),
          status = 'open',
          last_message_at = now()
        where id = ${row.thread_id}
      `;
    }

    await tx`
      update campaign_contacts
      set
        status = 'sent',
        last_contacted_at = now(),
        updated_at = now()
      where campaign_id = ${row.campaign_id}
        and company_id = ${row.company_id}
        and (contact_id = ${row.contact_id} or contact_id is null)
    `;
  });

  await sendAgentEvent({
    event: "mail_sent",
    campaignId: row.campaign_id,
    companyId: row.company_id,
    contactId: row.contact_id,
    messageId,
    data: {
      automated_followup: true,
      gmail_message_id: sendResult.id ?? null,
      gmail_thread_id: sendResult.threadId ?? row.gmail_thread_id,
      original_message_id: row.initial_message_id,
      recipient_email: row.contact_email,
      sender_email: row.sender_email,
      subject: row.subject,
    },
    priority: "normal",
    source: "pastoral_auto_followup",
  });

  return { ok: true as const };
}

async function authorize(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const expected = `Bearer ${cronSecret}`;
    return req.headers.get("authorization") === expected
      ? { ok: true as const }
      : { ok: false as const, error: "Unauthorized cron request." };
  }

  const user = await getAllowedUser({ allowDemoUser: true, request: req });
  return user
    ? { ok: true as const }
    : { ok: false as const, error: "Unauthorized" };
}

async function getValidAccessToken({
  accessToken,
  expiresAt,
  refreshToken,
  sql,
  userEmail,
}: {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any;
  userEmail: string;
}) {
  let token = decryptToken(accessToken);
  const decryptedRefreshToken = decryptToken(refreshToken);

  if (new Date(expiresAt) >= new Date()) return token;

  const refreshed = await refreshAccessToken(decryptedRefreshToken);
  if (!refreshed) return null;

  token = refreshed.access_token;
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await sql`
    update gmail_tokens
    set
      access_token = ${encryptToken(token)},
      expires_at = ${newExpiresAt},
      updated_at = now()
    where user_email = ${userEmail}
  `;

  return token;
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return null;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (data.error) return null;
    return { access_token: data.access_token, expires_in: data.expires_in };
  } catch {
    return null;
  }
}
