import type { V2ProviderState } from "@/lib/v2/types";

export function getGmailAccountState({ active, syncStatus }: { active: boolean; syncStatus: string }): V2ProviderState {
  if (!active) return "unavailable";
  if (syncStatus === "ready") return "connected";
  if (syncStatus === "error" || syncStatus === "disconnected") return "action_required";
  return "unavailable";
}

export function aggregateGmailProviderState(accountStates: V2ProviderState[], oauthConfigured: boolean): V2ProviderState {
  if (accountStates.includes("action_required")) return "action_required";
  if (accountStates.includes("unavailable")) return "unavailable";
  if (accountStates.includes("connected")) return "connected";
  return oauthConfigured ? "action_required" : "not_configured";
}
