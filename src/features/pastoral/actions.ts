"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPostgresClient } from "@/lib/supabase/postgres";

const memoryRuleSchema = z.object({
  ruleId: z.string().uuid(),
  scope: z.string().min(1),
});

export async function deactivatePastoralMemoryRuleAction(formData: FormData) {
  const parsed = memoryRuleSchema.safeParse({
    ruleId: String(formData.get("ruleId") ?? ""),
    scope: String(formData.get("scope") ?? "pastoral-invierno-2026"),
  });

  if (!parsed.success) return;

  const sql = getPostgresClient();
  if (!sql) return;

  await sql`
    update ai_memory_rules
    set active = false, updated_at = now()
    where id = ${parsed.data.ruleId}
  `;

  revalidatePath(`/campaigns/${parsed.data.scope}/pastoral`);
}
