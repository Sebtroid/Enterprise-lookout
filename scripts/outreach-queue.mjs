import fs from "node:fs";
import postgres from "postgres";

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const sql = postgres(getDatabaseUrl(), {
  ssl: "require",
  prepare: false,
  max: 1,
});

try {
  if (command === "approved") {
    await listApproved();
  } else if (command === "mark-sent") {
    await markSent();
  } else if (command === "mark-failed") {
    await markFailed();
  } else {
    usage();
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}

async function listApproved() {
  const campaign = args.campaign ?? null;
  const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 40);

  const rows = await sql`
    select
      m.id::text as message_id,
      c.slug as campaign_slug,
      c.name as campaign_name,
      co.id::text as company_id,
      co.canonical_name as company_name,
      ct.id::text as contact_id,
      ct.full_name as contact_name,
      ct.email::text as to_email,
      sa.id::text as sender_account_id,
      sa.email::text as sender_email,
      sa.display_name as sender_display_name,
      sa.account_type as sender_account_type,
      coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
      coalesce(m.body_final, m.body_draft, '') as body,
      coalesce(cc.priority_score, 0)::int as priority_score,
      coalesce(cc.fit_score, 0)::int as fit_score,
      coalesce(sender_counts.sent_today, 0)::int as sender_sent_today,
      least(sa.daily_limit, csa.campaign_daily_limit)::int as effective_daily_limit
    from messages m
    join campaigns c on c.id = m.campaign_id
    join sender_accounts sa on sa.id = m.sender_account_id
    join campaign_sender_accounts csa
      on csa.campaign_id = m.campaign_id
      and csa.sender_account_id = m.sender_account_id
    left join companies co on co.id = m.company_id
    left join contacts ct on ct.id = m.contact_id
    left join campaign_contacts cc
      on cc.campaign_id = m.campaign_id
      and cc.company_id = m.company_id
      and (cc.contact_id = m.contact_id or cc.contact_id is null)
    left join lateral (
      select count(*)::int as sent_today
      from messages sent
      where sent.sender_account_id = sa.id
        and sent.status = 'sent'
        and sent.sent_at::date = current_date
    ) sender_counts on true
    where m.status = 'approved'
      and m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
      and sa.status = 'active'
      and ct.email is not null
      and coalesce(co.do_not_contact, false) = false
      and coalesce(ct.do_not_contact, false) = false
      and coalesce(sender_counts.sent_today, 0) < least(sa.daily_limit, csa.campaign_daily_limit)
      and (${campaign}::text is null or c.slug = ${campaign})
    order by
      csa.priority asc,
      coalesce(cc.priority_score, 0) desc,
      coalesce(cc.fit_score, 0) desc,
      m.approved_at asc nulls last,
      m.created_at asc
    limit ${limit}
  `;

  const selectedRows = [];
  const plannedBySender = new Map();
  for (const row of rows) {
    const senderId = String(row.sender_account_id);
    const planned = plannedBySender.get(senderId) ?? 0;
    const remaining =
      Number(row.effective_daily_limit ?? 0) - Number(row.sender_sent_today ?? 0);
    if (remaining <= planned) continue;

    selectedRows.push(row);
    plannedBySender.set(senderId, planned + 1);
    if (selectedRows.length >= limit) break;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        messages: selectedRows.map((row) => ({
          ...row,
          compose_url: buildComposeUrl({
            accountType: row.sender_account_type,
            body: row.body,
            senderEmail: row.sender_email,
            subject: row.subject,
            to: row.to_email,
          }),
        })),
      },
      null,
      2,
    ),
  );
}

async function markSent() {
  const messageId = requiredArg("message-id");
  const gmailMessageId = args["gmail-message-id"] ?? null;
  const gmailThreadId = args["gmail-thread-id"] ?? null;

  const rows = await sql.begin(async (tx) => {
    const updated = await tx`
      update messages
      set
        status = 'sent',
        sent_at = now(),
        gmail_message_id = coalesce(${gmailMessageId}, gmail_message_id),
        gmail_thread_id = coalesce(${gmailThreadId}, gmail_thread_id),
        updated_at = now()
      where id = ${messageId}
        and status = 'approved'
      returning
        id,
        campaign_id,
        company_id,
        contact_id,
        sender_account_id,
        coalesce(subject_final, subject_draft, '(sin asunto)') as subject
    `;

    if (!updated[0]) return [];

    await tx`
      update campaign_contacts cc
      set
        status = 'sent',
        last_contacted_at = now(),
        updated_at = now()
      where cc.campaign_id = ${updated[0].campaign_id}
        and cc.company_id = ${updated[0].company_id}
        and (cc.contact_id = ${updated[0].contact_id} or cc.contact_id is null)
    `;

    await tx`
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
        ${updated[0].campaign_id},
        ${updated[0].company_id},
        ${updated[0].contact_id},
        ${updated[0].sender_account_id},
        ${gmailThreadId},
        ${updated[0].subject},
        'open',
        now()
      )
      on conflict do nothing
    `;

    return updated;
  });

  console.log(
    JSON.stringify(
      rows[0]
        ? { ok: true, messageId, status: "sent" }
        : { ok: false, messageId, status: "not_updated" },
      null,
      2,
    ),
  );
}

async function markFailed() {
  const messageId = requiredArg("message-id");
  const error = args.error ?? "gmail_send_failed";

  const rows = await sql`
    update messages
    set status = 'failed', future_note = ${error}, updated_at = now()
    where id = ${messageId}
      and status = 'approved'
    returning id
  `;

  console.log(
    JSON.stringify(
      rows[0]
        ? { ok: true, messageId, status: "failed" }
        : { ok: false, messageId, status: "not_updated" },
      null,
      2,
    ),
  );
}

function getDatabaseUrl() {
  const env = loadEnvLocal();
  const databaseUrl =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? env.SUPABASE_DB_URL;

  if (!databaseUrl) {
    throw new Error("Missing SUPABASE_DB_URL");
  }

  return databaseUrl;
}

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return {};

  return Object.fromEntries(
    fs
      .readFileSync(".env.local", "utf8")
      .split(/\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function requiredArg(name) {
  const value = args[name];

  if (!value) {
    throw new Error(`Missing --${name}`);
  }

  return value;
}

function usage() {
  console.log(`Usage:
  node scripts/outreach-queue.mjs approved --campaign pastoral-invierno-2026 --limit 10
  node scripts/outreach-queue.mjs mark-sent --message-id <uuid> --gmail-message-id <id> --gmail-thread-id <id>
  node scripts/outreach-queue.mjs mark-failed --message-id <uuid> --error <message>`);
}

function buildComposeUrl({ accountType, body, senderEmail, subject, to }) {
  const encodedTo = encodeURIComponent(to);
  const encodedSender = encodeURIComponent(senderEmail);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  if (accountType === "outlook") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`;
  }

  if (accountType === "gmail") {
    return `https://mail.google.com/mail/?authuser=${encodedSender}&view=cm&fs=1&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`;
  }

  return `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`;
}
