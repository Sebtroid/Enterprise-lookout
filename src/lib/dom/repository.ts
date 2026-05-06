import { isAllCampaignsScope } from "@/lib/prospecting/repository";
import { getPostgresClient } from "@/lib/supabase/postgres";

import type {
  DomCampaignContext,
  DomChatMessage,
  DomChatThread,
  DomTask,
} from "./types";

type DbRow = Record<string, unknown>;

export type DomWorkspaceData = {
  campaign: DomCampaignContext | null;
  tasks: DomTask[];
  thread: DomChatThread | null;
  messages: DomChatMessage[];
};

export async function getDomWorkspaceData(scope: string): Promise<DomWorkspaceData> {
  const campaign = isAllCampaignsScope(scope)
    ? null
    : await getDomCampaignContextBySlug(scope);
  const tasks = await getDomTasksData(scope);
  const thread = campaign ? await ensureDomChatThread(campaign.dbId, campaign.name) : null;
  const messages = thread ? await getDomChatMessages(thread.id) : [];

  return { campaign, tasks, thread, messages };
}

export async function getDomCampaignContextBySlug(scope: string) {
  if (!scope || isAllCampaignsScope(scope)) return null;
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
          dt.chat_thread_id::text as chat_thread_id
        from dom_tasks dt
        left join campaigns c on c.id = dt.campaign_id
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
          dt.chat_thread_id::text as chat_thread_id
        from dom_tasks dt
        join campaigns c on c.id = dt.campaign_id
        where c.slug = ${scope}
        order by dt.updated_at desc, dt.created_at desc
      `;

  return rows.map(mapDomTask);
}

export async function getActiveDomTasksForCampaign(campaignDbId: string) {
  const sql = getPostgresClient();
  if (!sql) return [];

  const rows = await sql`
    select
      id::text as id,
      description,
      status::text as status,
      result
    from dom_tasks
    where campaign_id = ${campaignDbId}
      and status in ('pending', 'in_progress', 'blocked')
    order by updated_at desc, created_at desc
    limit 20
  `;

  return rows.map((row) => ({
    id: stringValue(row.id),
    description: stringValue(row.description),
    status: stringValue(row.status) as DomTask["status"],
    result: nullableString(row.result),
  }));
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
    status: stringValue(row.status) as DomTask["status"],
    createdBy: stringValue(row.created_by) as DomTask["createdBy"],
    createdAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
    context: jsonObject(row.context),
    result: nullableString(row.result),
    chatThreadId: nullableString(row.chat_thread_id),
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

function nullableDate(value: unknown) {
  const text = stringValue(value).slice(0, 10);
  return text || null;
}

function isoValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = stringValue(value);
  return text || new Date(0).toISOString();
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
