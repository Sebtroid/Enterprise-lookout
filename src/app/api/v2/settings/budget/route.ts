import { z } from "zod";

import { getSettingsOwnerContext, safeRequestJson } from "@/lib/v2/settings-api";

const budgetSchema = z.object({
  limitUsd: z.number().finite().min(0).max(1_000_000),
}).strict();

export async function PATCH(request: Request) {
  const context = await getSettingsOwnerContext();
  if (!context.ok) return context.response;

  const parsed = budgetSchema.safeParse(await safeRequestJson(request));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const { data, error } = await context.supabase
    .from("workspace_ai_settings")
    .upsert({
      workspace_id: context.workspaceId,
      minimax_monthly_budget_usd: parsed.data.limitUsd,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" })
    .select("minimax_monthly_budget_usd")
    .single();

  if (error || !data) return Response.json({ error: "settings_unavailable" }, { status: 503 });
  return Response.json({ limitUsd: Number(data.minimax_monthly_budget_usd) });
}
