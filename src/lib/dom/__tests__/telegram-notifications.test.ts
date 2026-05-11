import { describe, expect, it, vi } from "vitest";

import {
  buildDomTelegramEventMessage,
  postDomTelegramNotification,
} from "@/lib/dom/telegram";

describe("Dom Telegram notifications", () => {
  it("formats a concise event wake-up message", () => {
    expect(
      buildDomTelegramEventMessage({
        campaignId: "campaign-1",
        eventType: "draft_needed",
      }),
    ).toBe("\u{1F514} Dom - Nuevo evento: draft_needed - Campaign: campaign-1");
  });

  it("posts the event notification to Telegram", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }, { status: 200 }));

    const result = await postDomTelegramNotification({
      campaignId: "campaign-1",
      chatId: "-100123",
      eventType: "dom_task_created",
      fetchImpl,
      token: "telegram-token",
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/sendMessage",
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: "-100123",
          text: "\u{1F514} Dom - Nuevo evento: dom_task_created - Campaign: campaign-1",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  });

  it("skips without complete Telegram config", async () => {
    const fetchImpl = vi.fn();

    const result = await postDomTelegramNotification({
      campaignId: null,
      chatId: "",
      eventType: "mail_approved",
      fetchImpl,
      token: "telegram-token",
    });

    expect(result).toEqual({
      ok: false,
      skipped: true,
      reason: "missing_telegram_config",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
