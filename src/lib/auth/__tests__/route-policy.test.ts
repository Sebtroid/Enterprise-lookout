import { describe, expect, it } from "vitest";

import {
  classifyRequestPath,
  getSafeAuthRedirectPath,
  isDemoAccessEnabled,
  isLegacyApiPath,
} from "@/lib/auth/route-policy";

describe("classifyRequestPath", () => {
  it("keeps only explicit authentication and legal pages public", () => {
    expect(classifyRequestPath("/login")).toBe("public");
    expect(classifyRequestPath("/privacy")).toBe("public");
    expect(classifyRequestPath("/api/gmail/callback")).toBe("signed_callback");
  });

  it("requires a user session for dashboard and user-facing APIs", () => {
    expect(classifyRequestPath("/today")).toBe("session");
    expect(classifyRequestPath("/api/gmail/send")).toBe("session");
    expect(classifyRequestPath("/api/gmail/sync-replies")).toBe("session");
  });

  it("leaves machine endpoints to their bearer-token authorization", () => {
    expect(classifyRequestPath("/api/gpt/jobs/claim")).toBe("service");
    expect(classifyRequestPath("/api/agent/events")).toBe("service");
    expect(classifyRequestPath("/api/pastoral/followups/run")).toBe("service");
  });
});

describe("isLegacyApiPath", () => {
  it("retires direct-DB and DOM routes without blocking V2 or OAuth", () => {
    expect(isLegacyApiPath("/api/gpt/jobs/claim")).toBe(true);
    expect(isLegacyApiPath("/api/gmail/send")).toBe(true);
    expect(isLegacyApiPath("/api/v2/mail/drafts/approve")).toBe(false);
    expect(isLegacyApiPath("/api/gmail/callback")).toBe(false);
  });
});

describe("getSafeAuthRedirectPath", () => {
  it("accepts internal paths and rejects external redirects", () => {
    expect(getSafeAuthRedirectPath("/today?view=mine")).toBe(
      "/today?view=mine",
    );
    expect(getSafeAuthRedirectPath("https://evil.example")).toBe("/today");
    expect(getSafeAuthRedirectPath("//evil.example")).toBe("/today");
  });
});

describe("isDemoAccessEnabled", () => {
  it("never enables demo access in production", () => {
    expect(
      isDemoAccessEnabled({ appMode: "demo", nodeEnv: "production" }),
    ).toBe(false);
  });

  it("requires an explicit demo flag outside production", () => {
    expect(
      isDemoAccessEnabled({ appMode: undefined, nodeEnv: "development" }),
    ).toBe(false);
    expect(
      isDemoAccessEnabled({ appMode: "demo", nodeEnv: "development" }),
    ).toBe(true);
  });
});
