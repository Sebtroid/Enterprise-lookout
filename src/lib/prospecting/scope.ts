import {
  campaigns,
  companies,
  contacts,
  importBatches,
  messages,
  replies,
  senders,
} from "./demo-data";

export const ALL_CAMPAIGNS_SCOPE = "all";

export function isAllCampaignsScope(scope: string) {
  return scope === ALL_CAMPAIGNS_SCOPE;
}

export function getCampaignScope(scope: string) {
  if (isAllCampaignsScope(scope)) return null;
  return campaigns.find((campaign) => campaign.id === scope) ?? null;
}

export function getScopeLabel(scope: string) {
  return getCampaignScope(scope)?.name ?? "Todos los proyectos";
}

export function getCampaignRouteParams() {
  return [
    { campaignId: ALL_CAMPAIGNS_SCOPE },
    ...campaigns.map((campaign) => ({ campaignId: campaign.id })),
  ];
}

export function getScopedCompanies(scope: string) {
  if (isAllCampaignsScope(scope)) return companies;
  return companies.filter((company) => company.campaignIds.includes(scope));
}

export function getScopedContacts(scope: string) {
  const companyIds = new Set(getScopedCompanies(scope).map((company) => company.id));
  return contacts.filter((contact) => companyIds.has(contact.companyId));
}

export function getScopedMessages(scope: string) {
  if (isAllCampaignsScope(scope)) return messages;
  return messages.filter((message) => message.campaignId === scope);
}

export function getScopedReplies(scope: string) {
  if (isAllCampaignsScope(scope)) return replies;
  const messageIds = new Set(getScopedMessages(scope).map((message) => message.id));
  return replies.filter((reply) => messageIds.has(reply.messageId));
}

export function getScopedSenders(scope: string) {
  if (isAllCampaignsScope(scope)) return senders;
  return senders.filter((sender) => sender.campaignId === scope);
}

export function getScopedImportBatches(scope: string) {
  if (isAllCampaignsScope(scope)) return importBatches;
  return importBatches.filter((batch) => batch.campaignId === scope);
}

export function getScopedDashboardStats(scope: string) {
  const scopedCompanies = getScopedCompanies(scope);
  const scopedMessages = getScopedMessages(scope);
  const scopedReplies = getScopedReplies(scope);

  return {
    activeCompanies: scopedCompanies.filter(
      (company) =>
        !["closed_negative", "closed_positive"].includes(company.status),
    ).length,
    pendingMessages: scopedMessages.filter(
      (message) => message.status === "needs_review",
    ).length,
    approvedMessages: scopedMessages.filter(
      (message) => message.status === "approved",
    ).length,
    repliesPending: scopedReplies.filter(
      (reply) => reply.approvalStatus === "needs_review",
    ).length,
  };
}
