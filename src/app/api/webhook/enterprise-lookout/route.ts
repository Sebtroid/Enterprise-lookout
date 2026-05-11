import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8719614783:AAGLL20CrOrLY3KPReb0_kd0yaiMBPjzXjQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8070013841";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = req.headers.get("x-event-type") || String(body.event_type || body.event || "unknown");
    const campaignId = body.campaign_id || body.campaignId || "";
    
    // Notificar por Telegram instantáneamente
    const message = `🔔 *Dom — Nuevo evento*: \`${eventType}\`\n\nCampaign: \`${campaignId}\`\n\n\`\`\`json\n${JSON.stringify(body, null, 2).slice(0, 3500)}\n\`\`\``;
    
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!tgRes.ok) {
      console.error("Telegram notify failed:", await tgRes.text());
    }
    
    return NextResponse.json({ ok: true, notified: tgRes.ok });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
