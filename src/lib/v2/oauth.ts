import { createHash, randomBytes } from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const ENTERPRISE_OAUTH_SCOPES = ["workspace:read", "research:read", "research:write", "knowledge:write", "mail:read", "mail:draft", "jobs:write"] as const;

export function randomOAuthToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
export function hashOAuthToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function verifyPkce(verifier: string, challenge: string) { return createHash("sha256").update(verifier).digest("base64url") === challenge; }
export function normalizeScopes(value: string | null) { const requested = (value ?? "workspace:read").split(/\s+/).filter(Boolean); const invalid = requested.filter((scope) => !(ENTERPRISE_OAUTH_SCOPES as readonly string[]).includes(scope)); if (invalid.length) throw new Error(`Scopes no permitidos: ${invalid.join(", ")}`); return [...new Set(requested)]; }
export function isSafeRedirectUri(value: string) { try { const url = new URL(value); return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)); } catch { return false; } }

export async function validateOAuthClient(clientId: string, redirectUri: string) { const admin = getSupabaseAdminClient(); if (!admin) throw new Error("OAuth requiere Supabase configurado"); const { data } = await admin.from("oauth_clients").select("client_id,client_name,redirect_uris").eq("client_id", clientId).maybeSingle(); if (!data || !data.redirect_uris.includes(redirectUri)) throw new Error("Cliente OAuth o redirect_uri inválido"); return data; }
