import { describe, expect, it } from "vitest";

import { AGENT_EVENT_TYPES } from "@/lib/agent/events";
import { shouldDispatchDomWebhook } from "@/lib/agent/server-events";

describe("server agent events", () => {
  it("dispatches every app-created agent event to Dom", () => {
    const skippedEvents = AGENT_EVENT_TYPES.filter(
      (event) => !shouldDispatchDomWebhook(event),
    );

    expect(skippedEvents).toEqual([]);
  });
});
