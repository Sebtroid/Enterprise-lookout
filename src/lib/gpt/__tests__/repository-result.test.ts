import { describe, expect, it } from "vitest";

import {
  extractGptCompanyCandidates,
  extractGptResultActions,
  resolveGptResultStatus,
} from "@/lib/gpt/repository";

describe("GPT result normalization", () => {
  it("accepts legacy nested actions inside result", () => {
    const actions = extractGptResultActions({
      status: "reviewing",
      result: {
        status: "completed",
        result: "Draft created.",
        actions: [{ type: "create_draft", company_id: "company-1" }],
      },
    });

    expect(actions).toEqual([{ type: "create_draft", company_id: "company-1" }]);
  });

  it("treats nested completed status as completed when GPT wrapped the payload", () => {
    expect(
      resolveGptResultStatus({
        status: "reviewing",
        result: { status: "completed", actions: [] },
      }),
    ).toBe("completed");
  });

  it("accepts nested company candidates from wrapped results", () => {
    const candidates = extractGptCompanyCandidates({
      result: {
        result: {
          company_candidates: [{ name: "Gatorade Chile" }],
        },
      },
    });

    expect(candidates).toEqual([{ name: "Gatorade Chile" }]);
  });
});
