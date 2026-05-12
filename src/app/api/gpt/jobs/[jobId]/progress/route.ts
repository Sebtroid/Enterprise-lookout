import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { DOM_TASK_STATUSES } from "@/lib/dom/status";
import { updateGptJobProgress } from "@/lib/gpt/repository";

const progressSchema = z.object({
  status: z.enum(DOM_TASK_STATUSES),
  step: z.string().trim().max(120).nullable().optional(),
  message: z.string().trim().max(2_000).nullable().optional(),
  percent: z.number().min(0).max(100).nullable().optional(),
  result_preview: z.string().trim().max(2_000).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });
  }

  const parsed = progressSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid progress payload" }, { status: 400 });
  }

  try {
    const job = await updateGptJobProgress(jobId, {
      status: parsed.data.status,
      step: parsed.data.step,
      message: parsed.data.message,
      percent: parsed.data.percent,
      resultPreview: parsed.data.result_preview,
    });
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error("[gpt/jobs/progress] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to update progress" }, { status: 500 });
  }
}
