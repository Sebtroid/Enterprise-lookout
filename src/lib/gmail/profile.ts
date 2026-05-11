export type GmailProfilePayload = {
  emailAddress?: unknown;
};

export type GoogleUserInfoPayload = {
  email?: unknown;
};

export function resolveConnectedGmailEmail({
  gmailProfile,
  userInfo,
}: {
  gmailProfile?: GmailProfilePayload | null;
  userInfo?: GoogleUserInfoPayload | null;
}) {
  return (
    normalizeEmail(gmailProfile?.emailAddress) ??
    normalizeEmail(userInfo?.email) ??
    ""
  );
}

export async function fetchConnectedGmailEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  const [gmailProfile, userInfo] = await Promise.all([
    fetchJson<GmailProfilePayload>(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      accessToken,
      fetchImpl,
    ),
    fetchJson<GoogleUserInfoPayload>(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      accessToken,
      fetchImpl,
    ),
  ]);

  return resolveConnectedGmailEmail({ gmailProfile, userInfo });
}

async function fetchJson<T>(
  url: string,
  accessToken: string,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.includes("@") ? email : null;
}
