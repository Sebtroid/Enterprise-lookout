import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashOAuthToken, randomOAuthToken, verifyPkce } from "@/lib/v2/oauth";

export async function POST(request: Request) {
  const form = await request.formData();
  const code = form.get("code"); const verifier = form.get("code_verifier"); const clientId = form.get("client_id"); const redirectUri = form.get("redirect_uri"); const resource = form.get("resource");
  if ([code, verifier, clientId, redirectUri].some((value) => typeof value !== "string") || form.get("grant_type") !== "authorization_code") return Response.json({ error: "invalid_request" }, { status: 400 });
  const admin = getSupabaseAdminClient(); if (!admin) return Response.json({ error: "server_error" }, { status: 503 });
  const { data: grant } = await admin.from("oauth_authorization_codes").select("*").eq("code_hash", hashOAuthToken(String(code))).is("used_at", null).maybeSingle();
  if (!grant || new Date(grant.expires_at) <= new Date() || grant.client_id !== clientId || grant.redirect_uri !== redirectUri || (resource && grant.resource !== resource) || !verifyPkce(String(verifier), grant.code_challenge)) return Response.json({ error: "invalid_grant" }, { status: 400 });
  const { data: consumed } = await admin.from("oauth_authorization_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", grant.code_hash).is("used_at", null).select("code_hash").maybeSingle();
  if (!consumed) return Response.json({ error: "invalid_grant" }, { status: 400 });
  const accessToken = randomOAuthToken(36); const expiresIn = 30 * 24 * 60 * 60;
  const { error } = await admin.from("tool_connections").insert({ workspace_id: grant.workspace_id, user_id: grant.user_id, provider: "chatgpt", label: "ChatGPT / Codex", token_hash: hashOAuthToken(accessToken), scopes: grant.scopes, expires_at: new Date(Date.now() + expiresIn * 1000).toISOString() });
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json({ access_token: accessToken, token_type: "Bearer", expires_in: expiresIn, scope: grant.scopes.join(" "), resource: grant.resource }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
