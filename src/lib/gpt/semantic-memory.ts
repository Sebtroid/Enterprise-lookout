import {
  createEmbedding,
  getEmbeddingModel,
  type EmbeddingResult,
} from "@/lib/ai/embeddings";
import { getPostgresClient } from "@/lib/supabase/postgres";

type SqlClient = NonNullable<ReturnType<typeof getPostgresClient>>;
type JsonInput = Parameters<SqlClient["json"]>[0];

export const aiMemorySourceTypes = [
  "approved_message",
  "dom_task",
  "gpt_result",
  "manual",
  "no_reply",
  "outbound_feedback",
  "reply_feedback",
] as const;

export type AiMemorySourceType = (typeof aiMemorySourceTypes)[number];

export type AiMemoryEventInput = {
  campaignId?: string | null;
  companyId?: string | null;
  confidence?: number | null;
  contactId?: string | null;
  createdBy?: string | null;
  memoryText: string;
  metadata?: Record<string, unknown> | null;
  senderAccountId?: string | null;
  sourceId?: string | null;
  sourceType: AiMemorySourceType;
};

export type AiMemorySearchInput = {
  campaignId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  limit?: number;
  query: string;
  sourceTypes?: AiMemorySourceType[];
};

export type AiMemoryEvent = {
  campaign_id: string | null;
  company_id: string | null;
  confidence: number | null;
  contact_id: string | null;
  created_at: string;
  id: string;
  memory_text: string;
  metadata: unknown;
  sender_account_id: string | null;
  similarity?: number;
  source_id: string | null;
  source_type: string;
};

export async function createAiMemoryEvent(input: AiMemoryEventInput) {
  const sql = getPostgresClient();
  if (!sql) return null;

  const memoryText = normalizeMemoryText(input.memoryText);
  if (!memoryText) return null;

  const embedding = await createEmbedding(memoryText);
  const metadata = buildMemoryMetadata(input.metadata, embedding);

  try {
    const rows = await sql`
      insert into ai_memory_events (
        campaign_id,
        company_id,
        contact_id,
        sender_account_id,
        source_type,
        source_id,
        memory_text,
        embedding,
        embedding_model,
        metadata,
        confidence,
        created_by
      ) values (
        ${nullIfBlank(input.campaignId)},
        ${nullIfBlank(input.companyId)},
        ${nullIfBlank(input.contactId)},
        ${nullIfBlank(input.senderAccountId)},
        ${input.sourceType},
        ${nullIfBlank(input.sourceId)},
        ${memoryText},
        ${embedding.ok ? toPgVectorLiteral(embedding.embedding) : null}::vector,
        ${embedding.ok ? embedding.model : getEmbeddingModel()},
        ${sql.json(metadata as JsonInput)}::jsonb,
        ${clampConfidence(input.confidence ?? 0.7)},
        ${input.createdBy?.trim() || "system"}
      )
      on conflict (source_type, source_id) do update set
        campaign_id = excluded.campaign_id,
        company_id = excluded.company_id,
        contact_id = excluded.contact_id,
        sender_account_id = excluded.sender_account_id,
        memory_text = excluded.memory_text,
        embedding = excluded.embedding,
        embedding_model = excluded.embedding_model,
        metadata = excluded.metadata,
        confidence = excluded.confidence,
        active = true,
        updated_at = now()
      returning
        id::text as id,
        campaign_id::text as campaign_id,
        company_id::text as company_id,
        contact_id::text as contact_id,
        sender_account_id::text as sender_account_id,
        source_type,
        source_id::text as source_id,
        memory_text,
        metadata,
        confidence,
        created_at::text as created_at
    `;

    return rows[0] ? mapMemoryEvent(rows[0]) : null;
  } catch (error) {
    if (!isMissingSemanticMemoryStorage(error)) {
      console.error("[ai_memory_events] create failed:", error);
    }
    return null;
  }
}

export async function searchAiMemoryEvents(input: AiMemorySearchInput) {
  const sql = getPostgresClient();
  if (!sql) return { embeddingError: "Database unavailable.", events: [] };

  const query = normalizeMemoryText(input.query);
  if (!query) return { events: [] };

  const embedding = await createEmbedding(query);
  if (!embedding.ok) {
    return { embeddingError: embedding.error, events: [] };
  }

  const limit = Math.min(Math.max(input.limit ?? 8, 1), 25);
  const sourceTypes = input.sourceTypes?.length ? input.sourceTypes : null;

  try {
    const rows = await sql`
      select
        id::text as id,
        campaign_id::text as campaign_id,
        company_id::text as company_id,
        contact_id::text as contact_id,
        sender_account_id::text as sender_account_id,
        source_type,
        source_id::text as source_id,
        memory_text,
        metadata,
        confidence,
        1 - (embedding <=> ${toPgVectorLiteral(embedding.embedding)}::vector) as similarity,
        created_at::text as created_at
      from ai_memory_events
      where active = true
        and embedding is not null
        and (${nullIfBlank(input.campaignId)}::uuid is null or campaign_id = ${nullIfBlank(input.campaignId)}::uuid or campaign_id is null)
        and (${nullIfBlank(input.companyId)}::uuid is null or company_id = ${nullIfBlank(input.companyId)}::uuid or company_id is null)
        and (${nullIfBlank(input.contactId)}::uuid is null or contact_id = ${nullIfBlank(input.contactId)}::uuid or contact_id is null)
        ${sourceTypes ? sql`and source_type = any(${sourceTypes})` : sql``}
      order by embedding <=> ${toPgVectorLiteral(embedding.embedding)}::vector
      limit ${limit}
    `;

    return { events: rows.map(mapMemoryEvent) };
  } catch (error) {
    if (!isMissingSemanticMemoryStorage(error)) {
      console.error("[ai_memory_events] search failed:", error);
    }
    return {
      databaseError: error instanceof Error ? error.message : "Memory search failed.",
      events: [],
    };
  }
}

export async function listRecentAiMemoryEvents({
  campaignId,
  limit = 10,
}: {
  campaignId?: string | null;
  limit?: number;
} = {}) {
  const sql = getPostgresClient();
  if (!sql) return [];

  try {
    const rows = await sql`
      select
        id::text as id,
        campaign_id::text as campaign_id,
        company_id::text as company_id,
        contact_id::text as contact_id,
        sender_account_id::text as sender_account_id,
        source_type,
        source_id::text as source_id,
        memory_text,
        metadata,
        confidence,
        created_at::text as created_at
      from ai_memory_events
      where active = true
        ${campaignId ? sql`and (campaign_id = ${campaignId} or campaign_id is null)` : sql``}
      order by created_at desc
      limit ${Math.min(Math.max(limit, 1), 50)}
    `;
    return rows.map(mapMemoryEvent);
  } catch (error) {
    if (!isMissingSemanticMemoryStorage(error)) {
      console.error("[ai_memory_events] list failed:", error);
    }
    return [];
  }
}

export function buildMemoryText(parts: Array<string | null | undefined>) {
  return normalizeMemoryText(parts.filter(Boolean).join("\n\n"));
}

export function normalizeMemoryText(value: string) {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function toPgVectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => formatVectorNumber(value)).join(",")}]`;
}

function buildMemoryMetadata(
  metadata: Record<string, unknown> | null | undefined,
  embedding: EmbeddingResult,
) {
  return {
    ...(metadata ?? {}),
    embedding: embedding.ok
      ? {
          model: embedding.model,
          status: "ready",
        }
      : {
          error: embedding.error,
          model: embedding.model,
          status: "missing",
        },
  };
}

function mapMemoryEvent(row: Record<string, unknown>): AiMemoryEvent {
  return {
    campaign_id: stringOrNull(row.campaign_id),
    company_id: stringOrNull(row.company_id),
    confidence: row.confidence == null ? null : Number(row.confidence),
    contact_id: stringOrNull(row.contact_id),
    created_at: String(row.created_at ?? ""),
    id: String(row.id ?? ""),
    memory_text: String(row.memory_text ?? ""),
    metadata: row.metadata ?? null,
    sender_account_id: stringOrNull(row.sender_account_id),
    similarity: row.similarity == null ? undefined : Number(row.similarity),
    source_id: stringOrNull(row.source_id),
    source_type: String(row.source_type ?? ""),
  };
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(Math.max(value, 0), 1);
}

function formatVectorNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value).toFixed(8).replace(/0+$/u, "").replace(/\.$/u, "");
}

function isMissingSemanticMemoryStorage(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : null;
  return code === "42P01" || code === "42704";
}

function nullIfBlank(value: string | null | undefined) {
  return value?.trim() || null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
