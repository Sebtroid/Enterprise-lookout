export function getAllowedEmails(value = process.env.APP_ALLOWED_EMAILS) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string | null | undefined, allowlist?: string) {
  if (!email) return false;
  const allowedEmails = getAllowedEmails(allowlist);

  return allowedEmails.has(email.trim().toLowerCase());
}
