import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import {
  createGptMemoryRule,
  listGptMemoryRules,
} from "@/lib/gpt/repository";

const createRuleSchema = z.object({
  campaign_id: z.string().trim().optional(),
  scope: z.enum(["global", "campaign", "company", "contact", "sender"]).optional(),
  rule_type: z.string().trim().max(80).optional(),
  rule_text: z.string().trim().min(3).max(2_000),
  source: z.string().trim().max(160).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rules = await listGptMemoryRules({
      campaignId: req.nextUrl.searchParams.get("campaign_id"),
      ruleType: req.nextUrl.searchParams.get("rule_type"),
    });
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    console.error("[gpt/memory/rules] list failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to list rules" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createRuleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid rule payload" }, { status: 400 });
  }

  try {
    const rule = await createGptMemoryRule({
      campaignId: parsed.data.campaign_id,
      scope: parsed.data.scope,
      ruleType: parsed.data.rule_type,
      ruleText: parsed.data.rule_text,
      source: parsed.data.source,
      confidence: parsed.data.confidence,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    console.error("[gpt/memory/rules] create failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to create rule" }, { status: 500 });
  }
}
