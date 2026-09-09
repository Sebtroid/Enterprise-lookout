import { describe, expect, it } from "vitest";

import {
  aggregateGmailProviderState,
  aggregateMicrosoftProviderState,
  getGmailAccountState,
  getMicrosoftAccountState,
} from "../settings";

describe("Gmail settings state", () => {
  it.each([
    { active: true, syncStatus: "ready", expected: "connected" },
    { active: true, syncStatus: "pending", expected: "unavailable" },
    { active: true, syncStatus: "syncing", expected: "unavailable" },
    { active: true, syncStatus: "error", expected: "action_required" },
    { active: true, syncStatus: "disconnected", expected: "action_required" },
    { active: false, syncStatus: "ready", expected: "unavailable" },
    { active: true, syncStatus: "unexpected", expected: "unavailable" },
  ] as const)("maps $syncStatus with active=$active to $expected", ({ active, syncStatus, expected }) => {
    expect(getGmailAccountState({ active, syncStatus })).toBe(expected);
  });

  it("aggregates account health with a stable priority", () => {
    expect(aggregateGmailProviderState([], false)).toBe("not_configured");
    expect(aggregateGmailProviderState([], true)).toBe("action_required");
    expect(aggregateGmailProviderState(["unavailable"], true)).toBe("unavailable");
    expect(aggregateGmailProviderState(["unavailable", "action_required"], true)).toBe("action_required");
    expect(aggregateGmailProviderState(["action_required", "unavailable"], true)).toBe("action_required");
    expect(aggregateGmailProviderState(["connected", "unavailable"], true)).toBe("unavailable");
    expect(aggregateGmailProviderState(["action_required", "connected", "unavailable"], false)).toBe("action_required");
    expect(aggregateGmailProviderState(["connected", "connected"], false)).toBe("connected");
  });
});

describe("Microsoft settings state", () => {
  it("uses the same honest sync health states as Gmail", () => {
    expect(getMicrosoftAccountState({ active: true, syncStatus: "ready" })).toBe("connected");
    expect(getMicrosoftAccountState({ active: true, syncStatus: "error" })).toBe("action_required");
    expect(getMicrosoftAccountState({ active: false, syncStatus: "ready" })).toBe("unavailable");
  });

  it("requires OAuth configuration or a connected account", () => {
    expect(aggregateMicrosoftProviderState([], false)).toBe("not_configured");
    expect(aggregateMicrosoftProviderState([], true)).toBe("action_required");
    expect(aggregateMicrosoftProviderState(["connected"], false)).toBe("connected");
  });
});
