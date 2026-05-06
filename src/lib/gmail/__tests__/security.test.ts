import { describe, expect, it } from "vitest";

import {
  decryptToken,
  encryptToken,
  isEncryptedToken,
} from "../token-crypto";
import { buildGmailSendBody, buildMimeMessage, encodeRawMessage } from "../mime";
import { signOAuthState, verifyOAuthState } from "../oauth-state";
import { isAllowedEmail } from "../../auth/allowed-emails";

describe("Gmail security helpers", () => {
  const secret = "test-secret-with-enough-length";

  it("encrypts Gmail tokens without keeping plaintext in storage", () => {
    const encrypted = encryptToken("refresh-token-value", secret);

    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptToken(encrypted, secret)).toBe("refresh-token-value");
  });

  it("keeps legacy plaintext token reads compatible", () => {
    expect(decryptToken("legacy-token", secret)).toBe("legacy-token");
  });

  it("signs OAuth state and rejects tampering", () => {
    const state = signOAuthState(
      { userEmail: "sawitting@miuandes.cl", redirect: "/campaigns" },
      secret,
    );

    expect(verifyOAuthState(state, secret)).toMatchObject({
      userEmail: "sawitting@miuandes.cl",
      redirect: "/campaigns",
    });
    expect(verifyOAuthState(`${state}x`, secret)).toBeNull();
  });

  it("encodes MIME messages as Gmail base64url and keeps header injection out", () => {
    const mime = buildMimeMessage({
      body: "Hola Sebastián, gracias por la reunión.",
      from: "sawitting@miuandes.cl",
      subject: "Apoyo social\r\nBcc: attacker@example.com",
      to: "contacto@empresa.cl",
    });
    const raw = encodeRawMessage(mime);

    expect(mime).not.toContain("Bcc: attacker@example.com");
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw).not.toContain("=");
  });

  it("keeps approved replies in the original Gmail thread", () => {
    const raw = encodeRawMessage(
      buildMimeMessage({
        body: "Gracias, seguimos por acá.",
        from: "sawitting@miuandes.cl",
        subject: "Re: Auspicio para liga SCI",
        to: "alianzas@empresa.cl",
      }),
    );

    expect(buildGmailSendBody({ raw, threadId: "gmail-thread-123" })).toEqual({
      raw,
      threadId: "gmail-thread-123",
    });
    expect(buildGmailSendBody({ raw })).toEqual({ raw });
  });

  it("checks allowlisted emails case-insensitively", () => {
    expect(
      isAllowedEmail("SAWITTING@miuandes.cl", "sawitting@miuandes.cl,otro@test.cl"),
    ).toBe(true);
    expect(isAllowedEmail("externo@test.cl", "sawitting@miuandes.cl")).toBe(false);
  });
});
