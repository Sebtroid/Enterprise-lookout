import { describe, expect, it, vi } from "vitest";

import {
  buildDomWebhookPayload,
  postDomWebhook,
  resolveDomWebhookUrl,
} from "@/lib/dom/webhook";

const campaign = {
  dbId: "11111111-1111-4111-8111-111111111111",
  id: "dia-del-ingeniero",
  name: "Dia del ingeniero",
  organization: "Auspicios",
  description: "Campana de auspicios",
  valueProposition: "Premios y activaciones",
  needs: ["premios"],
  date: null,
  status: "active",
};

describe("Dom webhook payload", () => {
  it("uses the instant webhook envelope Dom expects", () => {
    expect(
      buildDomWebhookPayload({
        campaign,
        eventId: "22222222-2222-4222-8222-222222222222",
        eventType: "dom_task_created",
        payload: { task_id: "task-1", description: "Investigar chocolates" },
        priority: "normal",
        timestamp: "2026-05-07T20:00:00.000Z",
        user: { id: "user-1", email: "user@example.com" },
      }),
    ).toEqual({
      event_type: "dom_task_created",
      event_id: "22222222-2222-4222-8222-222222222222",
      timestamp: "2026-05-07T20:00:00.000Z",
      payload: { task_id: "task-1", description: "Investigar chocolates" },
      campaign_id: "11111111-1111-4111-8111-111111111111",
      campaign_slug: "dia-del-ingeniero",
      user_id: "user-1",
      user_email: "user@example.com",
      priority: "normal",
      campaign,
    });
  });
});

describe("postDomWebhook", () => {
  it("sends auth, content type and event type headers", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }, { status: 202 }));

    const result = await postDomWebhook({
      body: { event_type: "mail_rejected" },
      eventType: "mail_rejected",
      fetchImpl,
      retryDelayMs: 0,
      token: "agent-token",
      url: "https://dom.example/api/webhook",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dom.example/api/webhook",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer agent-token",
          "Content-Type": "application/json",
          "X-Event-Type": "mail_rejected",
        },
        method: "POST",
      }),
    );
  });

  it("retries non-200/202 responses up to three attempts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: false }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ ok: false }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ok: true }, { status: 200 }));

    const result = await postDomWebhook({
      body: { event_type: "dom_task_created" },
      eventType: "dom_task_created",
      fetchImpl,
      retryDelayMs: 0,
      token: "agent-token",
      url: "https://dom.example/api/webhook",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not POST without an agent token", async () => {
    const fetchImpl = vi.fn();

    const result = await postDomWebhook({
      body: { event_type: "dom_task_created" },
      eventType: "dom_task_created",
      fetchImpl,
      token: "",
      url: "https://dom.example/api/webhook",
    });

    expect(result).toEqual({
      ok: false,
      skipped: true,
      reason: "missing_agent_token",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("resolveDomWebhookUrl", () => {
  it("removes accidental literal newline suffixes from Vercel env values", () => {
    expect(
      resolveDomWebhookUrl(
        "https://dom-assistant.vercel.app/api/webhook/enterprise-lookout\\n",
      ),
    ).toBe("https://dom-assistant.vercel.app/api/webhook/enterprise-lookout");
  });

  it("does not allow Dom webhook delivery to point back at the app inbox", () => {
    expect(
      resolveDomWebhookUrl(
        "https://enterprise-lookout.vercel.app/api/agent/events/webhook",
        "https://enterprise-lookout.vercel.app",
      ),
    ).toBe("https://dom-assistant.vercel.app/api/webhook/enterprise-lookout");
  });
});
