import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSafeRedirectUri, randomOAuthToken } from "@/lib/v2/oauth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { client_name?: string; redirect_uris?: string[] } | null;
  if (!body?.client_name || !body.redirect_uris?.length || body.redirect_uris.some((uri) => !isSafeRedirectUri(uri))) return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "server_error" }, { status: 503 });
  const clientId = `el_${randomOAuthToken(20)}`;
  const { error } = await admin.from("oauth_clients").insert({ client_id: clientId, client_name: body.client_name.slice(0, 120), redirect_uris: body.redirect_uris });
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json({ client_id: clientId, client_name: body.client_name, redirect_uris: body.redirect_uris, token_endpoint_auth_method: "none" }, { status: 201 });
}
