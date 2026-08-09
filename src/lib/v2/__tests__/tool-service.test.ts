import { describe, expect, it } from "vitest";

import { ENTERPRISE_TOOL_DEFINITIONS, assertToolAuthorization } from "@/lib/v2/tool-service";

describe("Enterprise Lookout tool surface", () => {
  it("exposes focused research, context and drafting operations", () => {
    expect(ENTERPRISE_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "list_projects",
      "get_project_context",
      "create_research_brief",
      "save_research_candidates",
      "list_approved_research",
      "save_research_report",
      "propose_fact",
      "upsert_draft",
      "analyze_reply",
      "save_feedback",
      "complete_job",
    ]);
  });

  it("requires scopes and idempotency for mutations", () => {
    const actor = { origin: "chatgpt" as const, scopes: ["workspace:read"], userId: "user", workspaceId: "workspace" };
    expect(() => assertToolAuthorization(actor, "list_projects", {})).not.toThrow();
    expect(() => assertToolAuthorization(actor, "save_research_report", { idempotencyKey: "same" })).toThrow("scope");
    expect(() => assertToolAuthorization({ ...actor, scopes: ["workspace:read", "research:write"] }, "save_research_report", {})).toThrow("idempotencyKey");
  });
});
