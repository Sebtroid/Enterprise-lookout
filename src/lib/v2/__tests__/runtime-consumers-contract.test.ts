import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const source = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("runtime Vault consumers", () => {
  it("runs MiniMax from workspace Vault credentials and DB budget", () => {
    const minimax = source("src", "lib", "v2", "minimax.ts");
    expect(minimax).toContain("getWorkspaceRuntimeConfig(input.workspaceId");
    expect(minimax).toContain("runtime.budgetUsd");
    expect(minimax).not.toContain("process.env.MINIMAX_API_KEY");
    expect(minimax).not.toContain("process.env.MINIMAX_MODEL");
  });
  it("authorizes both workers by workspace Vault cron secrets", () => {
    for (const name of ["minimax", "followups"]) {
      const route = source("src", "app", "api", "v2", "workers", name, "route.ts");
      expect(route).toContain("authorizeWorkspaceCronRequest");
      expect(route).not.toContain("process.env.CRON_SECRET");
      expect(route).not.toContain("error instanceof Error ? error.message");
    }
  });
  it("uses workspace Gmail secrets for connect, callback and refresh", () => {
    const connect = source("src", "app", "api", "gmail", "route.ts");
    const callback = source("src", "app", "api", "gmail", "callback", "route.ts");
    const sync = source("src", "lib", "v2", "gmail-sync.ts");
    for (const code of [connect, callback, sync]) expect(code).toContain("getWorkspaceRuntimeConfig");
    expect(callback).toContain("verifyOAuthState(state, encryptionKey)");
    expect(callback).toContain("encryptToken(tokens.access_token, encryptionKey)");
    expect(sync).toContain("decryptToken(account.encrypted_access_token, encryptionKey)");
    expect(sync).toContain("encryptToken(accessToken, encryptionKey)");
  });
  it("marks Gmail configured only when all three runtime keys exist", () => {
    const repository = source("src", "lib", "v2", "repository.ts");
    expect(repository).toMatch(/gmail-client-id[\s\S]*?gmail-client-secret[\s\S]*?gmail-token-encryption-key/);
  });
});
