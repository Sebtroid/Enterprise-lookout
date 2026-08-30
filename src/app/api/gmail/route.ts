import { NextRequest, NextResponse } from "next/server";
import { getSafeOAuthRedirectPath } from "@/lib/gmail/connection-policy";
import { createOAuthNonce, GMAIL_OAUTH_NONCE_COOKIE, hashOAuthNonce, signOAuthState } from "@/lib/gmail/oauth-state";
import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceRuntimeConfig } from "@/lib/v2/runtime-config";

/**
 * Google OAuth2 Flow
 * 
 * 1. Usuario visita /settings/gmail
 * 2. Frontend llama a /api/gmail/auth para obtener URL de autorización
 * 3. Google redirige a /api/gmail/callback con código
 * 4. Backend intercambia código por tokens y los guarda en DB
 * 5. Para enviar: /api/gmail/send usa el access_token
 * 6. Para Pastoral: el mismo token valida y actualiza Google Sheets antes de Gmail
 * 
 * Requiere configurar en Google Cloud Console:
 * - Proyecto nuevo
 * - Gmail API enabled
 * - Google Sheets API enabled
 * - OAuth consent screen (External)
 * - Credentials > OAuth client ID (Web application)
 * - Redirect URI: https://enterprise-lookout.vercel.app/api/gmail/callback
 */

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/gmail/callback`;

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdminClient();
  const { data: membership } = admin ? await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("status", "active").order("joined_at", { ascending: true }).order("workspace_id", { ascending: true }).limit(1).maybeSingle() : { data: null };
  if (!membership) return NextResponse.json({ ok: false, error: "Workspace unavailable" }, { status: 403 });
  const runtime = await getWorkspaceRuntimeConfig(membership.workspace_id, ["gmail-client-id", "gmail-client-secret", "gmail-token-encryption-key"]);
  const clientId = runtime.secrets["gmail-client-id"];
  if (!clientId || !runtime.secrets["gmail-client-secret"] || !runtime.secrets["gmail-token-encryption-key"]) {
    return NextResponse.json(
      { ok: false, error: "Missing Gmail OAuth configuration" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "url" || action === "connect") {
    const redirect = getSafeOAuthRedirectPath(getRefererPath(req));
    const nonce = createOAuthNonce();
    const state = signOAuthState({
      redirect,
      workspaceId: membership.workspace_id,
      userId: user.id,
      nonce,
    }, runtime.secrets["gmail-token-encryption-key"]);

    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    const response = action === "connect" ? NextResponse.redirect(authUrl) : NextResponse.json({ url: authUrl.toString() });
    response.cookies.set(GMAIL_OAUTH_NONCE_COOKIE, hashOAuthNonce(nonce, runtime.secrets["gmail-token-encryption-key"]), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/gmail/callback", maxAge: 600 });
    return response;
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

function getRefererPath(req: NextRequest) {
  const referer = req.headers.get("referer");
  if (!referer) return null;

  try {
    const url = new URL(referer);
    if (url.origin !== new URL(req.url).origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Token exchange is handled by the OAuth callback." },
    { status: 405 },
  );
}
