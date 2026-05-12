import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { claimNextGptJobs } from "@/lib/gpt/repository";

const claimJobsSchema = z.object({
  campaign_id: z.string().trim().optional(),
  worker_id: z.string().trim().max(160).optional(),
  task_types: z.array(z.string().trim().max(80)).max(20).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = claimJobsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid claim payload" }, { status: 400 });
  }

  try {
    const jobs = await claimNextGptJobs({
      campaignId: parsed.data.campaign_id,
      workerId: parsed.data.worker_id,
      taskTypes: parsed.data.task_types,
      limit: parsed.data.limit,
    });
    return NextResponse.json({ ok: true, count: jobs.length, jobs });
  } catch (error) {
    console.error("[gpt/jobs/claim] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to claim jobs" }, { status: 500 });
  }
}
