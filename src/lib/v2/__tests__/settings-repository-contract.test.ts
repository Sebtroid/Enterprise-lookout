import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repository = readFileSync(join(process.cwd(), "src", "lib", "v2", "repository.ts"), "utf8");

describe("live settings repository", () => {
  it("derives budget and provider status from workspace tables and Vault status RPC", () => {
    expect(repository).toContain('.from("workspace_ai_settings")');
    expect(repository).toContain('.rpc("workspace_secret_status"');
    expect(repository).toContain("minimax_monthly_budget_usd ?? 5");
    expect(repository).not.toContain("minimax_monthly_budget_usd || 5");
    expect(repository).not.toContain("process.env.MINIMAX_MONTHLY_BUDGET_USD");
    expect(repository).not.toContain("process.env.MINIMAX_API_KEY");
    expect(repository).not.toContain("process.env.HUNTER_API_KEY");
    expect(repository).not.toContain("process.env.GMAIL_CLIENT_SECRET");
  });
});
