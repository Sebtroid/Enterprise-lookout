import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const workspaceSecretKeySchema = z.enum([
  "supabase-db-password",
  "gmail-client-id",
  "gmail-client-secret",
  "gmail-token-encryption-key",
  "microsoft-client-id",
  "microsoft-client-secret",
  "microsoft-tenant-id",
  "minimax-api-key",
  "minimax-model",
  "hunter-api-key",
  "cron-secret",
]);

export type WorkspaceSecretKey = z.infer<typeof workspaceSecretKeySchema>;

type OwnerContext = {
  ok: true;
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
  userId: string;
  workspaceId: string;
};

export async function getSettingsOwnerContext(): Promise<OwnerContext | { ok: false; response: Response }> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };

  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, response: Response.json({ error: "settings_unavailable" }, { status: 503 }) };

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !membership) return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  if (membership.role !== "owner") return { ok: false, response: Response.json({ error: "owner_required" }, { status: 403 }) };

  return {
    ok: true,
    supabase,
    userId: user.id,
    workspaceId: membership.workspace_id,
  };
}

export async function safeRequestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
