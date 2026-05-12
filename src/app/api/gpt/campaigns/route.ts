import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { listGptCampaigns } from "@/lib/gpt/repository";

export async function GET(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await listGptCampaigns();
    return NextResponse.json({ ok: true, campaigns });
  } catch (error) {
    console.error("[gpt/campaigns] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to list campaigns" }, { status: 500 });
  }
}
