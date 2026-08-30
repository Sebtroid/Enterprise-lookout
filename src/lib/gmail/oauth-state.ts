import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

type OAuthStatePayload = {
  redirect: string;
  userEmail?: string;
  nonce?: string;
  issuedAt?: number;
  workspaceId?: string;
  userId?: string;
};

export const GMAIL_OAUTH_NONCE_COOKIE = "gmail_oauth_nonce";

const MAX_STATE_AGE_MS = 10 * 60 * 1000;

export function signOAuthState(
  payload: OAuthStatePayload,
  secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY,
) {
  const completePayload = {
    ...payload,
    issuedAt: payload.issuedAt ?? Date.now(),
    nonce: payload.nonce ?? randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(completePayload), "utf8").toString(
    "base64url",
  );
  const signature = sign(encodedPayload, getSecret(secret));

  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthState(
  state: string,
  secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY,
) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload, getSecret(secret));
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    if (!payload.redirect) return null;
    if (!payload.issuedAt || Date.now() - payload.issuedAt > MAX_STATE_AGE_MS) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createOAuthNonce() { return randomBytes(32).toString("base64url"); }
export function hashOAuthNonce(nonce: string, secret: string) { return sign(nonce, getSecret(secret)); }
export function verifyOAuthNonce(nonce: string, expectedHash: string | undefined, secret: string) {
  return Boolean(expectedHash) && safeEqual(hashOAuthNonce(nonce, secret), expectedHash!);
}

function getSecret(secret: string | undefined) {
  if (!secret || secret.length < 16) {
    throw new Error("Missing or weak GMAIL_TOKEN_ENCRYPTION_KEY");
  }

  return secret;
}
