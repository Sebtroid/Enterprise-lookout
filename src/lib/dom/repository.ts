import {
  getCampaignsData,
  isAllCampaignsScope,
} from "@/lib/prospecting/repository";
import {
  getContextSlugFromScope,
  isContextScope,
  slugifyContextName,
} from "@/lib/prospecting/context";
import { getPostgresClient } from "@/lib/supabase/postgres";

import type {
  DomCampaignContext,
  DomChatMessage,
  DomChatThread,
  DomCompanyCandidate,
  DomTask,
} from "./types";
import { isActiveDomTaskStatus, normalizeDomTaskStatus } from "./status";

type DbRow = Record<string, unknown>;

export type DomWorkspaceData = {
  campaign: DomCampaignContext | null;
  tasks: DomTask[];
  companyCandidates: DomCompanyCandidate[];
  thread: DomChatThread | null;
  messages: DomChatMessage[];
};

export async function getDomWorkspaceData(scope: string): Promise<DomWorkspaceData> {
  const campaign = isAllCampaignsScope(scope) || isContextScope(scope)
    ? null
    : await getDomCampaignContextBySlug(scope);
  const tasks = await getDomTasksData(scope);
  const companyCandidates = await getDomCompanyCandidatesData(scope);
  const thread = campaign ? await ensureDomChatThread(campaign.dbId, campaign.name) : null;
  const messages = thread ? await getDomChatMessages(thread.id) : [];

  return { campaign, tasks, companyCandidates, thread, messages };
}

export async function getDomCampaignContextBySlug(scope: string) {
  if (!scope || isAllCampaignsScope(scope) || isContextScope(scope)) return null;
  const sql = getPostgresClient();
  if (!sql) return null;

  const rows = await sql`
    select
      id::text as db_id,
      slug,
      name,
      organization,
      coalesce(description, '') as description,
      coalesce(value_proposition, '') as value_proposition,
      starts_on,
      status::text as status
    from campaigns
    where slug = ${scope}
    limit 1
  `;

  return rows[0] ? mapCampaignContext(rows[0]) : null;
}

export async function getDomCampaignContextById(campaignId: string) {
  const sql = getPostgresClient();
  if (!sql) return null;

  const rows = await sql`
    select
      id::text as db_id,
      slug,
      name,
      organization,
      coalesce(description, '') as description,
      coalesce(value_proposition, '') as value_proposition,
      starts_on,
      status::text as status
    from campaigns
    where id = ${campaignId}
    limit 1
  `;

  return rows[0] ? mapCampaignContext(rows[0]) : null;
}

export async function ensureDomChatThread(
  campaignDbId: string,
  title?: string | null,
) {
  const sql = getPostgresClient();
  if (!sql) return null;

  const rows = await sql`
    insert into chat_threads (
      campaign_id,
      title
    ) values (
      ${campaignDbId},
      ${title ?? null}
    )
    on conflict (campaign_id) do update
    set
      title = coalesce(chat_threads.title, excluded.title),
      updated_at = now()
    returning
      id::text as id,
      campaign_id::text as campaign_id,
      title,
      created_at,
      updated_at
  `;

  return rows[0] ? mapChatThread(rows[0]) : null;
}

export async function getDomTasksData(scope: string) {
  const sql = getPostgresClient();
  if (!sql) return [];

  const contextOrganizations = await getContextOrganizationsForScope(scope);
  const rows = isAllCampaignsScope(scope)
    ? await sql`
        select
          dt.id::text as id,
          c.slug as campaign_id,
          c.name as campaign_name,
          dt.description,
          dt.status::text as status,
          dt.created_by,
          dt.created_at,
          dt.updated_at,
          dt.context,
          dt.result,
          dt.chat_thread_id::text as chat_thread_id,
          dt.progress_step,
          dt.progress_message,
          dt.progress_percent,
          dt.result_preview,
          dt.last_progress_at,
          coalesce(candidate_counts.candidate_count, 0)::int as candidate_count,
          coalesce(candidate_counts.pending_candidate_count, 0)::int as pending_candidate_count
        from dom_tasks dt
        left join campaigns c on c.id = dt.campaign_id
        left join lateral (
          select
            count(*)::int as candidate_count,
            count(*) filter (where status = 'pending')::int as pending_candidate_count
          from dom_task_company_candidates dcc
          where dcc.task_id = dt.id
        ) candidate_counts on true
        order by dt.updated_at desc, dt.created_at desc
      `
    : isContextScope(scope)
      ? await sql`
        select
          dt.id::text as id,
          c.slug as campaign_id,
          c.name as campaign_name,
          dt.description,
          dt.status::text as status,
          dt.created_by,
          dt.created_at,
          dt.updated_at,
          dt.context,
          dt.result,
          dt.chat_thread_id::text as chat_thread_id,
          dt.progress_step,
          dt.progress_message,
          dt.progress_percent,
          dt.result_preview,
          dt.last_progress_at,
          coalesce(candidate_counts.candidate_count, 0)::int as candidate_count,
          coalesce(candidate_counts.pending_candidate_count, 0)::int as pending_candidate_count
        from dom_tasks dt
        join campaigns c on c.id = dt.campaign_id
        left join lateral (
          select
            count(*)::int as candidate_count,
            count(*) filter (where status = 'pending')::int as pending_candidate_count
          from dom_task_company_candidates dcc
          where dcc.task_id = dt.id
        ) candidate_counts on true
        where ${
          contextOrganizations.length
            ? sql`c.organization = any(${contextOrganizations}::text[])`
            : sql`false`
        }
        order by dt.updated_at desc, dt.created_at desc
      `
    : await sql`
        select
          dt.id::text as id,
          c.slug as campaign_id,
          c.name as campaign_name,
          dt.description,
          dt.status::text as status,
          dt.created_by,
          dt.created_at,
          dt.updated_at,
          dt.context,
          dt.result,
          dt.chat_thread_id::text as chat_thread_id,
          dt.progress_step,
          dt.progress_message,
          dt.progress_percent,
          dt.result_preview,
          dt.last_progress_at,
          coalesce(candidate_counts.candidate_count, 0)::int as candidate_count,
          coalesce(candidate_counts.pending_candidate_count, 0)::int as pending_candidate_count
        from dom_tasks dt
        join campaigns c on c.id = dt.campaign_id
        left join lateral (
          select
            count(*)::int as candidate_count,
            count(*) filter (where status = 'pending')::int as pending_candidate_count
          from dom_task_company_candidates dcc
          where dcc.task_id = dt.id
        ) candidate_counts on true
        where c.slug = ${scope}
        order by dt.updated_at desc, dt.created_at desc
      `;

  return rows.map(mapDomTask);
}

export async function getDomCompanyCandidatesData(scope: string) {
  const sql = getPostgresClient();
  if (!sql) return [];

  const contextOrganizations = await getContextOrganizationsForScope(scope);
  const rows = isAllCampaignsScope(scope)
    ? await sql`
        select
          dcc.id::text as id,
          dcc.task_id::text as task_id,
          c.slug as campaign_id,
          c.name as campaign_name,
          dcc.company_id::text as company_id,
          dcc.name,
          dcc.domain,
          dcc.website,
          dcc.industry,
          dcc.region,
          dcc.description,
          dcc.evidence_urls,
          dcc.suggested_contacts,
          dcc.fit_score,
          dcc.fit_reason,
          dcc.quality_rating,
          dcc.quality_reason,
          dcc.status,
          dcc.user_feedback,
          dcc.reviewed_at,
          dcc.created_at,
          dcc.updated_at
        from dom_task_company_candidates dcc
        join dom_tasks dt on dt.id = dcc.task_id
        left join campaigns c on c.id = coalesce(dcc.campaign_id, dt.campaign_id)
        order by (dcc.status = 'pending') desc, dcc.updated_at desc
      `
    : isContextScope(scope)
      ? await sql`
        select
          dcc.id::text as id,
          dcc.task_id::text as task_id,
          c.slug as campaign_id,
          c.name as campaign_name,
          dcc.company_id::text as company_id,
          dcc.name,
          dcc.domain,
          dcc.website,
          dcc.industry,
          dcc.region,
          dcc.description,
          dcc.evidence_urls,
          dcc.suggested_contacts,
          dcc.fit_score,
          dcc.fit_reason,
          dcc.quality_rating,
          dcc.quality_reason,
          dcc.status,
          dcc.user_feedback,
          dcc.reviewed_at,
          dcc.created_at,
          dcc.updated_at
        from dom_task_company_candidates dcc
        join dom_tasks dt on dt.id = dcc.task_id
        join campaigns c on c.id = coalesce(dcc.campaign_id, dt.campaign_id)
        where ${
          contextOrganizations.length
            ? sql`c.organization = any(${contextOrganizations}::text[])`
            : sql`false`
        }
        order by (dcc.status = 'pending') desc, dcc.updated_at desc
      `
    : await sql`
        select
          dcc.id::text as id,
          dcc.task_id::text as task_id,
          c.slug as campaign_id,
          c.name as campaign_name,
          dcc.company_id::text as company_id,
          dcc.name,
          dcc.domain,
          dcc.website,
          dcc.industry,
          dcc.region,
          dcc.description,
          dcc.evidence_urls,
          dcc.suggested_contacts,
          dcc.fit_score,
          dcc.fit_reason,
          dcc.quality_rating,
          dcc.quality_reason,
          dcc.status,
          dcc.user_feedback,
          dcc.reviewed_at,
          dcc.created_at,
          dcc.updated_at
        from dom_task_company_candidates dcc
        join dom_tasks dt on dt.id = dcc.task_id
        join campaigns c on c.id = coalesce(dcc.campaign_id, dt.campaign_id)
        where c.slug = ${scope}
        order by (dcc.status = 'pending') desc, dcc.updated_at desc
      `;

  return rows.map(mapDomCompanyCandidate);
}

async function getContextOrganizationsForScope(scope: string) {
  if (!isContextScope(scope)) return [];

  const contextSlug = getContextSlugFromScope(scope);
  const campaigns = await getCampaignsData();
  return [
    ...new Set(
      campaigns
        .filter((campaign) => slugifyContextName(campaign.organization) === contextSlug)
        .map((campaign) => campaign.organization),
    ),
  ];
}

export async function getActiveDomTasksForCampaign(campaignDbId: string) {
  const sql = getPostgresClient();
  if (!sql) return [];

  const rows = await sql`
    select
      id::text as id,
      description,
      status::text as status,
      result,
      progress_step,
      progress_message,
      progress_percent,
      result_preview,
      last_progress_at
    from dom_tasks
    where campaign_id = ${campaignDbId}
      and status in (
        'pending',
        'received',
        'in_progress',
        'researching',
        'drafting',
        'reviewing'
      )
    order by updated_at desc, created_at desc
    limit 20
  `;

  return rows
    .map((row) => {
      const status = normalizeDomTaskStatus(row.status);
      return {
        id: stringValue(row.id),
        description: stringValue(row.description),
        status,
        result: nullableString(row.result),
        progressStep: nullableString(row.progress_step),
        progressMessage: nullableString(row.progress_message),
        progressPercent: nullableNumber(row.progress_percent),
        resultPreview: nullableString(row.result_preview),
        lastProgressAt: nullableIsoValue(row.last_progress_at),
        candidateCount: 0,
        pendingCandidateCount: 0,
      };
    })
    .filter((task) => isActiveDomTaskStatus(task.status));
}

export async function getDomChatMessages(threadId: string) {
  const sql = getPostgresClient();
  if (!sql) return [];

  const rows = await sql`
    select
      id::text as id,
      thread_id::text as thread_id,
      role::text as role,
      content,
      metadata,
      created_at
    from chat_messages
    where thread_id = ${threadId}
    order by created_at asc
    limit 200
  `;

  return rows.map(mapChatMessage);
}

export async function getRecentDomChatHistory(threadId: string, limit = 20) {
  const sql = getPostgresClient();
  if (!sql) return [];

  const rows = await sql`
    select role::text as role, content
    from chat_messages
    where thread_id = ${threadId}
      and role in ('user', 'dom')
    order by created_at desc
    limit ${limit}
  `;

  return rows
    .reverse()
    .map((row) => ({
      role: stringValue(row.role) as "user" | "dom",
      content: stringValue(row.content),
    }));
}

function mapCampaignContext(row: DbRow): DomCampaignContext {
  const valueProposition = stringValue(row.value_proposition);

  return {
    dbId: stringValue(row.db_id),
    id: stringValue(row.slug),
    name: stringValue(row.name),
    organization: stringValue(row.organization),
    description: stringValue(row.description),
    valueProposition,
    needs: extractNeeds(valueProposition),
    date: nullableDate(row.starts_on),
    status: stringValue(row.status),
  };
}

function mapDomTask(row: DbRow): DomTask {
  return {
    id: stringValue(row.id),
    campaignId: nullableString(row.campaign_id),
    campaignName: nullableString(row.campaign_name),
    description: stringValue(row.description),
    status: normalizeDomTaskStatus(row.status),
    createdBy: stringValue(row.created_by) as DomTask["createdBy"],
    createdAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
    context: jsonObject(row.context),
    result: nullableString(row.result),
    chatThreadId: nullableString(row.chat_thread_id),
    progressStep: nullableString(row.progress_step),
    progressMessage: nullableString(row.progress_message),
    progressPercent: nullableNumber(row.progress_percent),
    resultPreview: nullableString(row.result_preview),
    lastProgressAt: nullableIsoValue(row.last_progress_at),
    candidateCount: numberValue(row.candidate_count),
    pendingCandidateCount: numberValue(row.pending_candidate_count),
  };
}

function mapDomCompanyCandidate(row: DbRow): DomCompanyCandidate {
  return {
    id: stringValue(row.id),
    taskId: stringValue(row.task_id),
    campaignId: nullableString(row.campaign_id),
    campaignName: nullableString(row.campaign_name),
    companyId: nullableString(row.company_id),
    name: stringValue(row.name),
    domain: nullableString(row.domain),
    website: nullableString(row.website),
    industry: nullableString(row.industry),
    region: nullableString(row.region),
    description: nullableString(row.description),
    evidenceUrls: stringArray(row.evidence_urls),
    suggestedContacts: suggestedContactArray(row.suggested_contacts),
    fitScore: numberValue(row.fit_score),
    fitReason: nullableString(row.fit_reason),
    qualityRating: numberValue(row.quality_rating) || 3,
    qualityReason: nullableString(row.quality_reason),
    status: stringValue(row.status) as DomCompanyCandidate["status"],
    userFeedback: nullableString(row.user_feedback),
    reviewedAt: nullableIsoValue(row.reviewed_at),
    createdAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
  };
}

function mapChatThread(row: DbRow): DomChatThread {
  return {
    id: stringValue(row.id),
    campaignId: stringValue(row.campaign_id),
    title: nullableString(row.title),
    createdAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
  };
}

function mapChatMessage(row: DbRow): DomChatMessage {
  return {
    id: stringValue(row.id),
    threadId: stringValue(row.thread_id),
    role: stringValue(row.role) as DomChatMessage["role"],
    content: stringValue(row.content),
    metadata: jsonObject(row.metadata),
    createdAt: isoValue(row.created_at),
  };
}

function extractNeeds(value: string) {
  return value
    .split(/[,;\n]|\sy\s/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim();
  return text || null;
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberValue(value: unknown) {
  return nullableNumber(value) ?? 0;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => nullableString(item))
    .filter((item): item is string => Boolean(item));
}

function suggestedContactArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : {};
    return {
      name: stringValue(row.name),
      role: nullableString(row.role),
      email: nullableString(row.email),
      confidence: numberValue(row.confidence),
      source: nullableString(row.source),
    };
  });
}

function nullableDate(value: unknown) {
  const text = stringValue(value).slice(0, 10);
  return text || null;
}

function isoValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = stringValue(value);
  return text || new Date(0).toISOString();
}

function nullableIsoValue(value: unknown) {
  if (value == null || value === "") return null;
  return isoValue(value);
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
