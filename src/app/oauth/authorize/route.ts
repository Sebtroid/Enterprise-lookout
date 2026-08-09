import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashOAuthToken, normalizeScopes, randomOAuthToken, validateOAuthClient } from "@/lib/v2/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const client = await validateRequest(url.searchParams, url.origin);
    const scopes = normalizeScopes(url.searchParams.get("scope"));
    return new Response(consentHtml(client.client_name, scopes, url.searchParams), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: "invalid_request", error_description: error instanceof Error ? error.message : "Solicitud OAuth inválida" }, { status: 400 }); }
}

export async function POST(request: Request) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "access_denied" }, { status: 401 });
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const key of ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "scope", "state", "resource"]) { const value = form.get(key); if (typeof value === "string") params.set(key, value); }
  const origin = new URL(request.url).origin;
  try {
    await validateRequest(params, origin);
    const scopes = normalizeScopes(params.get("scope"));
    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("OAuth no está disponible");
    const { data: membership } = await admin.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (!membership) throw new Error("Tu perfil no pertenece a un workspace");
    const code = randomOAuthToken();
    const { error } = await admin.from("oauth_authorization_codes").insert({ code_hash: hashOAuthToken(code), client_id: params.get("client_id"), workspace_id: membership.workspace_id, user_id: user.id, redirect_uri: params.get("redirect_uri"), resource: params.get("resource"), scopes, code_challenge: params.get("code_challenge"), expires_at: new Date(Date.now() + 5 * 60_000).toISOString() });
    if (error) throw error;
    const redirect = new URL(params.get("redirect_uri")!); redirect.searchParams.set("code", code); if (params.get("state")) redirect.searchParams.set("state", params.get("state")!); return Response.redirect(redirect, 303);
  } catch (error) { return Response.json({ error: "invalid_request", error_description: error instanceof Error ? error.message : "No se pudo autorizar" }, { status: 400 }); }
}

async function validateRequest(params: URLSearchParams, origin: string) { const clientId = params.get("client_id"); const redirectUri = params.get("redirect_uri"); if (!clientId || !redirectUri) throw new Error("Faltan client_id o redirect_uri"); if (params.get("response_type") !== "code") throw new Error("Solo response_type=code está permitido"); if (params.get("code_challenge_method") !== "S256" || !params.get("code_challenge")) throw new Error("PKCE S256 es obligatorio"); if (params.get("resource") !== `${origin}/api/mcp`) throw new Error("Resource inválido"); return validateOAuthClient(clientId, redirectUri); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function consentHtml(clientName: string, scopes: string[], params: URLSearchParams) { const inputs = [...params.entries()].map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join(""); return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conectar Enterprise Lookout</title><style>body{font:15px system-ui;background:#f7f8f7;color:#17272d;margin:0;padding:32px}.card{max-width:520px;margin:8vh auto;background:white;border:1px solid #d8e0e2;border-radius:10px;padding:28px}h1{font-size:24px;margin:0 0 8px}p,li{line-height:1.55;color:#506168}button{border:0;border-radius:8px;background:#173f48;color:white;padding:11px 16px;font-weight:650;cursor:pointer}.note{font-size:12px}</style><main class="card"><h1>Conectar ${escapeHtml(clientName)}</h1><p>Esta conexión actuará con tu perfil y quedará registrada a tu nombre.</p><ul>${scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join("")}</ul><p class="note">La herramienta puede crear borradores e informes, pero nunca enviar correos.</p><form method="post">${inputs}<button type="submit">Autorizar conexión</button></form></main></html>`; }
