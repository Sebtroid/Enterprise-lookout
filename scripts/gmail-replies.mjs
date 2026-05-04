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
  if (command === "queries") {
    await listReplyQueries();
  } else if (command === "ingest") {
    await ingestReplies();
  } else {
    usage();
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}

async function listReplyQueries() {
  const rows = await loadSentMessages({
    campaign: args.campaign ?? null,
    days: Number(args.days ?? 45),
    limit: Number(args.limit ?? 50),
    sender: args.sender ?? null,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        queries: rows.map((message) => ({
          message_id: message.id,
          campaign_id: message.campaignId,
          campaign_slug: message.campaignSlug,
          contact_email: message.contactEmail,
          contact_name: message.contactName,
          sender_email: message.senderEmail,
          subject: message.subject,
          query: buildGmailReplySearchQuery(message),
        })),
      },
      null,
      2,
    ),
  );
}

async function ingestReplies() {
  const file = requiredArg("file");
  const dryRun = args["dry-run"] === "true";
  const candidates = readCandidateFile(file);
  const sentMessages = await loadSentMessages({
    campaign: args.campaign ?? null,
    days: Number(args.days ?? 90),
    limit: Number(args.limit ?? 500),
    sender: args.sender ?? null,
  });
  const existingGmailMessageIds = await loadExistingGmailMessageIds();
  const summary = {
    total: candidates.length,
    inserted: 0,
    matched: 0,
    skipped: 0,
    unmatched: 0,
    dry_run: dryRun,
  };
  const results = [];
  const runId = dryRun
    ? null
    : await createAutomationRun({
        candidates: candidates.length,
        file,
        sender: args.sender ?? null,
        campaign: args.campaign ?? null,
      });

  try {
    for (const candidate of candidates) {
      const match = matchInboundReply(candidate, sentMessages);

      if (!match) {
        summary.unmatched += 1;
        results.push({
          gmail_message_id: candidate.gmailMessageId,
          status: "unmatched",
          reason: "No matching sent message found",
        });
        continue;
      }

      if (
        !shouldIngestReply(candidate, {
          existingGmailMessageIds,
          senderEmail: match.message.senderEmail,
        })
      ) {
        summary.skipped += 1;
        results.push({
          gmail_message_id: candidate.gmailMessageId,
          matched_message_id: match.message.id,
          status: "skipped",
          reason: "Self-sent or already ingested",
        });
        continue;
      }

      summary.matched += 1;

      if (dryRun) {
        results.push({
          gmail_message_id: candidate.gmailMessageId,
          matched_message_id: match.message.id,
          match_reason: match.reason,
          confidence: match.confidence,
          status: "would_insert",
        });
        continue;
      }

      const inserted = await insertInboundReply(candidate, match);
      existingGmailMessageIds.add(candidate.gmailMessageId);

      if (inserted.status === "inserted") {
        summary.inserted += 1;
      } else {
        summary.skipped += 1;
      }

      results.push({
        gmail_message_id: candidate.gmailMessageId,
        matched_message_id: match.message.id,
        match_reason: match.reason,
        confidence: match.confidence,
        ...inserted,
      });
    }

    if (runId) {
      await finishAutomationRun(runId, "succeeded", summary, null);
    }

    console.log(JSON.stringify({ ok: true, summary, results }, null, 2));
  } catch (error) {
    if (runId) {
      await finishAutomationRun(runId, "failed", summary, error.message);
    }
    throw error;
  }
}

async function insertInboundReply(candidate, match) {
  const record = prepareInboundReplyRecord(candidate, match.message);

  return sql.begin(async (tx) => {
    const thread = await getOrCreateThread(tx, record, match.message);
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
      returning id::text as id
    `;

    const message = inserted[0];
    if (!message) {
      return { status: "duplicate" };
    }

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

    return { status: "inserted", reply_message_id: message.id, thread_id: thread.id };
  });
}

async function getOrCreateThread(tx, record, sentMessage) {
  if (record.gmailThreadId) {
    const byGmailThread = await tx`
      select id::text as id
      from threads
      where gmail_thread_id = ${record.gmailThreadId}
        and campaign_id = ${record.campaignId}
      order by created_at desc
      limit 1
    `;

    if (byGmailThread[0]) return byGmailThread[0];
  }

  const byMessageContext = await tx`
    select id::text as id
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
    returning id::text as id
  `;

  return inserted[0];
}

async function loadSentMessages({ campaign, days, limit, sender }) {
  const safeLimit = clampNumber(limit, 1, 1000);
  const safeDays = clampNumber(days, 1, 365);
  const campaignFilter = campaign ? sql`and c.slug = ${campaign}` : sql``;
  const senderFilter = sender ? sql`and sa.email = ${sender}` : sql``;

  const rows = await sql`
    select
      m.id::text as id,
      m.campaign_id::text as campaign_id,
      c.slug as campaign_slug,
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
      and ct.email is not null
      and coalesce(m.sent_at, m.created_at) >= now() - (${safeDays}::int * interval '1 day')
      ${campaignFilter}
      ${senderFilter}
    order by coalesce(m.sent_at, m.created_at) desc
    limit ${safeLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    campaignSlug: row.campaign_slug,
    companyId: row.company_id,
    contactId: row.contact_id,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    senderId: row.sender_id,
    senderEmail: row.sender_email,
    subject: row.subject,
    sentAt: row.sent_at,
    gmailThreadId: row.gmail_thread_id,
  }));
}

async function loadExistingGmailMessageIds() {
  const rows = await sql`
    select gmail_message_id
    from messages
    where gmail_message_id is not null
  `;

  return new Set(rows.map((row) => row.gmail_message_id));
}

async function createAutomationRun(inputSummary) {
  const rows = await sql`
    insert into automation_runs (
      job_name,
      status,
      input_summary
    ) values (
      'gmail-reply-ingest',
      'running',
      ${sql.json(inputSummary)}
    )
    returning id::text as id
  `;

  return rows[0].id;
}

async function finishAutomationRun(runId, status, outputSummary, error) {
  await sql`
    update automation_runs
    set
      status = ${status}::automation_status,
      finished_at = now(),
      output_summary = ${sql.json(outputSummary)},
      error = ${error}
    where id = ${runId}
  `;
}

function readCandidateFile(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const values = Array.isArray(parsed)
    ? parsed
    : parsed.candidates ?? parsed.replies ?? parsed.messages ?? [];

  if (!Array.isArray(values)) {
    throw new Error("Reply file must be a JSON array or contain candidates/replies/messages.");
  }

  return values.map(normalizeCandidate);
}

function normalizeCandidate(value) {
  const candidate = {
    gmailMessageId: readString(
      value.gmailMessageId ??
        value.gmail_message_id ??
        value.messageId ??
        value.message_id ??
        value.id,
    ),
    gmailThreadId: nullableString(
      value.gmailThreadId ?? value.gmail_thread_id ?? value.threadId ?? value.thread_id,
    ),
    fromEmail: readString(value.fromEmail ?? value.from_email ?? value.from ?? value.sender),
    toEmail: readString(value.toEmail ?? value.to_email ?? value.to ?? value.recipient),
    subject: readString(value.subject),
    body: readString(value.body ?? value.text ?? value.plainText ?? value.snippet),
    receivedAt: readString(
      value.receivedAt ?? value.received_at ?? value.date ?? value.createdAt,
    ),
  };

  for (const field of ["gmailMessageId", "fromEmail", "toEmail", "subject", "body"]) {
    if (!candidate[field]) {
      throw new Error(`Reply candidate missing ${field}`);
    }
  }

  if (!candidate.receivedAt) {
    candidate.receivedAt = new Date().toISOString();
  }

  return candidate;
}

function matchInboundReply(candidate, sentMessages) {
  const receivedAt = new Date(candidate.receivedAt);
  const eligible = sentMessages
    .filter((message) => isBeforeOrSame(message.sentAt, candidate.receivedAt))
    .sort((a, b) => newestFirst(a.sentAt, b.sentAt));

  const threadMatch = eligible.find(
    (message) =>
      Boolean(candidate.gmailThreadId) &&
      message.gmailThreadId === candidate.gmailThreadId,
  );

  if (threadMatch) {
    return { message: threadMatch, reason: "gmail_thread_id", confidence: 1 };
  }

  const fromEmail = normalizeEmail(candidate.fromEmail);
  const subject = normalizeEmailSubject(candidate.subject);
  const emailSubjectMatch = eligible.find(
    (message) =>
      normalizeEmail(message.contactEmail) === fromEmail &&
      subjectsMatch(subject, normalizeEmailSubject(message.subject)),
  );

  if (emailSubjectMatch) {
    return { message: emailSubjectMatch, reason: "contact_email_subject", confidence: 0.9 };
  }

  const contactEmailMatch = eligible.find(
    (message) => normalizeEmail(message.contactEmail) === fromEmail,
  );

  if (contactEmailMatch) {
    return {
      message: contactEmailMatch,
      reason: "contact_email_recent",
      confidence: isRecentEnough(contactEmailMatch.sentAt, receivedAt) ? 0.78 : 0.62,
    };
  }

  const candidateDomain = getEmailDomain(fromEmail);
  const domainSubjectMatch = eligible.find(
    (message) =>
      candidateDomain &&
      getEmailDomain(message.contactEmail) === candidateDomain &&
      subjectsMatch(subject, normalizeEmailSubject(message.subject)),
  );

  if (domainSubjectMatch) {
    return {
      message: domainSubjectMatch,
      reason: "contact_domain_subject",
      confidence: 0.66,
    };
  }

  return null;
}

function prepareInboundReplyRecord(candidate, sentMessage) {
  const classification = classifyInboundReply(candidate.body);

  return {
    campaignId: sentMessage.campaignId,
    companyId: sentMessage.companyId,
    contactId: sentMessage.contactId,
    senderId: sentMessage.senderId,
    originalMessageId: sentMessage.id,
    gmailMessageId: candidate.gmailMessageId,
    gmailThreadId: candidate.gmailThreadId,
    subject: candidate.subject,
    kind: "inbound_reply",
    status: "needs_review",
    classification,
    body: candidate.body,
    draftResponse: buildInboundReplyDraft(candidate),
    receivedAt: candidate.receivedAt,
    futureNote: [
      "Reply detectado automaticamente desde Gmail.",
      `Clasificacion: ${classification}.`,
      `Mensaje original: ${sentMessage.id}.`,
    ].join(" "),
  };
}

function shouldIngestReply(candidate, { existingGmailMessageIds, senderEmail }) {
  if (!candidate.gmailMessageId) return false;
  if (existingGmailMessageIds.has(candidate.gmailMessageId)) return false;
  if (normalizeEmail(candidate.fromEmail) === normalizeEmail(senderEmail)) return false;

  return true;
}

function buildGmailReplySearchQuery(message) {
  const sentAt = new Date(message.sentAt);
  const after = Number.isNaN(sentAt.getTime())
    ? null
    : sentAt.toISOString().slice(0, 10).replaceAll("-", "/");

  return [
    "in:anywhere",
    `to:${message.senderEmail}`,
    `-from:${message.senderEmail}`,
    after ? `after:${after}` : "newer_than:30d",
    `"${message.subject.replaceAll('"', "")}"`,
  ]
    .filter(Boolean)
    .join(" ");
}

function classifyInboundReply(body) {
  const normalized = normalizeSearch(body);

  if (
    includesAny(normalized, [
      "no corresponde",
      "no nos interesa",
      "no estamos interesados",
      "no podremos",
      "por ahora no",
      "no por ahora",
      "mas adelante",
      "el proximo ano",
    ])
  ) {
    return "not_now";
  }

  if (
    includesAny(normalized, [
      "te copio",
      "copio a",
      "derivo",
      "derivar",
      "contacta a",
      "habla con",
      "la persona encargada",
    ])
  ) {
    return "referred";
  }

  if (
    includesAny(normalized, [
      "presentacion",
      "monto",
      "propuesta",
      "mas informacion",
      "detalle",
      "revisar internamente",
    ])
  ) {
    return "needs_info";
  }

  if (
    includesAny(normalized, [
      "me interesa",
      "nos interesa",
      "conversemos",
      "agenda",
      "reunion",
      "llamada",
    ])
  ) {
    return "interested";
  }

  return "needs_info";
}

function buildInboundReplyDraft(candidate) {
  const classification = classifyInboundReply(candidate.body);

  if (classification === "not_now") {
    return [
      "Hola,",
      "",
      "Muchas gracias por responder y por avisarnos. Lo dejamos registrado para no insistir con este tema.",
      "",
      "Saludos,",
      "Sebastian",
    ].join("\n");
  }

  if (classification === "referred") {
    return [
      "Hola,",
      "",
      "Muchas gracias por la orientacion. Tomo el contacto y le escribo con el contexto breve para revisar si existe calce.",
      "",
      "Saludos,",
      "Sebastian",
    ].join("\n");
  }

  return [
    "Hola,",
    "",
    "Muchas gracias por responder. Te comparto una presentacion breve, una propuesta y el contexto del proyecto para que lo puedan revisar internamente.",
    "",
    "Quedo atento a cualquier formato o informacion adicional que necesiten.",
    "",
    "Saludos,",
    "Sebastian",
  ].join("\n");
}

function normalizeEmailSubject(subject) {
  return subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectsMatch(replySubject, originalSubject) {
  if (!replySubject || !originalSubject) return false;
  return (
    replySubject === originalSubject ||
    replySubject.includes(originalSubject) ||
    originalSubject.includes(replySubject)
  );
}

function isBeforeOrSame(a, b) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return true;
  return left <= right;
}

function newestFirst(a, b) {
  return new Date(b).getTime() - new Date(a).getTime();
}

function isRecentEnough(sentAt, receivedAt) {
  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime()) || Number.isNaN(receivedAt.getTime())) return false;
  return receivedAt.getTime() - sent.getTime() <= 45 * 86_400_000;
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(normalizeSearch(needle)));
}

function normalizeSearch(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getEmailDomain(email) {
  return normalizeEmail(email).split("@")[1] ?? "";
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

function readString(value) {
  return value == null ? "" : String(value).trim();
}

function nullableString(value) {
  const text = readString(value);
  return text || null;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

function usage() {
  console.log(`Usage:
  node scripts/gmail-replies.mjs queries --sender sawitting@miuandes.cl --campaign pastoral-invierno-2026
  node scripts/gmail-replies.mjs ingest --file replies.json --sender sawitting@miuandes.cl --campaign pastoral-invierno-2026
  node scripts/gmail-replies.mjs ingest --file replies.json --dry-run`);
}
