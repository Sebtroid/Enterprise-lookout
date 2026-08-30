import { z } from "zod";

import { getSettingsOwnerContext, safeRequestJson, workspaceSecretKeySchema } from "@/lib/v2/settings-api";

const replaceSchema = z.object({
  key: workspaceSecretKeySchema,
  value: z.string().min(1).max(16_384),
}).strict();

export async function POST(request: Request) {
  const context = await getSettingsOwnerContext();
  if (!context.ok) return context.response;

  const parsed = replaceSchema.safeParse(await safeRequestJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const { error } = await context.admin.rpc("replace_workspace_secret", {
    target_workspace_id: context.workspaceId,
    target_secret_key: parsed.data.key,
    target_secret_value: parsed.data.value,
  });

  if (error) return Response.json({ error: "settings_unavailable" }, { status: 503 });
  return Response.json({ key: parsed.data.key, configured: true });
}
