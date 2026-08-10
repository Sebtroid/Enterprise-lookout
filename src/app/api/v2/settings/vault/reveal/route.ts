import { z } from "zod";

import { getSettingsOwnerContext, safeRequestJson, workspaceSecretKeySchema } from "@/lib/v2/settings-api";

const revealSchema = z.object({ key: workspaceSecretKeySchema }).strict();

export async function POST(request: Request) {
  const context = await getSettingsOwnerContext();
  if (!context.ok) return context.response;

  const parsed = revealSchema.safeParse(await safeRequestJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const { data, error } = await context.supabase.rpc("reveal_workspace_secret", {
    target_workspace_id: context.workspaceId,
    target_secret_key: parsed.data.key,
  });

  if (error || typeof data !== "string") {
    return Response.json({ error: "settings_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return Response.json({ key: parsed.data.key, value: data }, {
    headers: { "Cache-Control": "no-store" },
  });
}
