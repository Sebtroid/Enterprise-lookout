import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isSafeRedirectUri, normalizeScopes, verifyPkce } from "@/lib/v2/oauth";

describe("MCP OAuth 2.1", () => {
  it("requires a valid S256 verifier", () => {
    const verifier = "a-valid-code-verifier-with-more-than-forty-three-characters";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("wrong", challenge)).toBe(false);
  });

  it("accepts HTTPS and localhost redirects only", () => {
    expect(isSafeRedirectUri("https://chatgpt.com/oauth/callback")).toBe(true);
    expect(isSafeRedirectUri("http://localhost:3000/callback")).toBe(true);
    expect(isSafeRedirectUri("http://evil.example/callback")).toBe(false);
  });

  it("rejects unrecognized scopes", () => {
    expect(normalizeScopes("workspace:read mail:draft")).toEqual(["workspace:read", "mail:draft"]);
    expect(() => normalizeScopes("mail:send")).toThrow("no permitidos");
  });
});
