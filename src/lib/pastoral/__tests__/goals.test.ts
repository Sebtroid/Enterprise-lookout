import { describe, expect, it } from "vitest";

import {
  formatPastoralGoalDate,
  getCurrentPastoralGoal,
} from "@/lib/pastoral/goals";

describe("pastoral fundraising goals", () => {
  it("formats milestone dates without shifting them by timezone", () => {
    expect(formatPastoralGoalDate("2026-05-24")).toBe("24/05");
    expect(formatPastoralGoalDate("2026-07-05")).toBe("05/07");
  });

  it("keeps the milestone active through the end of its local day", () => {
    expect(getCurrentPastoralGoal(new Date(2026, 4, 24, 12)).amount).toBe(300000);
    expect(getCurrentPastoralGoal(new Date(2026, 4, 25, 9)).amount).toBe(600000);
  });
});
