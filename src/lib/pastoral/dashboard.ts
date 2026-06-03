import {
  fetchPastoralSheetContactsFromApi,
  getPastoralSheetsConfig,
  isPastoralSheetsConfigured,
} from "@/lib/pastoral/google-sheets";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";
import {
  fetchPastoralSheetContacts,
  type PastoralSheetContact,
} from "@/lib/pastoral/sheet";
import { listRecentAiMemoryEvents } from "@/lib/gpt/semantic-memory";
import { getPastoralInitialContactSendReadiness } from "@/lib/prospecting/contact-quality";
import {
  getPostgresClient,
  withPostgresQueryTimeout,
} from "@/lib/supabase/postgres";

type DbRow = Record<string, unknown>;

export type PastoralSheetStatus = {
  contacts: PastoralSheetContact[];
  error: string | null;
  mode: "google_oauth" | "public_csv" | "unavailable";
  oauthUserEmail: string | null;
  ok: boolean;
  range: string;
  sheetConfigured: boolean;
  sheetId: string;
};

export type PastoralQueueItem = {
  actionHref: string;
  actionLabel: string;
  companyId: string;
  companyName: string;
  contactEmail: string;
  contactName: string;
  fitScore: number;
  lastActivityAt: string | null;
  reason: string;
  state:
    | "blocked"
    | "followup_ready"
    | "reply_pending"
    | "review_mail"
    | "safe_to_send"
    | "waiting";
};

export type PastoralOpsSnapshot = {
  counts: {
    approvedOutbound: number;
    draftsPending: number;
    feedbackRemembered: number;
    followupsDue: number;
    gmailConnected: number;
    pendingReplies: number;
    sentInitial: number;
  };
  memoryRules: Array<{
    confidence: number;
    id: string;
    ruleText: string;
    ruleType: string;
    source: string;
  }>;
  semanticMemory: Array<{
    confidence: number | null;
    createdAt: string | null;
    id: string;
    preview: string;
    sourceType: string;
  }>;
  queue: PastoralQueueItem[];
  recentActivity: Array<{
    companyName: string;
    occurredAt: string | null;
    preview: string;
    status: string;
    subject: string;
    type: string;
  }>;
};

export async function getPastoralSheetStatus(): Promise<PastoralSheetStatus> {
  const config = getPastoralSheetsConfig();
  const sheetConfigured = isPastoralSheetsConfigured(config);

  if (!sheetConfigured) {
    return {
      contacts: [],
      error: "Falta configurar PASTORAL_CONTACT_SHEET_ID o PASTORAL_CONTACT_SHEET_RANGE.",
      mode: "unavailable",
      oauthUserEmail: null,
      ok: false,
      range: config.range,
      sheetConfigured,
      sheetId: config.spreadsheetId,
    };
  }

  const oauth = await getPastoralDashboardOAuthToken();
  if (oauth) {
    try {
      const contacts = await fetchPastoralSheetContactsFromApi({
        accessToken: oauth.accessToken,
        config,
      });

      return {
        contacts,
        error: null,
        mode: "google_oauth",
        oauthUserEmail: oauth.userEmail,
        ok: true,
        range: config.range,
        sheetConfigured,
        sheetId: config.spreadsheetId,
      };
    } catch (error) {
      return {
        contacts: [],
        error:
          error instanceof Error
            ? error.message
            : "No pude leer Google Sheets con la cuenta Google conectada.",
        mode: "google_oauth",
        oauthUserEmail: oauth.userEmail,
        ok: false,
        range: config.range,
        sheetConfigured,
        sheetId: config.spreadsheetId,
      };
    }
  }

  try {
    const contacts = await fetchPastoralSheetContacts();
    return {
      contacts,
      error:
        "Vista leida por CSV publico. Para enviar o hacer follow-up, cada remitente debe reconectar Google con permiso de Sheets.",
      mode: "public_csv",
      oauthUserEmail: null,
      ok: true,
      range: config.range,
      sheetConfigured,
      sheetId: config.spreadsheetId,
    };
  } catch (error) {
    return {
      contacts: [],
      error:
        error instanceof Error
          ? error.message
          : "No pude leer el Sheets de Pastoral.",
      mode: "unavailable",
      oauthUserEmail: null,
      ok: false,
      range: config.range,
      sheetConfigured,
      sheetId: config.spreadsheetId,
    };
  }
}

async function getPastoralDashboardOAuthToken() {
  const sql = getPostgresClient();
  if (!sql) return null;

  try {
    const rows = await withPostgresQueryTimeout(sql`
      select
        gt.user_email::text as user_email,
        gt.access_token,
        gt.refresh_token,
        gt.expires_at::text as expires_at
      from gmail_tokens gt
      join sender_accounts sa
        on lower(sa.email::text) = lower(gt.user_email::text)
        and sa.account_type = 'gmail'
        and sa.status = 'active'
      order by gt.updated_at desc nulls last, gt.expires_at desc
      limit 1
    `.execute(), "pastoral sheet oauth token");
    const row = rows[0] as DbRow | undefined;
    if (!row) return null;

    const userEmail = stringValue(row.user_email);
    let accessToken = decryptToken(stringValue(row.access_token));
    const refreshToken = decryptToken(stringValue(row.refresh_token));

    if (!accessToken || !refreshToken || !userEmail) return null;
    if (new Date(stringValue(row.expires_at)) >= new Date()) {
      return { accessToken, userEmail };
    }

    const refreshed = await refreshGoogleAccessToken(refreshToken);
    if (!refreshed) return null;

    accessToken = refreshed.access_token;
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await sql`
      update gmail_tokens
      set
        access_token = ${encryptToken(accessToken)},
        expires_at = ${newExpiresAt},
        updated_at = now()
      where user_email = ${userEmail}
    `;

    return { accessToken, userEmail };
  } catch (error) {
    console.error("Could not load Pastoral dashboard OAuth token", error);
    return null;
  }
}

async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error || !data.access_token) return null;
    return {
      access_token: String(data.access_token),
      expires_in: Number(data.expires_in ?? 3600),
    };
  } catch {
    return null;
  }
}

export async function getPastoralOpsSnapshot(
  scope: string,
): Promise<PastoralOpsSnapshot> {
  const sql = getPostgresClient();
  if (!sql) return emptyOpsSnapshot();

  try {
    const campaignRows = await withPostgresQueryTimeout(sql`
      select id::text as id
      from campaigns
      where slug = ${scope}
      limit 1
    `.execute(), "pastoral campaign");
    const campaignId = stringValue(campaignRows[0]?.id);
    if (!campaignId) return emptyOpsSnapshot();

    const [countRows, queueRows, memoryRows, activityRows, semanticMemoryRows] = await Promise.all([
      withPostgresQueryTimeout(sql`
        select
          count(*) filter (
            where m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
              and m.status = 'needs_review'
          )::int as drafts_pending,
          count(*) filter (
            where m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
              and m.status = 'approved'
          )::int as approved_outbound,
          count(*) filter (
            where m.kind = 'inbound_reply'
              and m.status = 'needs_review'
          )::int as pending_replies,
          count(*) filter (
            where m.kind = 'outbound_initial'
              and m.status = 'sent'
          )::int as sent_initial,
          count(*) filter (
            where m.kind = 'outbound_initial'
              and m.status = 'sent'
              and coalesce(m.sent_at, m.created_at) <= now() - interval '5 days'
              and not exists (
                select 1
                from messages inbound
                where inbound.campaign_id = m.campaign_id
                  and inbound.company_id = m.company_id
                  and inbound.kind = 'inbound_reply'
                  and inbound.status in ('needs_review', 'approved', 'sent')
                  and coalesce(inbound.received_at, inbound.created_at) > coalesce(m.sent_at, m.created_at)
              )
          )::int as followups_due,
          (
            select count(*)::int
            from gmail_tokens gt
          ) as gmail_connected,
          (
            select count(*)::int
            from outbound_feedback feedback
            where feedback.campaign_id = ${campaignId}
              and feedback.remember_for_future = true
          ) as feedback_remembered
        from messages m
        where m.campaign_id = ${campaignId}
      `.execute(), "pastoral counts"),
      withPostgresQueryTimeout(sql`
        select
          co.id::text as company_id,
          co.canonical_name as company_name,
          coalesce(cc.fit_score, 0)::int as fit_score,
          coalesce(cc.status::text, 'new') as campaign_status,
          cc.last_contacted_at::text as last_contacted_at,
          ct.full_name as contact_name,
          ct.email::text as contact_email,
          ct.role as contact_role,
          coalesce(ct.confidence, 0)::float as contact_confidence,
          ct.verification_status::text as contact_verification_status,
          ct.source as contact_source,
          coalesce(ct.is_decision_maker, false) as contact_is_decision_maker,
          coalesce(co.do_not_contact, false) as company_do_not_contact,
          coalesce(ct.do_not_contact, false) as contact_do_not_contact,
          exists (
            select 1
            from messages reply
            where reply.campaign_id = cc.campaign_id
              and reply.company_id = co.id
              and reply.kind = 'inbound_reply'
              and reply.status = 'needs_review'
          ) as has_pending_reply,
          exists (
            select 1
            from messages approved
            where approved.campaign_id = cc.campaign_id
              and approved.company_id = co.id
              and approved.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
              and approved.status = 'approved'
          ) as has_approved_outbound,
          exists (
            select 1
            from messages sent
            where sent.campaign_id = cc.campaign_id
              and sent.company_id = co.id
              and sent.kind = 'outbound_initial'
              and sent.status = 'sent'
          ) as has_sent_initial,
          exists (
            select 1
            from messages initial
            where initial.campaign_id = cc.campaign_id
              and initial.company_id = co.id
              and initial.kind = 'outbound_initial'
              and initial.status = 'sent'
              and coalesce(initial.sent_at, initial.created_at) <= now() - interval '5 days'
              and not exists (
                select 1
                from messages inbound
                where inbound.campaign_id = initial.campaign_id
                  and inbound.company_id = initial.company_id
                  and inbound.kind = 'inbound_reply'
                  and inbound.status in ('needs_review', 'approved', 'sent')
                  and coalesce(inbound.received_at, inbound.created_at) > coalesce(initial.sent_at, initial.created_at)
              )
          ) as followup_due,
          (
            select max(coalesce(m.sent_at, m.approved_at, m.received_at, m.created_at))::text
            from messages m
            where m.campaign_id = cc.campaign_id
              and m.company_id = co.id
          ) as last_activity_at
        from campaign_contacts cc
        join companies co on co.id = cc.company_id
        left join contacts ct on ct.id = cc.contact_id
        where cc.campaign_id = ${campaignId}
          and cc.status in (
            'qualified',
            'ready_to_draft',
            'draft_ready',
            'approved_to_send',
            'sent',
            'replied',
            'followup_due'
          )
        order by
          case
            when coalesce(co.do_not_contact, false) or coalesce(ct.do_not_contact, false) then 6
            when exists (
              select 1 from messages reply
              where reply.campaign_id = cc.campaign_id
                and reply.company_id = co.id
                and reply.kind = 'inbound_reply'
                and reply.status = 'needs_review'
            ) then 1
            when cc.status = 'followup_due' then 2
            when cc.status = 'approved_to_send' then 3
            when cc.status in ('draft_ready', 'ready_to_draft') then 4
            else 5
          end,
          cc.priority_score desc nulls last,
          co.canonical_name asc
        limit 18
      `.execute(), "pastoral queue"),
      withPostgresQueryTimeout(sql`
        select
          id::text as id,
          rule_type,
          rule_text,
          coalesce(source, 'manual') as source,
          coalesce(confidence, 0)::float as confidence
        from ai_memory_rules
        where active = true
          and (
            scope = 'global'
            or campaign_id = ${campaignId}
          )
        order by updated_at desc
        limit 6
      `.execute(), "pastoral memory"),
      withPostgresQueryTimeout(sql`
        select
          coalesce(co.canonical_name, 'Sin empresa') as company_name,
          m.kind::text as type,
          m.status::text as status,
          coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
          left(coalesce(m.body_final, m.body_draft, ''), 180) as preview,
          coalesce(m.sent_at, m.approved_at, m.received_at, m.created_at)::text as occurred_at
        from messages m
        left join companies co on co.id = m.company_id
        where m.campaign_id = ${campaignId}
        order by coalesce(m.sent_at, m.approved_at, m.received_at, m.created_at) desc
        limit 10
      `.execute(), "pastoral activity"),
      listRecentAiMemoryEvents({ campaignId, limit: 6 }),
    ]);

    const counts = countRows[0] ?? {};
    return {
      counts: {
        approvedOutbound: numberValue(counts.approved_outbound),
        draftsPending: numberValue(counts.drafts_pending),
        feedbackRemembered: numberValue(counts.feedback_remembered),
        followupsDue: numberValue(counts.followups_due),
        gmailConnected: numberValue(counts.gmail_connected),
        pendingReplies: numberValue(counts.pending_replies),
        sentInitial: numberValue(counts.sent_initial),
      },
      memoryRules: memoryRows.map(mapMemoryRule),
      semanticMemory: semanticMemoryRows.map((memory) => ({
        confidence: memory.confidence,
        createdAt: memory.created_at || null,
        id: memory.id,
        preview: memory.memory_text,
        sourceType: memory.source_type,
      })),
      queue: queueRows.map((row) => mapQueueItem(row, scope)),
      recentActivity: activityRows.map(mapActivity),
    };
  } catch (error) {
    console.error("Could not load Pastoral ops snapshot", error);
    return emptyOpsSnapshot();
  }
}

function mapQueueItem(row: DbRow, scope: string): PastoralQueueItem {
  const companyName = stringValue(row.company_name) || "Sin empresa";
  const blocked = Boolean(row.company_do_not_contact) || Boolean(row.contact_do_not_contact);
  const status = stringValue(row.campaign_status);
  const contactEmail = stringValue(row.contact_email);
  const contactName = stringValue(row.contact_name) || "Sin contacto";
  const contactReadiness = getPastoralInitialContactSendReadiness({
    confidence: numberValue(row.contact_confidence),
    email: contactEmail,
    fullName: contactName,
    isDecisionMaker: Boolean(row.contact_is_decision_maker),
    role: stringValue(row.contact_role),
    source: stringValue(row.contact_source),
    verificationStatus: stringValue(row.contact_verification_status) || "unverified",
  });

  if (blocked) {
    return {
      actionHref: `/campaigns/${scope}/companies`,
      actionLabel: "Abrir empresa",
      companyId: stringValue(row.company_id),
      companyName,
      contactEmail,
      contactName,
      fitScore: numberValue(row.fit_score),
      lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
      reason: "Bloqueado por do_not_contact.",
      state: "blocked",
    };
  }

  if (Boolean(row.has_pending_reply) || status === "replied") {
    return {
      actionHref: `/campaigns/${scope}/review/replies`,
      actionLabel: "Responder",
      companyId: stringValue(row.company_id),
      companyName,
      contactEmail,
      contactName,
      fitScore: numberValue(row.fit_score),
      lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
      reason: "Hay una respuesta nueva o una conversación activa.",
      state: "reply_pending",
    };
  }

  if (Boolean(row.followup_due) || status === "followup_due") {
    return {
      actionHref: `/campaigns/${scope}/review/outbound`,
      actionLabel: "Follow-up",
      companyId: stringValue(row.company_id),
      companyName,
      contactEmail,
      contactName,
      fitScore: numberValue(row.fit_score),
      lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
      reason: "Ya pasaron al menos 5 dias sin respuesta.",
      state: "followup_ready",
    };
  }

  if (Boolean(row.has_approved_outbound) || status === "approved_to_send") {
    if (!contactReadiness.ok) {
      return {
        actionHref: `/campaigns/${scope}/contacts`,
        actionLabel: "Verificar contacto",
        companyId: stringValue(row.company_id),
        companyName,
        contactEmail,
        contactName,
        fitScore: numberValue(row.fit_score),
        lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
        reason: contactReadiness.message,
        state: "blocked",
      };
    }

    return {
      actionHref: `/campaigns/${scope}/review/outbound`,
      actionLabel: "Enviar",
      companyId: stringValue(row.company_id),
      companyName,
      contactEmail,
      contactName,
      fitScore: numberValue(row.fit_score),
      lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
      reason: "Listo para guardrail: Sheets fresco, reserva local y Gmail.",
      state: "safe_to_send",
    };
  }

  if (status === "draft_ready" || status === "ready_to_draft" || status === "qualified") {
    if (!contactReadiness.ok) {
      return {
        actionHref: `/campaigns/${scope}/contacts`,
        actionLabel: "Investigar contacto",
        companyId: stringValue(row.company_id),
        companyName,
        contactEmail,
        contactName,
        fitScore: numberValue(row.fit_score),
        lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
        reason: contactReadiness.message,
        state: "blocked",
      };
    }

    return {
      actionHref: `/campaigns/${scope}/review/outbound`,
      actionLabel: "Revisar",
      companyId: stringValue(row.company_id),
      companyName,
      contactEmail,
      contactName,
      fitScore: numberValue(row.fit_score),
      lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
      reason: "Falta revisar o preparar el mail antes de enviar.",
      state: "review_mail",
    };
  }

  return {
    actionHref: `/campaigns/${scope}/overview`,
    actionLabel: "Historial",
    companyId: stringValue(row.company_id),
    companyName,
    contactEmail,
    contactName,
    fitScore: numberValue(row.fit_score),
    lastActivityAt: stringValue(row.last_activity_at) || stringValue(row.last_contacted_at) || null,
    reason: Boolean(row.has_sent_initial)
      ? "Mail inicial enviado; esperando respuesta."
      : "Sin accion automatica ahora.",
    state: "waiting",
  };
}

function mapMemoryRule(row: DbRow) {
  return {
    confidence: numberValue(row.confidence),
    id: stringValue(row.id),
    ruleText: stringValue(row.rule_text),
    ruleType: stringValue(row.rule_type),
    source: stringValue(row.source),
  };
}

function mapActivity(row: DbRow) {
  return {
    companyName: stringValue(row.company_name),
    occurredAt: stringValue(row.occurred_at) || null,
    preview: stringValue(row.preview),
    status: stringValue(row.status),
    subject: stringValue(row.subject),
    type: stringValue(row.type),
  };
}

function emptyOpsSnapshot(): PastoralOpsSnapshot {
  return {
    counts: {
      approvedOutbound: 0,
      draftsPending: 0,
      feedbackRemembered: 0,
      followupsDue: 0,
      gmailConnected: 0,
      pendingReplies: 0,
      sentInitial: 0,
    },
    memoryRules: [],
    semanticMemory: [],
    queue: [],
    recentActivity: [],
  };
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
