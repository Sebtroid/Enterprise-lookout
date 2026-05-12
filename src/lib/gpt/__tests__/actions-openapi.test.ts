import { describe, expect, it } from "vitest";

import { buildGptActionsOpenApiSchema } from "@/lib/gpt/actions-openapi";

describe("GPT Actions OpenAPI schema", () => {
  it("exposes the core Enterprise Lookout operations for a Custom GPT", () => {
    const schema = buildGptActionsOpenApiSchema("https://enterprise-lookout.test");
    const operations = Object.values(schema.paths)
      .flatMap((path) => Object.values(path))
      .map((operation) => operation.operationId);

    expect(schema.servers).toEqual([{ url: "https://enterprise-lookout.test" }]);
    expect(operations).toEqual(
      expect.arrayContaining([
        "listCampaigns",
        "getCampaignWorkspace",
        "createGptJob",
        "claimNextGptJobs",
        "getGptJobContext",
        "updateGptJobProgress",
        "submitGptJobResult",
        "listMemoryRules",
        "createMemoryRule",
      ]),
    );
  });
});
