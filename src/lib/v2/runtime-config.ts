import { timingSafeEqual } from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WorkspaceSecretKey } from "@/lib/v2/settings-api";

const ENV_KEYS: Record<WorkspaceSecretKey, string> = {
  "supabase-db-password": "SUPABASE_DB_PASSWORD",
  "gmail-client-id": "GMAIL_CLIENT_ID",
  "gmail-client-secret": "GMAIL_CLIENT_SECRET",
  "gmail-token-encryption-key": "GMAIL_TOKEN_ENCRYPTION_KEY",
  "microsoft-client-id": "MICROSOFT_CLIENT_ID",
  "microsoft-client-secret": "MICROSOFT_CLIENT_SECRET",
  "microsoft-tenant-id": "MICROSOFT_TENANT_ID",
  "minimax-api-key": "MINIMAX_API_KEY",
  "minimax-model": "MINIMAX_MODEL",
  "hunter-api-key": "HUNTER_API_KEY",
  "cron-secret": "CRON_SECRET",
};

export async function getWorkspaceRuntimeConfig(workspaceId: string, keys: WorkspaceSecretKey[]) {
  const admin = getSupabaseAdminClient();
  const entries = await Promise.all(keys.map(async (key) => {
    let vaultValue: string | null = null;
    if (admin) {
      const { data, error } = await admin.rpc("get_workspace_runtime_secret", { target_workspace_id: workspaceId, target_secret_key: key });
      if (error) throw new Error("No se pudo leer la configuración segura del workspace");
      if (typeof data === "string" && data.length > 0) vaultValue = data;
    }
    return [key, vaultValue ?? process.env[ENV_KEYS[key]] ?? null] as const;
  }));
  if (!admin) throw new Error("No se pudo leer el presupuesto de IA");
  const { data: budgetData, error: budgetError } = await admin.from("workspace_ai_settings").select("minimax_monthly_budget_usd").eq("workspace_id", workspaceId).maybeSingle();
  if (budgetError) throw new Error("No se pudo leer el presupuesto de IA");
  const budgetValue: unknown = budgetData?.minimax_monthly_budget_usd ?? null;
  const envBudget = Number(process.env.MINIMAX_MONTHLY_BUDGET_USD ?? 5);
  const budgetUsd = budgetValue === null ? envBudget : Number(budgetValue);
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) throw new Error("Presupuesto de IA inválido");
  return { secrets: Object.fromEntries(entries) as Partial<Record<WorkspaceSecretKey, string | null>>, budgetUsd };
}

export async function listWorkspaceIds() {
  const admin = getSupabaseAdminClient(); if (!admin) throw new Error("Configuración de servidor no disponible");
  const { data, error } = await admin.from("workspaces").select("id");
  if (error) throw new Error("No se pudieron listar los workspaces");
  return (data ?? []).map((row) => String(row.id));
}

export async function authorizeWorkspaceCronRequest(header: string | null, workspaceIds: string[]) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return [];
  const authorized: string[] = [];
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Configuración de servidor no disponible");
  for (const workspaceId of workspaceIds) {
    const { data, error } = await admin.rpc("get_workspace_runtime_secret", { target_workspace_id: workspaceId, target_secret_key: "cron-secret" });
    if (error) throw new Error("No se pudo leer la configuración segura del workspace");
    if (safeSecretEqual(token, typeof data === "string" ? data : null)) authorized.push(workspaceId);
  }
  return authorized;
}

function safeSecretEqual(left: string, right: string | null | undefined) {
  if (!right) return false;
  const leftBytes = Buffer.from(left); const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
