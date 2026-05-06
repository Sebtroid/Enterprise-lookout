import { NextRequest, NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/auth/request";
import { signOAuthState } from "@/lib/gmail/oauth-state";

/**
 * Gmail OAuth2 Flow
 * 
 * 1. Usuario visita /settings/gmail
 * 2. Frontend llama a /api/gmail/auth para obtener URL de autorización
 * 3. Google redirige a /api/gmail/callback con código
 * 4. Backend intercambia código por tokens y los guarda en DB
 * 5. Para enviar: /api/gmail/send usa el access_token
 * 
 * Requiere configurar en Google Cloud Console:
 * - Proyecto nuevo
 * - Gmail API enabled
 * - OAuth consent screen (External)
 * - Credentials > OAuth client ID (Web application)
 * - Redirect URI: https://enterprise-lookout.vercel.app/api/gmail/callback
 */

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/gmail/callback`;

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Missing Gmail OAuth configuration" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "url") {
    const state = signOAuthState({
      redirect: "/campaigns",
      userEmail: user.email,
    });

    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GMAIL_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return NextResponse.json({ url: authUrl.toString() });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Token exchange is handled by the OAuth callback." },
    { status: 405 },
  );
}
