import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { getGptJobContext } from "@/lib/gpt/repository";

export async function GET(
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

  try {
    const jobContext = await getGptJobContext(jobId);
    if (!jobContext) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...jobContext });
  } catch (error) {
    console.error("[gpt/jobs/context] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to load job context" }, { status: 500 });
  }
}
