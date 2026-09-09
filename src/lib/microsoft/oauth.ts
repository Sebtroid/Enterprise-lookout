export const MICROSOFT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
] as const;

export type MicrosoftGraphProfile = {
  id?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
};

export function buildMicrosoftAuthorizationUrl(input: {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(input.tenantId)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function resolveMicrosoftProfile(profile: MicrosoftGraphProfile) {
  const email = String(profile.mail || profile.userPrincipalName || "").trim().toLowerCase();
  const domain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
  if (!profile.id || (domain !== "uc.cl" && !domain.endsWith(".uc.cl"))) {
    throw new Error("La cuenta Microsoft debe pertenecer al dominio uc.cl");
  }
  return {
    graphUserId: profile.id,
    email,
    displayName: String(profile.displayName || email).trim(),
  };
}

export async function exchangeMicrosoftAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}) {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(input.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_OAUTH_SCOPES.join(" "),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !result.access_token) throw new Error(result.error || "microsoft_token_exchange_failed");
  return result;
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("microsoft_profile_lookup_failed");
  return resolveMicrosoftProfile(await response.json() as MicrosoftGraphProfile);
}
