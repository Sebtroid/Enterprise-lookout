import { normalizeDomCompanyCandidates } from "@/lib/dom/company-candidates";
import { persistDomApiResponse } from "@/lib/dom/client";
import { getDomCampaignContextById } from "@/lib/dom/repository";
import type { DomApiResponse } from "@/lib/dom/types";
import { normalizeDomTaskStatus, type DOM_TASK_STATUSES } from "@/lib/dom/status";
import {
  createAiMemoryEvent,
  listRecentAiMemoryEvents,
  searchAiMemoryEvents,
  type AiMemorySourceType,
} from "@/lib/gpt/semantic-memory";
import { getPostgresClient } from "@/lib/supabase/postgres";

type DomTaskStatus = (typeof DOM_TASK_STATUSES)[number];
type JsonInput = Parameters<NonNullable<ReturnType<typeof getPostgresClient>>["json"]>[0];

export type GptJobInput = {
  campaignId?: string | null;
  taskType?: string | null;
  description: string;
  instructions?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
};

export type GptClaimInput = {
  campaignId?: string | null;
  workerId?: string | null;
  taskTypes?: string[];
  limit?: number;
};

export type GptProgressInput = {
  status: DomTaskStatus;
  step?: string | null;
  message?: string | null;
  percent?: number | null;
  resultPreview?: string | null;
};

export type GptResultInput = {
  status?: "completed" | "reviewing" | "failed";
  result?: unknown;
  companyCandidates?: unknown[];
  actions?: Array<Record<string, unknown>>;
  message?: string | null;
};

export type GptMemoryRuleInput = {
  campaignId?: string | null;
  scope?: "global" | "campaign" | "company" | "contact" | "sender";
  ruleType?: string | null;
  ruleText: string;
  source?: string | null;
  confidence?: number | null;
};

export type GptMemoryEventInput = {
  campaignId?: string | null;
  companyId?: string | null;
  confidence?: number | null;
  contactId?: string | null;
  memoryText: string;
  metadata?: Record<string, unknown> | null;
  senderAccountId?: string | null;
  sourceId?: string | null;
  sourceType?: AiMemorySourceType | null;
};

export type GptMemorySearchInput = {
  campaignId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  limit?: number;
  query: string;
  sourceTypes?: AiMemorySourceType[];
};

export async function listGptCampaigns() {
  const sql = requireSql();
  const rows = await sql`
    select
      id::text as id,
      slug,
      name,
      organization,
      coalesce(description, '') as description,
      coalesce(value_proposition, '') as value_proposition,
      status::text as status,
      starts_on,
      ends_on
    from campaigns
    order by updated_at desc, created_at desc
    limit 50
  `;

  return rows.map(mapCampaignRow);
}

export async function getGptCampaignWorkspace(campaignKey: string) {
  const sql = requireSql();
  const campaignId = await resolveCampaignId(sql, campaignKey);
  if (!campaignId) return null;

  const [campaigns, tasks, rules, feedback, semanticMemory] = await Promise.all([
    sql`
      select
        id::text as id,
        slug,
        name,
        organization,
        coalesce(description, '') as description,
        coalesce(value_proposition, '') as value_proposition,
        status::text as status,
        starts_on,
        ends_on
      from campaigns
      where id = ${campaignId}
      limit 1
    `,
    sql`
      select
        id::text as id,
        description,
        status::text as status,
        created_by,
        context,
        result,
        progress_step,
        progress_message,
        progress_percent,
        result_preview,
        created_at,
        updated_at
      from dom_tasks
      where campaign_id = ${campaignId}
        and status in ('pending', 'received', 'in_progress', 'researching', 'drafting', 'reviewing')
      order by created_at asc
      limit 25
    `,
    listGptMemoryRules({ campaignId }),
    listRememberedOutboundFeedback(sql, campaignId),
    listRecentAiMemoryEvents({ campaignId, limit: 12 }),
  ]);

  const campaign = campaigns[0];
  if (!campaign) return null;

  return {
    campaign: mapCampaignRow(campaign),
    active_tasks: tasks.map(mapTaskRow),
    memory_rules: rules,
    semantic_memory: semanticMemory,
    remembered_feedback: feedback,
  };
}

export async function createGptJob(input: GptJobInput) {
  const sql = requireSql();
  const campaignId = await resolveCampaignId(sql, input.campaignId);
  const context = {
    gpt: {
      task_type: input.taskType ?? "general",
      instructions: input.instructions ?? null,
      object_type: input.objectType ?? null,
      object_id: input.objectId ?? null,
      priority: input.priority ?? "normal",
      created_by: "custom_gpt",
      created_at: new Date().toISOString(),
    },
  };

  const rows = await sql`
    insert into dom_tasks (
      campaign_id,
      description,
      status,
      created_by,
      context,
      progress_message,
      progress_percent,
      last_progress_at
    ) values (
      ${campaignId},
      ${input.description},
      'pending'::dom_task_status,
      'user',
      ${sql.json(toJson(context))}::jsonb,
      'Creada por Enterprise Lookout GPT.',
      0,
      now()
    )
    returning
      id::text as id,
      campaign_id::text as campaign_id,
      description,
      status::text as status,
      created_by,
      context,
      result,
      progress_step,
      progress_message,
      progress_percent,
      result_preview,
      created_at,
      updated_at
  `;

  return mapTaskRow(rows[0]);
}

export async function claimNextGptJobs(input: GptClaimInput) {
  const sql = requireSql();
  const campaignId = await resolveCampaignId(sql, input.campaignId);
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  const workerId = input.workerId?.trim() || "custom-gpt";
  const taskTypes = (input.taskTypes ?? []).map((item) => item.trim()).filter(Boolean);
  const claim = {
    claimed_by: workerId,
    worker_type: "custom_gpt",
    claimed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  const rows = await sql`
    with candidates as (
      select id
      from dom_tasks
      where status in ('pending', 'received')
        ${campaignId ? sql`and campaign_id = ${campaignId}` : sql``}
        ${
          taskTypes.length
            ? sql`and coalesce(context->'gpt'->>'task_type', context->>'task_type', '') = any(${taskTypes})`
            : sql``
        }
        and (
          context->'claim' is null
          or context->'claim'->>'expires_at' is null
          or (context->'claim'->>'expires_at')::timestamptz < now()
        )
      order by
        case coalesce(context->'gpt'->>'priority', context->>'priority', 'normal')
          when 'urgent' then 1
          when 'high' then 2
          when 'normal' then 3
          when 'low' then 4
          else 5
        end,
        created_at asc
      for update skip locked
      limit ${limit}
    )
    update dom_tasks dt
    set
      status = 'in_progress'::dom_task_status,
      context = coalesce(dt.context, '{}'::jsonb) || ${sql.json({ claim })}::jsonb,
      progress_message = coalesce(dt.progress_message, 'Enterprise Lookout GPT tomo la tarea.'),
      progress_percent = coalesce(dt.progress_percent, 0),
      last_progress_at = now(),
      updated_at = now()
    from candidates
    where dt.id = candidates.id
    returning
      dt.id::text as id,
      dt.campaign_id::text as campaign_id,
      dt.description,
      dt.status::text as status,
      dt.created_by,
      dt.context,
      dt.result,
      dt.progress_step,
      dt.progress_message,
      dt.progress_percent,
      dt.result_preview,
      dt.created_at,
      dt.updated_at
  `;

  return rows.map(mapTaskRow);
}

export async function getGptJobContext(jobId: string) {
  const sql = requireSql();
  const rows = await sql`
    select
      dt.id::text as id,
      dt.campaign_id::text as campaign_id,
      dt.description,
      dt.status::text as status,
      dt.created_by,
      dt.context,
      dt.result,
      dt.progress_step,
      dt.progress_message,
      dt.progress_percent,
      dt.result_preview,
      dt.created_at,
      dt.updated_at,
      c.slug as campaign_slug,
      c.name as campaign_name,
      c.organization,
      coalesce(c.description, '') as campaign_description,
      coalesce(c.value_proposition, '') as value_proposition,
      c.status::text as campaign_status,
      c.starts_on,
      c.ends_on
    from dom_tasks dt
    left join campaigns c on c.id = dt.campaign_id
    where dt.id = ${jobId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const task = mapTaskRow(row);
  const campaignId = stringOrNull(row.campaign_id);
  const context = asRecord(row.context);
  const messageId = findContextString(context, [
    "message_id",
    "source_message_id",
    "object_id",
  ]);
  const companyId = findContextString(context, ["company_id"]);
  const contactId = findContextString(context, ["contact_id"]);
  const memoryQuery = [
    String(row.description ?? ""),
    stringifyResult(row.context),
  ].filter(Boolean).join("\n\n");

  const [
    rules,
    rememberedFeedback,
    semanticMemory,
    message,
    company,
    contact,
    candidates,
  ] = await Promise.all([
    campaignId ? listGptMemoryRules({ campaignId }) : Promise.resolve([]),
    campaignId ? listRememberedOutboundFeedback(sql, campaignId) : Promise.resolve([]),
    campaignId && memoryQuery
      ? searchAiMemoryEvents({
          campaignId,
          companyId,
          contactId,
          limit: 8,
          query: memoryQuery,
        })
      : Promise.resolve({ events: [] }),
    messageId ? getMessageContext(sql, messageId) : Promise.resolve(null),
    companyId ? getCompanyContext(sql, companyId) : Promise.resolve(null),
    contactId ? getContactContext(sql, contactId) : Promise.resolve(null),
    getCandidateContext(sql, jobId),
  ]);

  return {
    task,
    campaign: campaignId
      ? {
          id: campaignId,
          slug: row.campaign_slug,
          name: row.campaign_name,
          organization: row.organization,
          description: row.campaign_description,
          value_proposition: row.value_proposition,
          status: row.campaign_status,
          starts_on: row.starts_on,
          ends_on: row.ends_on,
        }
      : null,
    memory_rules: rules,
    remembered_feedback: rememberedFeedback,
    semantic_memory: semanticMemory.events,
    semantic_memory_status: {
      database_error: "databaseError" in semanticMemory ? semanticMemory.databaseError : null,
      embedding_error: "embeddingError" in semanticMemory ? semanticMemory.embeddingError : null,
    },
    related: {
      message,
      company: company ?? message?.company ?? null,
      contact: contact ?? message?.contact ?? null,
      candidates,
    },
  };
}

export async function updateGptJobProgress(jobId: string, input: GptProgressInput) {
  const sql = requireSql();
  const progress = {
    status: input.status,
    step: input.step ?? null,
    message: input.message ?? null,
    percent: input.percent ?? null,
    result_preview: input.resultPreview ?? null,
    reported_by: "custom_gpt",
    reported_at: new Date().toISOString(),
  };

  const rows = await sql`
    update dom_tasks
    set
      status = ${normalizeDomTaskStatus(input.status)}::dom_task_status,
      progress_step = ${progress.step},
      progress_message = ${progress.message},
      progress_percent = ${progress.percent},
      result_preview = ${progress.result_preview},
      last_progress_at = now(),
      context = coalesce(context, '{}'::jsonb) || ${sql.json({ latest_progress: progress })}::jsonb,
      updated_at = now()
    where id = ${jobId}
    returning id::text as id, status::text as status, updated_at
  `;

  return rows[0] ?? null;
}

export async function submitGptJobResult(jobId: string, input: GptResultInput) {
  const sql = requireSql();
  const rawActions = extractGptResultActions(input);
  const message = extractGptResultMessage(input);
  const status = resolveGptResultStatus(input);
  const resultText = stringifyResult(input.result ?? input.message ?? null);
  const candidates = normalizeDomCompanyCandidates({
    company_candidates: extractGptCompanyCandidates(input),
  });
  const completion = {
    source: "custom_gpt",
    result: input.result ?? null,
    message,
    actions: rawActions,
    completed_at: new Date().toISOString(),
  };

  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      update dom_tasks
      set
        status = ${status}::dom_task_status,
        result = ${resultText},
        progress_percent = ${status === "failed" ? null : 100},
        progress_message = ${status === "failed" ? "Enterprise Lookout GPT marco error." : "Resultado generado por Enterprise Lookout GPT."},
        last_progress_at = now(),
        context = coalesce(context, '{}'::jsonb) || ${tx.json(toJson({ completion }))}::jsonb,
        updated_at = now()
      where id = ${jobId}
      returning
        id::text as id,
        campaign_id::text as campaign_id,
        status::text as status,
        context,
        updated_at
    `;

    const task = rows[0];
    if (!task) return null;

    for (const candidate of candidates) {
      await tx`
        insert into dom_task_company_candidates (
          task_id,
          campaign_id,
          name,
          normalized_name,
          domain,
          website,
          industry,
          region,
          description,
          evidence_urls,
          suggested_contacts,
          fit_score,
          fit_reason,
          quality_rating,
          quality_reason,
          status
        ) values (
          ${jobId},
          ${task.campaign_id},
          ${candidate.name},
          ${candidate.normalizedName},
          ${candidate.domain},
          ${candidate.website},
          ${candidate.industry},
          ${candidate.region},
          ${candidate.description},
          ${candidate.evidenceUrls},
          ${tx.json(candidate.suggestedContacts as JsonInput)},
          ${candidate.fitScore},
          ${candidate.fitReason},
          ${candidate.qualityRating},
          ${candidate.qualityReason},
          'pending'
        )
        on conflict (task_id, normalized_name) do update
        set
          domain = excluded.domain,
          website = excluded.website,
          industry = excluded.industry,
          region = excluded.region,
          description = excluded.description,
          evidence_urls = excluded.evidence_urls,
          suggested_contacts = excluded.suggested_contacts,
          fit_score = excluded.fit_score,
          fit_reason = excluded.fit_reason,
          quality_rating = excluded.quality_rating,
          quality_reason = excluded.quality_reason,
          updated_at = now()
      `;
    }

    return {
      task,
      candidateCount: candidates.length,
    };
  });

  if (!result) return null;

  if (result.task.campaign_id && (rawActions.length || message)) {
    const campaign = await getDomCampaignContextById(result.task.campaign_id);
    if (campaign) {
      const actions = withTaskSourceMessageId(
        rawActions,
        asRecord(result.task.context),
      );
      const response: DomApiResponse = {
        message: message ?? undefined,
        actions,
      };
      await persistDomApiResponse({
        campaign,
        event: "custom_gpt_result",
        metadata: { task_id: jobId },
        response,
        source: "callback",
      });
    }
  }

  if (result.task.campaign_id && status === "completed" && (resultText || message)) {
    await createAiMemoryEvent({
      campaignId: String(result.task.campaign_id),
      confidence: 0.62,
      createdBy: "custom_gpt",
      memoryText: [
        "Resultado completado por GPT/Dom.",
        message ? `Mensaje: ${message}` : null,
        resultText ? `Resultado:\n${resultText}` : null,
      ].filter(Boolean).join("\n\n"),
      metadata: {
        action_count: rawActions.length,
        candidate_count: candidates.length,
        source: "custom_gpt_result",
      },
      sourceId: jobId,
      sourceType: "gpt_result",
    });
  }

  return {
    task_id: result.task.id,
    status: result.task.status,
    candidate_count: result.candidateCount,
    updated_at: result.task.updated_at,
  };
}

export async function listGptMemoryRules({
  campaignId,
  ruleType,
}: {
  campaignId?: string | null;
  ruleType?: string | null;
}) {
  const sql = requireSql();
  const resolvedCampaignId = await resolveCampaignId(sql, campaignId);
  const rows = await sql`
    select
      id::text as id,
      scope,
      rule_type,
      rule_text,
      campaign_id::text as campaign_id,
      company_id::text as company_id,
      contact_id::text as contact_id,
      sender_account_id::text as sender_account_id,
      source,
      confidence,
      active,
      created_at,
      updated_at
    from ai_memory_rules
    where active = true
      ${resolvedCampaignId ? sql`and (campaign_id = ${resolvedCampaignId} or scope = 'global')` : sql``}
      ${ruleType ? sql`and rule_type = ${ruleType}` : sql``}
    order by
      case scope when 'campaign' then 1 when 'global' then 2 else 3 end,
      updated_at desc
    limit 100
  `;

  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    rule_type: row.rule_type,
    rule_text: row.rule_text,
    campaign_id: row.campaign_id,
    company_id: row.company_id,
    contact_id: row.contact_id,
    sender_account_id: row.sender_account_id,
    source: row.source,
    confidence: row.confidence == null ? null : Number(row.confidence),
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function createGptMemoryRule(input: GptMemoryRuleInput) {
  const sql = requireSql();
  const campaignId = await resolveCampaignId(sql, input.campaignId);
  const rows = await sql`
    insert into ai_memory_rules (
      scope,
      rule_type,
      rule_text,
      campaign_id,
      source,
      confidence,
      created_by
    ) values (
      ${input.scope ?? (campaignId ? "campaign" : "global")},
      ${input.ruleType ?? "general"},
      ${input.ruleText},
      ${campaignId},
      ${input.source ?? "custom_gpt"},
      ${input.confidence ?? 0.8},
      'custom_gpt'
    )
    returning
      id::text as id,
      scope,
      rule_type,
      rule_text,
      campaign_id::text as campaign_id,
      source,
      confidence,
      active,
      created_at,
      updated_at
  `;

  return rows[0] ?? null;
}

export async function createGptMemoryEvent(input: GptMemoryEventInput) {
  const sql = requireSql();
  const campaignId = await resolveCampaignId(sql, input.campaignId);
  return createAiMemoryEvent({
    campaignId,
    companyId: input.companyId,
    confidence: input.confidence,
    contactId: input.contactId,
    createdBy: "custom_gpt",
    memoryText: input.memoryText,
    metadata: input.metadata,
    senderAccountId: input.senderAccountId,
    sourceId: input.sourceId,
    sourceType: input.sourceType ?? "manual",
  });
}

export async function searchGptMemoryEvents(input: GptMemorySearchInput) {
  const sql = requireSql();
  const campaignId = await resolveCampaignId(sql, input.campaignId);
  return searchAiMemoryEvents({
    campaignId,
    companyId: input.companyId,
    contactId: input.contactId,
    limit: input.limit,
    query: input.query,
    sourceTypes: input.sourceTypes,
  });
}

function requireSql() {
  const sql = getPostgresClient();
  if (!sql) throw new Error("Database unavailable");
  return sql;
}

async function resolveCampaignId(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
  campaignKey?: string | null,
) {
  const key = campaignKey?.trim();
  if (!key) return null;
  const rows = await sql`
    select id::text as id
    from campaigns
    where id::text = ${key} or slug = ${key}
    limit 1
  `;
  return stringOrNull(rows[0]?.id);
}

async function listRememberedOutboundFeedback(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
  campaignId: string,
) {
  const rows = await sql`
    select
      id::text as id,
      reason,
      comment,
      company_id::text as company_id,
      contact_id::text as contact_id,
      created_at
    from outbound_feedback
    where campaign_id = ${campaignId}
      and remember_for_future = true
      and comment is not null
    order by created_at desc
    limit 30
  `;
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    comment: row.comment,
    company_id: row.company_id,
    contact_id: row.contact_id,
    created_at: row.created_at,
  }));
}

async function getMessageContext(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
  messageId: string,
) {
  const rows = await sql`
    select
      m.id::text as id,
      m.kind::text as kind,
      m.status::text as status,
      coalesce(m.subject_final, m.subject_draft, '') as subject,
      coalesce(m.body_final, m.body_draft, '') as body,
      m.future_note,
      m.reply_classification,
      m.campaign_id::text as campaign_id,
      m.company_id::text as company_id,
      m.contact_id::text as contact_id,
      co.id::text as company_id,
      co.canonical_name as company_name,
      co.domain as company_domain,
      co.description as company_description,
      co.quality_rating,
      co.quality_notes,
      ct.id::text as contact_id,
      ct.full_name as contact_name,
      ct.role as contact_role,
      ct.email::text as contact_email,
      ct.confidence as contact_confidence,
      sa.email::text as sender_email,
      sa.display_name as sender_name,
      sa.signature as sender_signature
    from messages m
    left join companies co on co.id = m.company_id
    left join contacts ct on ct.id = m.contact_id
    left join sender_accounts sa on sa.id = m.sender_account_id
    where m.id = ${messageId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    subject: row.subject,
    body: row.body,
    future_note: row.future_note,
    reply_classification: row.reply_classification,
    campaign_id: row.campaign_id,
    company: row.company_id
      ? {
          id: row.company_id,
          name: row.company_name,
          domain: row.company_domain,
          description: row.company_description,
          quality_rating: row.quality_rating,
          quality_notes: row.quality_notes,
        }
      : null,
    contact: row.contact_id
      ? {
          id: row.contact_id,
          name: row.contact_name,
          role: row.contact_role,
          email: row.contact_email,
          confidence:
            row.contact_confidence == null ? null : Number(row.contact_confidence),
        }
      : null,
    sender: row.sender_email
      ? {
          email: row.sender_email,
          name: row.sender_name,
          signature: row.sender_signature,
        }
      : null,
  };
}

async function getCompanyContext(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
  companyId: string,
) {
  const rows = await sql`
    select
      id::text as id,
      canonical_name as name,
      domain,
      website,
      industry,
      region,
      description,
      global_notes,
      quality_rating,
      quality_notes,
      do_not_contact
    from companies
    where id = ${companyId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function getContactContext(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
  contactId: string,
) {
  const rows = await sql`
    select
      id::text as id,
      company_id::text as company_id,
      full_name as name,
      role,
      email::text as email,
      linkedin_url,
      source,
      confidence,
      verification_status::text as verification_status,
      is_decision_maker,
      do_not_contact
    from contacts
    where id = ${contactId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function getCandidateContext(
  sql: NonNullable<ReturnType<typeof getPostgresClient>>,
  taskId: string,
) {
  const rows = await sql`
    select
      id::text as id,
      name,
      domain,
      website,
      industry,
      region,
      description,
      evidence_urls,
      suggested_contacts,
      fit_score,
      fit_reason,
      quality_rating,
      quality_reason,
      status,
      user_feedback
    from dom_task_company_candidates
    where task_id = ${taskId}
    order by created_at asc
    limit 100
  `;
  return rows;
}

function mapCampaignRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    organization: row.organization,
    description: row.description,
    value_proposition: row.value_proposition,
    status: row.status,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
  };
}

function mapTaskRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    description: row.description,
    status: row.status,
    created_by: row.created_by,
    context: row.context,
    result: row.result,
    progress_step: row.progress_step,
    progress_message: row.progress_message,
    progress_percent: row.progress_percent,
    result_preview: row.result_preview,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function stringifyResult(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function extractGptResultActions(input: GptResultInput) {
  const directActions = actionListOrEmpty(input.actions);
  if (directActions.length) return directActions;

  const result = asRecord(input.result);
  const resultActions = actionListOrEmpty(result.actions);
  if (resultActions.length) return resultActions;

  return actionListOrEmpty(asRecord(result.result).actions);
}

export function extractGptCompanyCandidates(input: GptResultInput) {
  if (input.companyCandidates) return input.companyCandidates;

  const result = asRecord(input.result);
  return (
    arrayOrNull(result.company_candidates) ??
    arrayOrNull(result.companies_added) ??
    arrayOrNull(asRecord(result.result).company_candidates) ??
    arrayOrNull(asRecord(result.result).companies_added) ??
    []
  );
}

function extractGptResultMessage(input: GptResultInput) {
  if (input.message !== undefined) return input.message;

  const result = asRecord(input.result);
  return stringOrNull(result.message) ?? stringOrNull(asRecord(result.result).message);
}

export function resolveGptResultStatus(input: GptResultInput) {
  const result = asRecord(input.result);
  const nestedStatus = gptResultStatusOrNull(result.status);

  if (input.status === "failed" || nestedStatus === "failed") return "failed";
  if (nestedStatus === "completed") return "completed";
  return input.status ?? nestedStatus ?? "completed";
}

function actionListOrEmpty(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function arrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function gptResultStatusOrNull(value: unknown) {
  return value === "completed" || value === "reviewing" || value === "failed"
    ? value
    : null;
}

function withTaskSourceMessageId(
  actions: Array<Record<string, unknown>>,
  taskContext: Record<string, unknown>,
) {
  const sourceMessageId = findContextString(taskContext, [
    "source_message_id",
    "message_id",
    "object_id",
  ]);

  if (!sourceMessageId) return actions;

  return actions.map((action) => {
    const type = String(action.type ?? "");
    if (
      !["create_draft", "update_reply_draft"].includes(type) ||
      action.source_message_id
    ) {
      return action;
    }

    return {
      ...action,
      source_message_id: sourceMessageId,
    };
  });
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as JsonInput;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function findContextString(context: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = stringOrNull(context[key]);
    if (direct) return direct;
    const gpt = asRecord(context.gpt);
    const gptValue = stringOrNull(gpt[key]);
    if (gptValue) return gptValue;
    const completion = asRecord(context.completion);
    const completionValue = stringOrNull(completion[key]);
    if (completionValue) return completionValue;
  }
  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
