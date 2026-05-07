import { isAllowedEmail } from "@/lib/auth/allowed-emails";

export type GmailConnectionDecision =
  | "allowed"
  | "email_not_allowed"
  | "sender_not_configured";

export function getGmailConnectionDecision({
  allowlist,
  connectedEmail,
  hasConfiguredSender,
}: {
  allowlist?: string;
  connectedEmail: string | null | undefined;
  hasConfiguredSender: boolean;
}): GmailConnectionDecision {
  if (hasConfiguredSender) return "allowed";
  if (isAllowedEmail(connectedEmail, allowlist)) return "sender_not_configured";
  return "email_not_allowed";
}

export function getSafeOAuthRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/campaigns/all/settings/gmail";
  }

  return value;
}
