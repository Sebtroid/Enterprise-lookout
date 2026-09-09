import { NextRequest, NextResponse } from "next/server";

import { getAllowedUser } from "@/lib/auth/request";
import { getSafeOAuthRedirectPath } from "@/lib/gmail/connection-policy";
import { encryptToken } from "@/lib/gmail/token-crypto";
import {
  exchangeMicrosoftAuthorizationCode,
  fetchMicrosoftProfile,
} from "@/lib/microsoft/oauth";
import {
  hashOAuthNonce,
  MICROSOFT_OAUTH_NONCE_COOKIE,
  verifyOAuthNonce,
  verifyOAuthState,
} from "@/lib/microsoft/oauth-state";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceRuntimeConfig } from "@/lib/v2/runtime-config";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/microsoft/callback`;
const DEFAULT_REDIRECT = "/settings";

export async function GET(request: NextRequest) {
  const user = await getAllowedUser();
  if (!user) return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: "unauthorized" });
  const admin = getSupabaseAdminClient();
  if (!admin) return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: "missing_database_config" });

  try {
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .order("workspace_id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: "workspace_access_denied" });

    const runtime = await getWorkspaceRuntimeConfig(membership.workspace_id, [
      "microsoft-client-id",
      "microsoft-client-secret",
      "microsoft-tenant-id",
      "gmail-token-encryption-key",
    ]);
    const clientId = runtime.secrets["microsoft-client-id"];
    const clientSecret = runtime.secrets["microsoft-client-secret"];
    const tenantId = runtime.secrets["microsoft-tenant-id"];
    const encryptionKey = runtime.secrets["gmail-token-encryption-key"];
    if (!clientId || !clientSecret || !tenantId || !encryptionKey) {
      return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: "missing_microsoft_config" });
    }

    const code = request.nextUrl.searchParams.get("code");
    const providerError = request.nextUrl.searchParams.get("error");
    const state = request.nextUrl.searchParams.get("state");
    if (providerError) return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: providerError });
    const verifiedState = state ? verifyOAuthState(state, encryptionKey) : null;
    const nonceHash = request.cookies.get(MICROSOFT_OAUTH_NONCE_COOKIE)?.value;
    const validState = verifiedState
      && verifiedState.userId === user.id
      && verifiedState.workspaceId === membership.workspace_id
      && Boolean(verifiedState.nonce)
      && verifyOAuthNonce(verifiedState.nonce!, nonceHash, encryptionKey);
    if (!code || !validState) return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: !code ? "no_code" : "invalid_state" });
    const redirectPath = getSafeOAuthRedirectPath(verifiedState.redirect);
    const { data: nonceConsumed, error: nonceError } = await admin.rpc("consume_microsoft_oauth_nonce", {
      target_nonce_hash: hashOAuthNonce(verifiedState.nonce!, encryptionKey),
      target_workspace_id: membership.workspace_id,
      target_user_id: user.id,
    });
    if (nonceError || nonceConsumed !== true) return redirectWithStatus(request, redirectPath, { microsoft_error: "invalid_state" });

    const tokens = await exchangeMicrosoftAuthorizationCode({ code, clientId, clientSecret, tenantId, redirectUri: REDIRECT_URI });
    const profile = await fetchMicrosoftProfile(tokens.access_token!);
    const { data: existing, error: existingError } = await admin
      .from("microsoft_accounts")
      .select("id,encrypted_refresh_token")
      .eq("workspace_id", membership.workspace_id)
      .eq("email", profile.email)
      .maybeSingle();
    if (existingError) throw existingError;
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token, encryptionKey)
      : existing?.encrypted_refresh_token;
    if (!encryptedRefreshToken) return redirectWithStatus(request, redirectPath, { microsoft_error: "missing_refresh_token" });

    const { data: account, error: accountError } = await admin.from("microsoft_accounts").upsert({
      workspace_id: membership.workspace_id,
      owner_user_id: user.id,
      email: profile.email,
      display_name: profile.displayName,
      graph_user_id: profile.graphUserId,
      encrypted_access_token: encryptToken(tokens.access_token!, encryptionKey),
      encrypted_refresh_token: encryptedRefreshToken,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      sync_status: "pending",
      active: true,
    }, { onConflict: "workspace_id,email" }).select("id").single();
    if (accountError || !account) throw accountError || new Error("microsoft_account_not_saved");

    const { error: permissionError } = await admin.from("microsoft_account_permissions").upsert({
      workspace_id: membership.workspace_id,
      microsoft_account_id: account.id,
      user_id: user.id,
      can_read: true,
      can_draft: true,
      can_send: true,
      can_manage: true,
      active: true,
    }, { onConflict: "microsoft_account_id,user_id" });
    if (permissionError) throw permissionError;

    const { data: identity, error: identityError } = await admin.from("sender_identities")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("microsoft_account_id", account.id)
      .maybeSingle();
    if (identityError) throw identityError;
    if (!identity) {
      const { error: insertIdentityError } = await admin.from("sender_identities").insert({
        workspace_id: membership.workspace_id,
        user_id: user.id,
        microsoft_account_id: account.id,
        display_name: profile.displayName,
        active: true,
      });
      if (insertIdentityError) throw insertIdentityError;
    }
    return redirectWithStatus(request, redirectPath, { microsoft_connected: profile.email });
  } catch (error) {
    const code = error instanceof Error && error.message.includes("dominio uc.cl") ? "unsupported_domain" : "server_error";
    return redirectWithStatus(request, DEFAULT_REDIRECT, { microsoft_error: code });
  }
}

function redirectWithStatus(request: NextRequest, redirectPath: string, params: Record<string, string>) {
  const url = new URL(getSafeOAuthRedirectPath(redirectPath), request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: MICROSOFT_OAUTH_NONCE_COOKIE, path: "/api/microsoft/callback" });
  return response;
}
