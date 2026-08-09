import { describe, expect, it } from "vitest";
import { buildV2ActionsOpenApi } from "@/lib/v2/actions-openapi";

describe("V2 Actions OpenAPI", () => {
  it("publishes the same tools as MCP with bearer auth", () => {
    const document = buildV2ActionsOpenApi("https://lookout.example");
    expect(Object.keys(document.paths)).toHaveLength(11);
    expect(document.paths["/api/v2/tools/upsert_draft"].post.operationId).toBe("upsert_draft");
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });
});
