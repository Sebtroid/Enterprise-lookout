import { NextRequest, NextResponse } from "next/server";

import { getAllowedUser } from "@/lib/auth/request";
import { getSafeOAuthRedirectPath } from "@/lib/gmail/connection-policy";
import { GMAIL_OAUTH_NONCE_COOKIE, hashOAuthNonce, verifyOAuthNonce, verifyOAuthState } from "@/lib/gmail/oauth-state";
import { fetchConnectedGmailEmail } from "@/lib/gmail/profile";
import { encryptToken } from "@/lib/gmail/token-crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceRuntimeConfig } from "@/lib/v2/runtime-config";

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
  try {
    const { data: membership } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("status", "active").order("joined_at", { ascending: true }).order("workspace_id", { ascending: true }).limit(1).maybeSingle();
    if (!membership) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: "workspace_access_denied" });
    const runtime = await getWorkspaceRuntimeConfig(membership.workspace_id, ["gmail-client-id", "gmail-client-secret", "gmail-token-encryption-key"]);
    const clientId = runtime.secrets["gmail-client-id"], clientSecret = runtime.secrets["gmail-client-secret"], encryptionKey = runtime.secrets["gmail-token-encryption-key"];
    if (!clientId || !clientSecret || !encryptionKey) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: "missing_gmail_config" });
    const verifiedState = state ? verifyOAuthState(state, encryptionKey) : null;
    const nonceHash = req.cookies.get(GMAIL_OAUTH_NONCE_COOKIE)?.value;
    const validState = verifiedState && verifiedState.userId === user.id && verifiedState.workspaceId === membership.workspace_id && Boolean(verifiedState.nonce) && verifyOAuthNonce(verifiedState.nonce!, nonceHash, encryptionKey);
    if (!code || !validState) return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: !code ? "no_code" : "invalid_state" });
    const redirectPath = getSafeOAuthRedirectPath(verifiedState.redirect);
    const { data: nonceConsumed, error: nonceError } = await admin.rpc("consume_gmail_oauth_nonce", {
      target_nonce_hash: hashOAuthNonce(verifiedState.nonce!, encryptionKey),
      target_workspace_id: membership.workspace_id,
      target_user_id: user.id,
    });
    if (nonceError || nonceConsumed !== true) return redirectWithStatus(req, redirectPath, { gmail_error: "invalid_state" });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!tokenResponse.ok || !tokens.access_token) return redirectWithStatus(req, redirectPath, { gmail_error: tokens.error ?? "token_exchange_failed" });
    const connectedEmail = await fetchConnectedGmailEmail(tokens.access_token);
    if (!connectedEmail) return redirectWithStatus(req, redirectPath, { gmail_error: "email_lookup_failed" });
    const { data: existing } = await admin.from("gmail_accounts").select("id,encrypted_refresh_token").eq("workspace_id", membership.workspace_id).eq("email", connectedEmail).maybeSingle();
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token, encryptionKey) : existing?.encrypted_refresh_token;
    if (!encryptedRefreshToken) return redirectWithStatus(req, redirectPath, { gmail_error: "missing_refresh_token" });
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const { data: account, error: accountError } = await admin.from("gmail_accounts").upsert({ workspace_id: membership.workspace_id, owner_user_id: user.id, email: connectedEmail, encrypted_access_token: encryptToken(tokens.access_token, encryptionKey), encrypted_refresh_token: encryptedRefreshToken, expires_at: expiresAt, sync_status: "pending", active: true }, { onConflict: "workspace_id,email" }).select("id").single();
    if (accountError) throw accountError;
    const { error: permissionError } = await admin.from("gmail_account_permissions").upsert({ gmail_account_id: account.id, user_id: user.id, can_read: true, can_draft: true, can_send: true, can_manage: true }, { onConflict: "gmail_account_id,user_id" });
    if (permissionError) throw permissionError;
    return redirectWithStatus(req, redirectPath, { gmail_connected: connectedEmail });
  } catch { return redirectWithStatus(req, DEFAULT_REDIRECT, { gmail_error: "server_error" }); }
}

function redirectWithStatus(req: NextRequest, redirectPath: string, params: Record<string, string>) { const url = new URL(getSafeOAuthRedirectPath(redirectPath), req.url); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); const response = NextResponse.redirect(url); response.cookies.delete({ name: GMAIL_OAUTH_NONCE_COOKIE, path: "/api/gmail/callback" }); return response; }
