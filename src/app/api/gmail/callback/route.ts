import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_DB_URL!, {
  ssl: "require",
  prepare: false,
  max: 1,
});

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/gmail/callback`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `/campaigns?gmail_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`/campaigns?gmail_error=no_code`);
  }

  try {
    // Exchange code for tokens
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
      return NextResponse.redirect(
        `/campaigns?gmail_error=${encodeURIComponent(tokens.error)}`
      );
    }

    // Get user email from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );
    const userInfo = await userInfoResponse.json();

    // Store tokens in DB
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await sql`
      insert into gmail_tokens (
        user_email,
        access_token,
        refresh_token,
        expires_at
      ) values (
        ${userInfo.email},
        ${tokens.access_token},
        ${tokens.refresh_token || ""},
        ${expiresAt}
      )
      on conflict (user_email) do update set
        access_token = excluded.access_token,
        refresh_token = coalesce(excluded.refresh_token, gmail_tokens.refresh_token),
        expires_at = excluded.expires_at,
        updated_at = now()
    `;

    return NextResponse.redirect(`/campaigns?gmail_connected=${encodeURIComponent(userInfo.email)}`);
  } catch (err) {
    console.error("Gmail callback error:", err);
    return NextResponse.redirect(`/campaigns?gmail_error=server_error`);
  }
}
