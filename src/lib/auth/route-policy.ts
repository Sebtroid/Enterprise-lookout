export type RequestAccessMode =
  | "public"
  | "session"
  | "service"
  | "signed_callback";

const PUBLIC_PATHS = new Set(["/login", "/privacy", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]);
const SIGNED_CALLBACK_PATHS = new Set([
  "/auth/callback",
  "/api/gmail/callback",
]);

const SERVICE_PREFIXES = [
  "/api/agent/",
  "/api/gpt/",
  "/api/dom/webhook",
  "/api/webhook/",
  "/api/pastoral/",
  "/api/v2/",
];

const SERVICE_PATHS = new Set(["/api/chat/reply", "/api/mcp", "/oauth/token", "/oauth/register"]);
const LEGACY_API_PREFIXES = ["/api/agent/", "/api/gpt/", "/api/dom/", "/api/pastoral/", "/api/webhook/"];
const LEGACY_API_PATHS = new Set(["/api/chat", "/api/chat/reply", "/api/gmail/send", "/api/gmail/sync-replies"]);

export function classifyRequestPath(pathname: string): RequestAccessMode {
  if (PUBLIC_PATHS.has(pathname)) return "public";
  if (SIGNED_CALLBACK_PATHS.has(pathname)) return "signed_callback";
  if (SERVICE_PATHS.has(pathname)) return "service";
  if (SERVICE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return "service";
  }
  return "session";
}

export function isDemoAccessEnabled({
  appMode,
  nodeEnv,
}: {
  appMode?: string;
  nodeEnv?: string;
}) {
  return nodeEnv !== "production" && appMode === "demo";
}

export function isLegacyApiPath(pathname: string) {
  return LEGACY_API_PATHS.has(pathname) || LEGACY_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function getSafeAuthRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/today";
  }
  return value;
}
