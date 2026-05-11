type TelegramNotificationConfig = {
  token: string;
  chatId: string;
};

type PostDomTelegramNotificationInput = {
  token?: string | null;
  chatId?: string | null;
  eventType: string;
  campaignId?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type DomTelegramNotificationResult =
  | {
      ok: true;
      status: number;
      data: unknown;
    }
  | {
      ok: false;
      skipped: true;
      reason: "missing_telegram_config";
    }
  | {
      ok: false;
      status?: number;
      data?: unknown;
      error: string;
    };

export function getDomTelegramConfig(
  token: string | null | undefined = process.env.TELEGRAM_BOT_TOKEN,
  chatId: string | null | undefined =
    process.env.TELEGRAM_GROUP_ID || process.env.TELEGRAM_CHAT_ID,
): TelegramNotificationConfig | null {
  const normalizedToken = normalizeEnvValue(token);
  const normalizedChatId = normalizeEnvValue(chatId);
  if (!normalizedToken || !normalizedChatId) return null;
  return { token: normalizedToken, chatId: normalizedChatId };
}

export function buildDomTelegramEventMessage({
  campaignId,
  eventType,
}: {
  eventType: string;
  campaignId?: string | null;
}) {
  return `\u{1F514} Dom - Nuevo evento: ${eventType} - Campaign: ${campaignId || "N/A"}`;
}

export async function postDomTelegramNotification({
  campaignId,
  chatId,
  eventType,
  fetchImpl = fetch,
  timeoutMs = 3_000,
  token,
}: PostDomTelegramNotificationInput): Promise<DomTelegramNotificationResult> {
  const config = getDomTelegramConfig(token, chatId);
  if (!config) {
    return { ok: false, skipped: true, reason: "missing_telegram_config" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: buildDomTelegramEventMessage({ campaignId, eventType }),
        }),
        signal: controller.signal,
      },
    );
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: `HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyDomViaTelegramForAgentEvent({
  campaignId,
  eventType,
}: {
  eventType: string;
  campaignId?: string | null;
}) {
  return postDomTelegramNotification({ campaignId, eventType });
}

function normalizeEnvValue(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\\n+$/g, "").trim();
  return normalized || null;
}
