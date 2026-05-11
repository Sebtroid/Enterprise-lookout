import { describe, expect, it } from "vitest";

import {
  DOM_TASK_STATUSES,
  isActiveDomTaskStatus,
  normalizeDomTaskStatus,
} from "@/lib/dom/status";

describe("Dom task statuses", () => {
  it("matches the progress states shown in the app", () => {
    expect(DOM_TASK_STATUSES).toEqual([
      "pending",
      "received",
      "in_progress",
      "researching",
      "drafting",
      "reviewing",
      "completed",
      "failed",
    ]);
  });

  it("normalizes legacy blocked tasks to failed", () => {
    expect(normalizeDomTaskStatus("blocked")).toBe("failed");
  });

  it("treats intermediate states as active", () => {
    expect(isActiveDomTaskStatus("received")).toBe(true);
    expect(isActiveDomTaskStatus("researching")).toBe(true);
    expect(isActiveDomTaskStatus("completed")).toBe(false);
    expect(isActiveDomTaskStatus("failed")).toBe(false);
  });
});
