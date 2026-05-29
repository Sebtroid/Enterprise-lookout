import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { backfillAiMemoryEmbeddings } from "@/lib/gpt/semantic-memory";

const backfillSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = backfillSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid backfill payload" }, { status: 400 });
  }

  const result = await backfillAiMemoryEmbeddings({ limit: parsed.data.limit });
  return NextResponse.json({ ok: !result.databaseError, ...result });
}
