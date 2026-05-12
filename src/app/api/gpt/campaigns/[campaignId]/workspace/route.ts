import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { getGptCampaignWorkspace } from "@/lib/gpt/repository";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { campaignId } = await context.params;
  try {
    const workspace = await getGptCampaignWorkspace(campaignId);
    if (!workspace) {
      return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...workspace });
  } catch (error) {
    console.error("[gpt/campaign-workspace] failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to load workspace" }, { status: 500 });
  }
}
