import { NextRequest, NextResponse } from "next/server";

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
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "url") {
    // Generar URL de autorización
    const state = Buffer.from(
      JSON.stringify({ 
        redirect: "/campaigns", 
        nonce: crypto.randomUUID() 
      })
    ).toString("base64");

    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GMAIL_CLIENT_ID || "");
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

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "exchange") {
    const { code } = await req.json();
    
    // Intercambiar código por tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GMAIL_CLIENT_ID || "",
        client_secret: GMAIL_CLIENT_SECRET || "",
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      return NextResponse.json({ error: tokens.error }, { status: 400 });
    }

    // Guardar tokens en DB
    return NextResponse.json({ 
      ok: true, 
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
