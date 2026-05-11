import type {
  AppCompany,
  AppContact,
  AppMessage,
  AppReply,
} from "./demo-data";
import type { CampaignContactStatus } from "./types";

export type CompanyCampaignDecision = "fit" | "maybe" | "not_fit";

export type CompanyExplorerMembership = "in_campaign" | "not_evaluated";

export type CompanyExplorerStatus =
  | AppCompany["status"]
  | "not_evaluated"
  | "do_not_contact";

export type CompanyExplorerRecord = {
  company: AppCompany;
  campaignCompany: AppCompany | null;
  membership: CompanyExplorerMembership;
  campaignStatus: CompanyExplorerStatus;
  fitScore: number;
  contacts: AppContact[];
  messages: AppMessage[];
  replies: AppReply[];
  lastInteractionAt: string | null;
  frequencyWarning: FrequencyWarning;
  searchText: string;
};

export type CompanyExplorerFilters = {
  query: string;
  membership: "all" | CompanyExplorerMembership;
  status: "all" | CompanyExplorerStatus;
};

export type FrequencyWarning = {
  blocked: boolean;
  daysSince: number | null;
  nextAllowedAt: string | null;
  label: string;
};

export type CampaignCompanyDecisionPatch = {
  status: CampaignContactStatus;
  fitScore: number;
  priorityScore: number;
  selectedContactReason: string;
  campaignNotes: string;
};

export function buildCompanyExplorerRecords({
  scope,
  allCompanies,
  campaignCompanies,
  contacts,
  messages,
  replies,
  now = new Date().toISOString(),
  cooldownDays = 21,
}: {
  scope: string;
  allCompanies: AppCompany[];
  campaignCompanies: AppCompany[];
  contacts: AppContact[];
  messages: AppMessage[];
  replies: AppReply[];
  now?: string;
  cooldownDays?: number;
}) {
  const campaignCompanyById = new Map(
    campaignCompanies.map((company) => [company.id, company]),
  );

  return allCompanies
    .map((company): CompanyExplorerRecord => {
      const campaignCompany = campaignCompanyById.get(company.id) ?? null;
      const companyContacts = contacts.filter(
        (contact) => contact.companyId === company.id,
      );
      const companyMessages = messages.filter(
        (message) => message.companyId === company.id,
      );
      const companyReplies = replies.filter(
        (reply) => reply.companyId === company.id,
      );
      const lastInteractionAt = getLastInteractionAt({
        company: campaignCompany ?? company,
        messages: companyMessages,
        replies: companyReplies,
      });
      const campaignStatus = getCampaignStatus({
        company,
        campaignCompany,
      });

      return {
        company,
        campaignCompany,
        membership:
          campaignCompany || company.campaignIds.includes(scope)
            ? "in_campaign"
            : "not_evaluated",
        campaignStatus,
        fitScore: campaignCompany?.fitScore ?? 0,
        contacts: companyContacts,
        messages: companyMessages,
        replies: companyReplies,
        lastInteractionAt,
        frequencyWarning: getFrequencyWarning({
          lastInteractionAt,
          now,
          cooldownDays,
        }),
        searchText: buildSearchText({
          company,
          campaignCompany,
          contacts: companyContacts,
          messages: companyMessages,
          replies: companyReplies,
        }),
      };
    })
    .sort((a, b) => {
      if (a.membership !== b.membership) {
        return a.membership === "in_campaign" ? -1 : 1;
      }
      if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
      return a.company.name.localeCompare(b.company.name);
    });
}

export function filterCompanyExplorerRecords(
  records: CompanyExplorerRecord[],
  filters: CompanyExplorerFilters,
) {
  const query = normalizeSearch(filters.query);

  return records.filter((record) => {
    if (filters.membership !== "all" && record.membership !== filters.membership) {
      return false;
    }

    if (filters.status !== "all" && record.campaignStatus !== filters.status) {
      return false;
    }

    if (!query) return true;
    return record.searchText.includes(query);
  });
}

export function getFrequencyWarning({
  lastInteractionAt,
  now,
  cooldownDays = 21,
}: {
  lastInteractionAt: string | null;
  now: string;
  cooldownDays?: number;
}): FrequencyWarning {
  if (!lastInteractionAt) {
    return {
      blocked: false,
      daysSince: null,
      nextAllowedAt: null,
      label: "Sin contacto registrado",
    };
  }

  const last = new Date(lastInteractionAt);
  const current = new Date(now);

  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) {
    return {
      blocked: false,
      daysSince: null,
      nextAllowedAt: null,
      label: "Última interacción sin fecha válida",
    };
  }

  const daysSince = Math.max(
    0,
    Math.floor((current.getTime() - last.getTime()) / 86_400_000),
  );
  const nextAllowed = new Date(last);
  nextAllowed.setUTCDate(nextAllowed.getUTCDate() + cooldownDays);
  const nextAllowedAt = nextAllowed.toISOString().slice(0, 10);
  const blocked = daysSince < cooldownDays;

  return {
    blocked,
    daysSince,
    nextAllowedAt: blocked ? nextAllowedAt : null,
    label: blocked
      ? `Contactado hace ${daysSince} días; esperar hasta ${nextAllowedAt}`
      : `Último contacto hace ${daysSince} días`,
  };
}

export function getCampaignCompanyDecisionPatch(
  decision: CompanyCampaignDecision,
): CampaignCompanyDecisionPatch {
  if (decision === "fit") {
    return {
      status: "ready_to_draft",
      fitScore: 75,
      priorityScore: 70,
      selectedContactReason: "Marcada como fit desde la base general.",
      campaignNotes: "Sirve para este proyecto. Redacción solicitada a Dom.",
    };
  }

  if (decision === "maybe") {
    return {
      status: "needs_research",
      fitScore: 45,
      priorityScore: 40,
      selectedContactReason: "Marcada para investigar desde la base general.",
      campaignNotes: "Revisar fit antes de redactar.",
    };
  }

  return {
    status: "closed_negative",
    fitScore: 0,
    priorityScore: 0,
    selectedContactReason: "Descartada para este proyecto desde la base general.",
    campaignNotes: "No sirve para este proyecto.",
  };
}

function getCampaignStatus({
  company,
  campaignCompany,
}: {
  company: AppCompany;
  campaignCompany: AppCompany | null;
}): CompanyExplorerStatus {
  if (company.doNotContact || campaignCompany?.doNotContact) {
    return "do_not_contact";
  }

  return campaignCompany?.status ?? "not_evaluated";
}

function getLastInteractionAt({
  company,
  messages,
  replies,
}: {
  company: AppCompany;
  messages: AppMessage[];
  replies: AppReply[];
}) {
  const dates = [
    company.lastContactedAt,
    ...messages.map((message) => message.sentAt ?? message.createdAt),
    ...replies.map((reply) => reply.receivedAt),
  ].filter((value): value is string => Boolean(value));

  const latest = dates
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return latest?.toISOString() ?? null;
}

function buildSearchText({
  company,
  campaignCompany,
  contacts,
  messages,
  replies,
}: {
  company: AppCompany;
  campaignCompany: AppCompany | null;
  contacts: AppContact[];
  messages: AppMessage[];
  replies: AppReply[];
}) {
  return normalizeSearch(
    [
      company.name,
      company.domain,
      company.website,
      company.industry,
      company.region,
      company.description,
      company.notes,
      campaignCompany?.campaignNotes,
      campaignCompany?.futureNotes,
      campaignCompany?.selectedContactReason,
      ...contacts.flatMap((contact) => [
        contact.name,
        contact.role,
        contact.email,
        contact.category,
        contact.source,
        contact.notes,
      ]),
      ...messages.flatMap((message) => [
        message.subject,
        message.body,
        message.status,
        message.futureNote,
      ]),
      ...replies.flatMap((reply) => [
        reply.body,
        reply.draftResponse,
        reply.classification,
        reply.futureNote,
      ]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
