import { NextRequest, NextResponse } from "next/server";
import {
  getGmailConnectionDecision,
  getSafeOAuthRedirectPath,
} from "@/lib/gmail/connection-policy";
import { encryptToken } from "@/lib/gmail/token-crypto";
import { verifyOAuthState } from "@/lib/gmail/oauth-state";
import { getPostgresClient } from "@/lib/supabase/postgres";

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/gmail/callback`;
const DEFAULT_REDIRECT = "/campaigns/all/settings/gmail";

export async function GET(req: NextRequest) {
  const sql = getPostgresClient();
  if (!sql) {
    return redirectWithStatus(req, DEFAULT_REDIRECT, {
      gmail_error: "missing_database_config",
    });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error) {
    return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: error });
  }

  if (!code) {
    return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: "no_code" });
  }

  const verifiedState = state ? verifyOAuthState(state) : null;
  if (!verifiedState) {
    return redirectWithStatus(req, DEFAULT_REDIRECT, {
      gmail_error: "invalid_state",
    });
  }
  const redirectPath = getSafeOAuthRedirectPath(verifiedState.redirect);

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    return redirectWithStatus(req, redirectPath, {
      gmail_error: "missing_gmail_config",
    });
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
      return redirectWithStatus(req, redirectPath, {
        gmail_error: String(tokens.error),
      });
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

    const senderRows = await sql`
      select id
      from sender_accounts
      where lower(email::text) = ${connectedEmail}
        and account_type = 'gmail'
        and status = 'active'
      limit 1
    `;

    const connectionDecision = getGmailConnectionDecision({
      connectedEmail,
      hasConfiguredSender: Boolean(senderRows[0]),
    });

    if (connectionDecision !== "allowed") {
      return redirectWithStatus(req, redirectPath, {
        gmail_email: connectedEmail,
        gmail_error: connectionDecision,
      });
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

    return redirectWithStatus(req, redirectPath, {
      gmail_connected: connectedEmail,
    });
  } catch (err) {
    console.error("Gmail callback error:", err);
    return redirectWithStatus(req, DEFAULT_REDIRECT, {
      gmail_error: "server_error",
    });
  }
}

function redirectWithStatus(
  req: NextRequest,
  redirectPath: string,
  params: Record<string, string>,
) {
  const url = new URL(getSafeOAuthRedirectPath(redirectPath), req.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}
