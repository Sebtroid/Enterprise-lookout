import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { submitGptJobResult } from "@/lib/gpt/repository";

const resultSchema = z.object({
  status: z.enum(["completed", "reviewing", "failed"]).optional(),
  result: z.unknown().optional(),
  company_candidates: z.array(z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).optional(),
  message: z.string().trim().max(4_000).nullable().optional(),
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

  const parsed = resultSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid result payload" }, { status: 400 });
  }

  try {
    const result = await submitGptJobResult(jobId, {
      status: parsed.data.status,
      result: parsed.data.result,
      companyCandidates: parsed.data.company_candidates,
      actions: parsed.data.actions,
      message: parsed.data.message,
    });
    if (!result) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[gpt/jobs/result] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to submit result" }, { status: 500 });
  }
}
