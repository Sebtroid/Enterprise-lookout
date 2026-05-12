import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { createGptJob } from "@/lib/gpt/repository";

const createJobSchema = z.object({
  campaign_id: z.string().trim().optional(),
  task_type: z.string().trim().max(80).optional(),
  description: z.string().trim().min(3).max(2_000),
  instructions: z.string().trim().max(8_000).optional(),
  object_type: z.string().trim().max(80).optional(),
  object_id: z.string().trim().max(160).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createJobSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid job payload" }, { status: 400 });
  }

  try {
    const job = await createGptJob({
      campaignId: parsed.data.campaign_id,
      taskType: parsed.data.task_type,
      description: parsed.data.description,
      instructions: parsed.data.instructions,
      objectType: parsed.data.object_type,
      objectId: parsed.data.object_id,
      priority: parsed.data.priority,
    });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error("[gpt/jobs/create] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to create job" }, { status: 500 });
  }
}
