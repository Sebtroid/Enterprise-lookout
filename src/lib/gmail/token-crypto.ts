import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const TOKEN_PREFIX = "v1";

export function isEncryptedToken(value: string) {
  return value.startsWith(`${TOKEN_PREFIX}:`);
}

export function encryptToken(value: string, secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
  if (!value) return value;
  const key = getKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptToken(value: string, secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY) {
  if (!value || !isEncryptedToken(value)) return value;

  const [, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(secret),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getKey(secret: string | undefined) {
  if (!secret || secret.length < 16) {
    throw new Error("Missing or weak GMAIL_TOKEN_ENCRYPTION_KEY");
  }

  return createHash("sha256").update(secret).digest();
}
