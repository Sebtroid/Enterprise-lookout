import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";
import {
  buildGmailReplySearchQuery,
  matchInboundReply,
  prepareInboundReplyRecord,
  shouldIngestReply,
  type GmailReplyCandidate,
  type SentMessageMatchInput,
} from "@/lib/prospecting/reply-sync";
import { getPostgresClient } from "@/lib/supabase/postgres";

const syncBodySchema = z.object({
  scope: z.string().default("all"),
  days: z.number().int().min(1).max(365).default(90),
  limit: z.number().int().min(1).max(200).default(80),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAllowedUser({ allowDemoUser: true });
    const sql = getPostgresClient();
    if (!user || !sql) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = syncBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid sync request" },
        { status: 400 },
      );
    }

    const { days, limit, scope } = parsed.data;
    const tokenRows = await sql`
      select user_email, access_token, refresh_token, expires_at
      from gmail_tokens
      order by updated_at desc
    `;

    let inserted = 0;
    let matched = 0;
    let skipped = 0;
    let scanned = 0;

    for (const token of tokenRows) {
      const accessToken = await getValidAccessToken({
        accessToken: token.access_token,
        expiresAt: token.expires_at,
        refreshToken: token.refresh_token,
        sql,
        userEmail: String(token.user_email),
      });

      if (!accessToken) {
        skipped += 1;
        continue;
      }

      const sentMessages = await loadSentMessages({
        days,
        limit,
        scope,
        senderEmail: String(token.user_email),
        sql,
      });
      const existingGmailMessageIds = await loadExistingGmailMessageIds(sql);

      for (const sentMessage of sentMessages) {
        const candidates = await fetchReplyCandidatesForSentMessage({
          accessToken,
          sentMessage,
        });
        scanned += candidates.length;

        for (const candidate of candidates) {
          const match = matchInboundReply(candidate, sentMessages);
          if (!match) {
            skipped += 1;
            continue;
          }

          if (
            !shouldIngestReply(candidate, {
              existingGmailMessageIds,
              senderEmail: match.message.senderEmail,
            })
          ) {
            skipped += 1;
            continue;
          }

          matched += 1;
          const result = await insertInboundReply({ candidate, match, sql });
          if (result === "inserted") {
            inserted += 1;
            existingGmailMessageIds.add(candidate.gmailMessageId);
          } else {
            skipped += 1;
          }
        }
      }
    }

    await sql`
      insert into automation_runs (
        job_name,
        status,
        finished_at,
        input_summary,
        output_summary
      ) values (
        'gmail-sync-replies',
        'succeeded',
        now(),
        ${sql.json({ scope, days, limit })},
        ${sql.json({ scanned, matched, inserted, skipped })}
      )
    `;

    return NextResponse.json({
      ok: true,
      scanned,
      matched,
      inserted,
      skipped,
    });
  } catch (error) {
    console.error("Gmail reply sync error:", error);
    return NextResponse.json(
      { ok: false, error: "Server error syncing Gmail replies" },
      { status: 500 },
    );
  }
}

async function getValidAccessToken({
  accessToken,
  expiresAt,
  refreshToken,
  sql,
  userEmail,
}: {
  accessToken: string;
  expiresAt: Date | string;
  refreshToken: string;
  sql: NonNullable<ReturnType<typeof getPostgresClient>>;
  userEmail: string;
}) {
  let token = decryptToken(accessToken);
  const refresh = decryptToken(refreshToken);

  if (new Date(expiresAt) >= new Date()) return token;

  const refreshed = await refreshAccessToken(refresh);
  if (!refreshed) return null;

  token = refreshed.access_token;
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await sql`
    update gmail_tokens
    set access_token = ${encryptToken(token)},
        expires_at = ${newExpiresAt},
        updated_at = now()
    where user_email = ${userEmail}
  `;

  return token;
}

async function loadSentMessages({
  days,
  limit,
  scope,
  senderEmail,
  sql,
}: {
  days: number;
  limit: number;
  scope: string;
  senderEmail: string;
  sql: NonNullable<ReturnType<typeof getPostgresClient>>;
}) {
  const scopeFilter = scope === "all" ? sql`` : sql`and c.slug = ${scope}`;
  const rows = await sql`
    select
      m.id::text as id,
      m.campaign_id::text as campaign_id,
      m.company_id::text as company_id,
      m.contact_id::text as contact_id,
      ct.email::text as contact_email,
      ct.full_name as contact_name,
      m.sender_account_id::text as sender_id,
      sa.email::text as sender_email,
      coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
      coalesce(m.sent_at, m.created_at)::text as sent_at,
      m.gmail_thread_id
    from messages m
    join campaigns c on c.id = m.campaign_id
    join sender_accounts sa on sa.id = m.sender_account_id
    left join contacts ct on ct.id = m.contact_id
    where m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
      and m.status = 'sent'
      and sa.account_type = 'gmail'
      and sa.email = ${senderEmail}
      and ct.email is not null
      and coalesce(m.sent_at, m.created_at) >= now() - (${days}::int * interval '1 day')
      ${scopeFilter}
    order by coalesce(m.sent_at, m.created_at) desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    companyId: String(row.company_id),
    contactId: String(row.contact_id),
    contactEmail: String(row.contact_email),
    contactName: String(row.contact_name ?? ""),
    senderId: String(row.sender_id),
    senderEmail: String(row.sender_email),
    subject: String(row.subject),
    sentAt: String(row.sent_at),
    gmailThreadId: row.gmail_thread_id ? String(row.gmail_thread_id) : null,
  })) satisfies SentMessageMatchInput[];
}

async function loadExistingGmailMessageIds(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
) {
  const rows = await sql`
    select gmail_message_id
    from messages
    where gmail_message_id is not null
  `;

  return new Set(rows.map((row) => String(row.gmail_message_id)));
}

async function fetchReplyCandidatesForSentMessage({
  accessToken,
  sentMessage,
}: {
  accessToken: string;
  sentMessage: SentMessageMatchInput;
}) {
  if (sentMessage.gmailThreadId) {
    const threadResponse = await gmailFetch(
      accessToken,
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${sentMessage.gmailThreadId}?format=full`,
    );
    const messages = Array.isArray(threadResponse.messages)
      ? threadResponse.messages
      : [];
    return messages.map(normalizeGmailMessage).filter(isReplyCandidate);
  }

  const searchResponse = await gmailFetch(
    accessToken,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(buildGmailReplySearchQuery(sentMessage))}`,
  );
  const ids = Array.isArray(searchResponse.messages)
    ? searchResponse.messages.map((message: { id?: string }) => message.id).filter(Boolean)
    : [];
  const messages = await Promise.all(
    ids.map((id: string) =>
      gmailFetch(
        accessToken,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      ),
    ),
  );

  return messages.map(normalizeGmailMessage).filter(isReplyCandidate);
}

async function gmailFetch(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Gmail API error");
  }
  return data;
}

function normalizeGmailMessage(message: Record<string, unknown>): GmailReplyCandidate {
  const payload = message.payload as
    | { headers?: Array<{ name?: string; value?: string }>; body?: { data?: string }; parts?: unknown[] }
    | undefined;
  const headers = payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    gmailMessageId: String(message.id ?? ""),
    gmailThreadId: message.threadId ? String(message.threadId) : null,
    fromEmail: extractEmail(header("From")),
    toEmail: extractEmail(header("To")),
    subject: header("Subject"),
    body: extractPlainText(payload) || String(message.snippet ?? ""),
    receivedAt: header("Date")
      ? new Date(header("Date")).toISOString()
      : new Date(Number(message.internalDate ?? Date.now())).toISOString(),
  };
}

function extractPlainText(
  payload:
    | { mimeType?: string; body?: { data?: string }; parts?: unknown[] }
    | undefined,
): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  for (const part of payload.parts ?? []) {
    const text = extractPlainText(
      part as { mimeType?: string; body?: { data?: string }; parts?: unknown[] },
    );
    if (text) return text;
  }

  return "";
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8").trim();
}

function isReplyCandidate(candidate: GmailReplyCandidate) {
  return Boolean(
    candidate.gmailMessageId &&
      candidate.fromEmail &&
      candidate.subject &&
      candidate.body,
  );
}

async function insertInboundReply({
  candidate,
  match,
  sql,
}: {
  candidate: GmailReplyCandidate;
  match: NonNullable<ReturnType<typeof matchInboundReply>>;
  sql: NonNullable<ReturnType<typeof getPostgresClient>>;
}) {
  const record = prepareInboundReplyRecord(candidate, match.message);

  return sql.begin(async (tx) => {
    const thread = await getOrCreateThread({ record, sentMessage: match.message, tx });
    const inserted = await tx`
      insert into messages (
        thread_id,
        campaign_id,
        company_id,
        contact_id,
        sender_account_id,
        kind,
        status,
        subject_draft,
        body_draft,
        body_final,
        gmail_message_id,
        gmail_thread_id,
        reply_classification,
        future_note,
        received_at
      ) values (
        ${thread.id},
        ${record.campaignId},
        ${record.companyId},
        ${record.contactId},
        ${record.senderId},
        'inbound_reply',
        'needs_review',
        ${record.subject},
        ${record.body},
        ${record.draftResponse},
        ${record.gmailMessageId},
        ${record.gmailThreadId},
        ${record.classification},
        ${record.futureNote},
        ${record.receivedAt}
      )
      on conflict do nothing
      returning id
    `;

    if (!inserted[0]) return "duplicate" as const;

    await tx`
      update campaign_contacts
      set
        status = 'replied',
        future_notes = concat_ws(E'\n', nullif(future_notes, ''), ${record.futureNote}),
        updated_at = now()
      where campaign_id = ${record.campaignId}
        and company_id = ${record.companyId}
        and (contact_id = ${record.contactId} or contact_id is null)
    `;

    await tx`
      update threads
      set
        gmail_thread_id = coalesce(gmail_thread_id, ${record.gmailThreadId}),
        status = 'open',
        last_message_at = ${record.receivedAt}
      where id = ${thread.id}
    `;

    return "inserted" as const;
  });
}

async function getOrCreateThread({
  record,
  sentMessage,
  tx,
}: {
  record: ReturnType<typeof prepareInboundReplyRecord>;
  sentMessage: SentMessageMatchInput;
  // postgres.js transaction tags have helper overloads that are stricter than
  // this route needs; we only use the tagged-template query surface here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
}) {
  if (record.gmailThreadId) {
    const byGmailThread = await tx`
      select id
      from threads
      where gmail_thread_id = ${record.gmailThreadId}
        and campaign_id = ${record.campaignId}
      order by created_at desc
      limit 1
    `;

    if (byGmailThread[0]) return byGmailThread[0];
  }

  const byMessageContext = await tx`
    select id
    from threads
    where campaign_id = ${record.campaignId}
      and company_id = ${record.companyId}
      and contact_id = ${record.contactId}
      and sender_account_id = ${record.senderId}
    order by last_message_at desc nulls last, created_at desc
    limit 1
  `;

  if (byMessageContext[0]) return byMessageContext[0];

  const inserted = await tx`
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
      ${record.campaignId},
      ${record.companyId},
      ${record.contactId},
      ${record.senderId},
      ${record.gmailThreadId},
      ${sentMessage.subject},
      'open',
      ${record.receivedAt}
    )
    returning id
  `;

  return inserted[0];
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
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
  const data = await response.json();
  if (!response.ok || data.error) return null;
  return { access_token: data.access_token, expires_in: data.expires_in };
}
