import { NextRequest, NextResponse } from "next/server";
import { getAllowedUser } from "@/lib/auth/request";
import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { encryptToken } from "@/lib/gmail/token-crypto";
import { verifyOAuthState } from "@/lib/gmail/oauth-state";
import { getPostgresClient } from "@/lib/supabase/postgres";

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/gmail/callback`;

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  const sql = getPostgresClient();
  if (!user || !sql) {
    return NextResponse.redirect(
      new URL("/login?gmail_error=unauthorized", req.url),
    );
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error) {
    return NextResponse.redirect(
      new URL(`/campaigns?gmail_error=${encodeURIComponent(error)}`, req.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/campaigns?gmail_error=no_code", req.url));
  }

  const verifiedState = state ? verifyOAuthState(state) : null;
  if (!verifiedState || verifiedState.userEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.redirect(
      new URL("/campaigns?gmail_error=invalid_state", req.url),
    );
  }

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL("/campaigns?gmail_error=missing_gmail_config", req.url),
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return NextResponse.redirect(
        new URL(
          `/campaigns?gmail_error=${encodeURIComponent(tokens.error)}`,
          req.url,
        ),
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
    const connectedEmail = String(userInfo.email ?? "").toLowerCase();
    if (!isAllowedEmail(connectedEmail)) {
      return NextResponse.redirect(
        new URL("/campaigns?gmail_error=email_not_allowed", req.url),
      );
    }

    const senderRows = await sql`
      select id
      from sender_accounts
      where lower(email::text) = ${connectedEmail}
        and account_type = 'gmail'
        and status = 'active'
      limit 1
    `;

    if (!senderRows[0]) {
      return NextResponse.redirect(
        new URL("/campaigns?gmail_error=sender_not_configured", req.url),
      );
    }

    // Store tokens in DB
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : "";

    await sql`
      insert into gmail_tokens (
        user_email,
        access_token,
        refresh_token,
        expires_at
      ) values (
        ${connectedEmail},
        ${encryptedAccessToken},
        ${encryptedRefreshToken},
        ${expiresAt}
      )
      on conflict (user_email) do update set
        access_token = excluded.access_token,
        refresh_token = coalesce(excluded.refresh_token, gmail_tokens.refresh_token),
        expires_at = excluded.expires_at,
        updated_at = now()
    `;

    return NextResponse.redirect(
      new URL(`/campaigns?gmail_connected=${encodeURIComponent(connectedEmail)}`, req.url),
    );
  } catch (err) {
    console.error("Gmail callback error:", err);
    return NextResponse.redirect(new URL("/campaigns?gmail_error=server_error", req.url));
  }
}
