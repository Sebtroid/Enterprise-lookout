import type {
  DomApiResponse,
  DomCampaignContext,
  DomUser,
  DomWebhookPayload,
} from "./types";

export type DomWebhookPriority = "low" | "normal" | "high" | "urgent";

type BuildDomWebhookPayloadInput = {
  eventType: string;
  eventId: string;
  timestamp?: string;
  payload: Record<string, unknown>;
  campaign: DomCampaignContext;
  user: DomUser;
  priority?: DomWebhookPriority;
};

export function buildDomWebhookPayload({
  campaign,
  eventId,
  eventType,
  payload,
  priority = "normal",
  timestamp = new Date().toISOString(),
  user,
}: BuildDomWebhookPayloadInput): DomWebhookPayload {
  return {
    event_type: eventType,
    event_id: eventId,
    timestamp,
    payload,
    campaign_id: campaign.dbId,
    campaign_slug: campaign.id,
    user_id: user.id,
    user_email: user.email,
    priority,
    campaign,
  };
}

type PostDomWebhookInput = {
  url: string;
  token?: string | null;
  eventType: string;
  body: Record<string, unknown>;
  maxAttempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number | ((attempt: number) => number);
  fetchImpl?: typeof fetch;
};

export type DomWebhookPostResult =
  | {
      ok: true;
      status: number;
      attempts: number;
      data: DomApiResponse | null;
    }
  | {
      ok: false;
      status?: number;
      attempts?: number;
      data?: DomApiResponse | null;
      error?: string;
      skipped?: true;
      reason?: "missing_agent_token";
    };

export const defaultDomWebhookUrl =
  "https://dom-assistant.vercel.app/api/webhook/enterprise-lookout";

export function resolveDomWebhookUrl(
  value = process.env.DOM_WEBHOOK_URL,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
) {
  const normalized = normalizeEndpointUrl(value);
  if (!normalized) return defaultDomWebhookUrl;
  if (isAppInboxWebhookUrl(normalized, appUrl)) return defaultDomWebhookUrl;
  return normalized;
}

export function getDomWebhookToken() {
  return process.env.AGENT_API_TOKEN || process.env.DOM_API_TOKEN || null;
}

export async function postDomWebhook({
  body,
  eventType,
  fetchImpl = fetch,
  maxAttempts = 3,
  retryDelayMs = defaultRetryDelayMs,
  timeoutMs = 10_000,
  token = getDomWebhookToken(),
  url,
}: PostDomWebhookInput): Promise<DomWebhookPostResult> {
  if (!token) {
    console.info("AGENT_API_TOKEN/DOM_API_TOKEN missing; skipped Dom webhook", {
      eventType,
    });
    return { ok: false, skipped: true, reason: "missing_agent_token" };
  }

  let lastError = "unknown_error";
  let lastStatus: number | undefined;
  let lastData: DomApiResponse | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Event-Type": eventType,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      lastStatus = response.status;
      lastData = (await response.json().catch(() => null)) as DomApiResponse | null;

      if (response.status === 200 || response.status === 202) {
        if (lastData?.ok === false) {
          return {
            ok: false,
            status: response.status,
            attempts: attempt,
            data: lastData,
            error: lastData.message ?? "dom_returned_not_ok",
          };
        }

        return {
          ok: true,
          status: response.status,
          attempts: attempt,
          data: lastData,
        };
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown_error";
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < maxAttempts) {
      await sleep(resolveRetryDelayMs(retryDelayMs, attempt));
    }
  }

  return {
    ok: false,
    status: lastStatus,
    attempts: maxAttempts,
    data: lastData,
    error: lastError,
  };
}

function defaultRetryDelayMs(attempt: number) {
  return Math.min(500 * 2 ** (attempt - 1), 2_000);
}

function normalizeEndpointUrl(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\\n+$/g, "").trim();
  return normalized || null;
}

function isAppInboxWebhookUrl(value: string, appUrl: string | null | undefined) {
  if (!appUrl) return false;

  try {
    const candidate = new URL(value);
    const app = new URL(appUrl);
    return (
      candidate.host === app.host &&
      candidate.pathname.startsWith("/api/agent/events")
    );
  } catch {
    return false;
  }
}

function resolveRetryDelayMs(
  retryDelayMs: number | ((attempt: number) => number),
  attempt: number,
) {
  return typeof retryDelayMs === "function"
    ? retryDelayMs(attempt)
    : retryDelayMs;
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
