import { describe, expect, it } from "vitest";

import {
  buildFinanceSummary,
  buildResearchQuestions,
  evaluateAiBudget,
  evaluateFollowupReadiness,
  getProjectAccess,
  getSenderSelection,
} from "@/lib/v2/domain";

describe("getProjectAccess", () => {
  it("keeps personal projects read-only for teammates", () => {
    expect(
      getProjectAccess(
        { accessMode: "personal", ownerUserId: "seb", workspaceId: "ws" },
        { userId: "miguel", workspaceIds: ["ws"] },
      ),
    ).toEqual({ canApprove: false, canEdit: false, canView: true, relation: "teammate" });
  });

  it("lets every workspace member edit shared projects", () => {
    expect(
      getProjectAccess(
        { accessMode: "shared", ownerUserId: "seb", workspaceId: "ws" },
        { userId: "miguel", workspaceIds: ["ws"] },
      ).canEdit,
    ).toBe(true);
  });
});

describe("evaluateFollowupReadiness", () => {
  it("requires learned examples, approved templates and no compliance alerts", () => {
    expect(
      evaluateFollowupReadiness({
        approvedFollowups: 10,
        complianceAlerts: 0,
        sentFollowups: 5,
        steps: [
          { approved: true, intervalDays: 7, stepNumber: 1 },
          { approved: true, intervalDays: 10, stepNumber: 2 },
        ],
      }),
    ).toEqual({ eligible: true, reasons: [] });

    expect(
      evaluateFollowupReadiness({
        approvedFollowups: 10,
        complianceAlerts: 1,
        sentFollowups: 5,
        steps: [{ approved: true, intervalDays: 7, stepNumber: 1 }],
      }).eligible,
    ).toBe(false);
  });
});

describe("buildFinanceSummary", () => {
  it("separates committed, received, in-kind and expenses in CLP", () => {
    expect(
      buildFinanceSummary({
        expenses: [{ actualValue: 100_000 }],
        goal: 1_000_000,
        contributions: [
          { committedValue: 300_000, kind: "cash", receivedValue: 200_000 },
          { committedValue: 150_000, kind: "in_kind", receivedValue: 150_000 },
        ],
      }),
    ).toEqual({
      committed: 450_000,
      expenses: 100_000,
      goal: 1_000_000,
      inKind: 150_000,
      netReceived: 250_000,
      received: 350_000,
      remaining: 650_000,
    });
  });
});

describe("evaluateAiBudget", () => {
  it("warns at 80% and pauses at the USD 5 hard cap", () => {
    expect(evaluateAiBudget(4, 5)).toEqual({ percent: 80, state: "warning" });
    expect(evaluateAiBudget(5, 5)).toEqual({ percent: 100, state: "paused" });
  });
});

describe("buildResearchQuestions", () => {
  it("asks only for missing research context", () => {
    expect(
      buildResearchQuestions({
        category: "salchichas",
        eventDate: "2026-09-18",
        institution: null,
        needs: [],
        valueProposition: null,
      }),
    ).toEqual([
      "¿Qué institución o equipo organiza el evento?",
      "¿Qué necesitas concretamente de las marcas?",
      "¿Qué puedes ofrecerles a cambio?",
    ]);
  });
});

describe("getSenderSelection", () => {
  it("uses the only active sender and asks when several are active", () => {
    expect(
      getSenderSelection([{ active: true, id: "one" }], "one"),
    ).toEqual({ selectedId: "one", requiresChoice: false });
    expect(
      getSenderSelection(
        [
          { active: true, id: "one" },
          { active: true, id: "two" },
        ],
        null,
      ),
    ).toEqual({ selectedId: null, requiresChoice: true });
  });
});
