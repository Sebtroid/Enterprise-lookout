import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import {
  createGptMemoryEvent,
  searchGptMemoryEvents,
} from "@/lib/gpt/repository";
import { aiMemorySourceTypes } from "@/lib/gpt/semantic-memory";

const sourceTypeSchema = z.enum(aiMemorySourceTypes);

const createMemorySchema = z.object({
  campaign_id: z.string().trim().optional(),
  company_id: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).optional(),
  contact_id: z.string().uuid().optional(),
  memory_text: z.string().trim().min(4).max(12_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sender_account_id: z.string().uuid().optional(),
  source_id: z.string().uuid().optional(),
  source_type: sourceTypeSchema.default("manual"),
});

const searchMemorySchema = z.object({
  campaign_id: z.string().trim().optional(),
  company_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(25).default(8),
  q: z.string().trim().min(3).max(4_000),
  source_type: z.array(sourceTypeSchema).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = searchMemorySchema.safeParse({
    campaign_id: req.nextUrl.searchParams.get("campaign_id") ?? undefined,
    company_id: req.nextUrl.searchParams.get("company_id") ?? undefined,
    contact_id: req.nextUrl.searchParams.get("contact_id") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    q: req.nextUrl.searchParams.get("q") ?? "",
    source_type: req.nextUrl.searchParams.getAll("source_type"),
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid memory search" }, { status: 400 });
  }

  try {
    const result = await searchGptMemoryEvents({
      campaignId: parsed.data.campaign_id,
      companyId: parsed.data.company_id,
      contactId: parsed.data.contact_id,
      limit: parsed.data.limit,
      query: parsed.data.q,
      sourceTypes: parsed.data.source_type,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[gpt/memory/events] search failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to search memory" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createMemorySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid memory payload" }, { status: 400 });
  }

  try {
    const event = await createGptMemoryEvent({
      campaignId: parsed.data.campaign_id,
      companyId: parsed.data.company_id,
      confidence: parsed.data.confidence,
      contactId: parsed.data.contact_id,
      memoryText: parsed.data.memory_text,
      metadata: parsed.data.metadata,
      senderAccountId: parsed.data.sender_account_id,
      sourceId: parsed.data.source_id,
      sourceType: parsed.data.source_type,
    });
    return NextResponse.json({ event, ok: true });
  } catch (error) {
    console.error("[gpt/memory/events] create failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to create memory" }, { status: 500 });
  }
}
