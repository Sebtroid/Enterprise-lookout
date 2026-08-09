import { NextRequest, NextResponse } from "next/server";

import { getAllowedUser } from "@/lib/auth/request";
import { getSafeOAuthRedirectPath } from "@/lib/gmail/connection-policy";
import { verifyOAuthState } from "@/lib/gmail/oauth-state";
import { fetchConnectedGmailEmail } from "@/lib/gmail/profile";
import { encryptToken } from "@/lib/gmail/token-crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/gmail/callback`;
const DEFAULT_REDIRECT = "/settings";

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  if (!user) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: "unauthorized" });
  const admin = getSupabaseAdminClient();
  if (!admin) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: "missing_database_config" });
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  if (oauthError) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: oauthError });
  const verifiedState = state ? verifyOAuthState(state) : null;
  if (!code || !verifiedState) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: !code ? "no_code" : "invalid_state" });
  const redirectPath = getSafeOAuthRedirectPath(verifiedState.redirect);
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_TOKEN_ENCRYPTION_KEY) return redirectWithStatus(req, redirectPath, { gmail_error: "missing_gmail_config" });

  try {
    const { data: membership } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (!membership) return redirectWithStatus(req, redirectPath, { gmail_error: "workspace_access_denied" });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!tokenResponse.ok || !tokens.access_token) return redirectWithStatus(req, redirectPath, { gmail_error: tokens.error ?? "token_exchange_failed" });
    const connectedEmail = await fetchConnectedGmailEmail(tokens.access_token);
    if (!connectedEmail) return redirectWithStatus(req, redirectPath, { gmail_error: "email_lookup_failed" });
    const { data: existing } = await admin.from("gmail_accounts").select("id,encrypted_refresh_token").eq("workspace_id", membership.workspace_id).eq("email", connectedEmail).maybeSingle();
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : existing?.encrypted_refresh_token;
    if (!encryptedRefreshToken) return redirectWithStatus(req, redirectPath, { gmail_error: "missing_refresh_token" });
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const { data: account, error: accountError } = await admin.from("gmail_accounts").upsert({ workspace_id: membership.workspace_id, owner_user_id: user.id, email: connectedEmail, encrypted_access_token: encryptToken(tokens.access_token), encrypted_refresh_token: encryptedRefreshToken, expires_at: expiresAt, sync_status: "pending", active: true }, { onConflict: "workspace_id,email" }).select("id").single();
    if (accountError) throw accountError;
    const { error: permissionError } = await admin.from("gmail_account_permissions").upsert({ gmail_account_id: account.id, user_id: user.id, can_read: true, can_draft: true, can_send: true, can_manage: true }, { onConflict: "gmail_account_id,user_id" });
    if (permissionError) throw permissionError;
    return redirectWithStatus(req, redirectPath, { gmail_connected: connectedEmail });
  } catch (error) { console.error("Gmail V2 callback error", error); return redirectWithStatus(req, redirectPath, { gmail_error: "server_error" }); }
}

function redirectWithStatus(req: NextRequest, redirectPath: string, params: Record<string, string>) { const url = new URL(getSafeOAuthRedirectPath(redirectPath), req.url); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); return NextResponse.redirect(url); }
