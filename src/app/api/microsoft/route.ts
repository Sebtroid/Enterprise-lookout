import { NextRequest, NextResponse } from "next/server";

import { getAllowedUser } from "@/lib/auth/request";
import { getSafeOAuthRedirectPath } from "@/lib/gmail/connection-policy";
import {
  createOAuthNonce,
  hashOAuthNonce,
  MICROSOFT_OAUTH_NONCE_COOKIE,
  signOAuthState,
} from "@/lib/microsoft/oauth-state";
import { buildMicrosoftAuthorizationUrl } from "@/lib/microsoft/oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceRuntimeConfig } from "@/lib/v2/runtime-config";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://enterprise-lookout.vercel.app"}/api/microsoft/callback`;

export async function GET(request: NextRequest) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Workspace unavailable" }, { status: 503 });
  const { data: membership, error: membershipError } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .order("workspace_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ ok: false, error: "Workspace unavailable" }, { status: 503 });
  if (!membership) return NextResponse.json({ ok: false, error: "Workspace unavailable" }, { status: 403 });

  try {
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
      return NextResponse.json({ ok: false, error: "Missing Microsoft OAuth configuration" }, { status: 503 });
    }
    if (!['connect', 'url'].includes(new URL(request.url).searchParams.get("action") || "")) {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    const nonce = createOAuthNonce();
    const nonceHash = hashOAuthNonce(nonce, encryptionKey);
    const state = signOAuthState({
      redirect: getSafeOAuthRedirectPath(refererPath(request)),
      workspaceId: membership.workspace_id,
      userId: user.id,
      nonce,
    }, encryptionKey);
    const { error: nonceError } = await admin.rpc("create_microsoft_oauth_nonce", {
      target_nonce_hash: nonceHash,
      target_workspace_id: membership.workspace_id,
      target_user_id: user.id,
    });
    if (nonceError) return NextResponse.json({ ok: false, error: "OAuth state unavailable" }, { status: 503 });

    const authorizationUrl = buildMicrosoftAuthorizationUrl({ clientId, tenantId, redirectUri: REDIRECT_URI, state });
    const response = new URL(request.url).searchParams.get("action") === "connect"
      ? NextResponse.redirect(authorizationUrl)
      : NextResponse.json({ url: authorizationUrl });
    response.cookies.set(MICROSOFT_OAUTH_NONCE_COOKIE, nonceHash, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/microsoft/callback",
      maxAge: 600,
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Microsoft OAuth unavailable" }, { status: 503 });
  }
}

function refererPath(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.origin !== new URL(request.url).origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
