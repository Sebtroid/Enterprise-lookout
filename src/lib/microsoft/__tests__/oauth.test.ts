import { describe, expect, it } from "vitest";

import {
  buildMicrosoftAuthorizationUrl,
  resolveMicrosoftProfile,
} from "../oauth";

describe("Microsoft 365 OAuth", () => {
  it.each([
    "jose@uc.cl",
    "jose@estudiante.uc.cl",
    "jose@facultad.estudiante.uc.cl",
  ])("accepts the UC tenant address %s", (address) => {
    expect(resolveMicrosoftProfile({ id: "graph-user", mail: address, userPrincipalName: null, displayName: "José" }))
      .toEqual({ graphUserId: "graph-user", email: address, displayName: "José" });
  });

  it.each([
    "jose@eviluc.cl",
    "jose@uc.cl.attacker.test",
    "jose@gmail.com",
    "not-an-email",
  ])("rejects non-UC addresses such as %s", (address) => {
    expect(() => resolveMicrosoftProfile({ id: "graph-user", mail: address, userPrincipalName: null, displayName: "José" }))
      .toThrow("dominio uc.cl");
  });

  it("falls back to the user principal name when Graph omits mail", () => {
    expect(resolveMicrosoftProfile({
      id: "graph-user",
      mail: null,
      userPrincipalName: "JOSE@ESTUDIANTE.UC.CL",
      displayName: "José Miguel",
    })).toEqual({
      graphUserId: "graph-user",
      email: "jose@estudiante.uc.cl",
      displayName: "José Miguel",
    });
  });

  it("requests only identity scopes until Microsoft mail sync and send ship", () => {
    const url = new URL(buildMicrosoftAuthorizationUrl({
      clientId: "client-id",
      tenantId: "tenant-id",
      redirectUri: "https://app.test/api/microsoft/callback",
      state: "signed-state",
    }));

    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
    ]);
  });
});
