import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { postDomTelegramNotification } from "@/lib/dom/telegram";

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType =
      req.headers.get("x-event-type") || String(body.event_type || body.event || "unknown");
    const campaignId = stringOrNull(body.campaign_id) ?? stringOrNull(body.campaignId);

    const telegram = await postDomTelegramNotification({
      campaignId,
      eventType,
    });

    if (!telegram.ok && !("skipped" in telegram)) {
      console.error("Telegram notify failed:", telegram.error);
    }

    return NextResponse.json({ ok: true, telegram }, { status: telegram.ok ? 200 : 202 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
