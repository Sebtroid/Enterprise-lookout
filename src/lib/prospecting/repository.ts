import {
  campaigns as demoCampaigns,
  companies as demoCompanies,
  contacts as demoContacts,
  importBatches as demoImportBatches,
  messages as demoMessages,
  replies as demoReplies,
  senders as demoSenders,
  type AppCampaign,
  type AppCompany,
  type AppContact,
  type AppImportBatch,
  type AppMessage,
  type AppReply,
  type AppSender,
} from "@/lib/prospecting/demo-data";
import {
  getContextScopeId,
  getContextSlugFromScope,
  isContextScope,
  slugifyContextName,
  type ProjectContext,
} from "@/lib/prospecting/context";
import { getPostgresClient } from "@/lib/supabase/postgres";

export const ALL_CAMPAIGNS_SCOPE = "all";

export type ProspectingStats = {
  activeCompanies: number;
  pendingMessages: number;
  approvedMessages: number;
  repliesPending: number;
};

export type ProspectingSnapshot = {
  campaigns: AppCampaign[];
  campaign: AppCampaign | null;
  context: ProjectContext | null;
  companies: AppCompany[];
  contacts: AppContact[];
  messages: AppMessage[];
  replies: AppReply[];
  senders: AppSender[];
  importBatches: AppImportBatch[];
  stats: ProspectingStats;
};

type DbRow = Record<string, unknown>;
type ScopeLookup = {
  campaign: AppCampaign | null;
  context: ProjectContext | null;
  contextOrganizations: string[];
};

export function isAllCampaignsScope(scope: string) {
  return scope === ALL_CAMPAIGNS_SCOPE;
}

export async function getCampaignsData() {
  const sql = getPostgresClient();

  if (!sql) {
    return demoCampaigns;
  }

  try {
    const rows = await sql`
      select
        slug,
        name,
        organization,
        description,
        status::text as status,
        value_proposition,
        starts_on
      from campaigns
      order by created_at asc
    `;

    return rows.map(mapCampaign);
  } catch (error) {
    console.error("Falling back to demo campaigns", error);
    return demoCampaigns;
  }
}

export async function hasCampaignScope(scope: string) {
  if (isAllCampaignsScope(scope)) {
    return true;
  }

  const campaigns = await getCampaignsData();
  if (isContextScope(scope)) {
    return getProjectContextsData(campaigns).some(
      (context) => context.id === scope,
    );
  }

  return campaigns.some((campaign) => campaign.id === scope);
}

export async function getCampaignRouteParamsData() {
  const campaigns = await getCampaignsData();
  const contexts = getProjectContextsData(campaigns);

  return [
    { campaignId: ALL_CAMPAIGNS_SCOPE },
    ...contexts.map((context) => ({ campaignId: context.id })),
    ...campaigns.map((campaign) => ({ campaignId: campaign.id })),
  ];
}

export async function getProspectingSnapshot(
  scope: string,
): Promise<ProspectingSnapshot> {
  const campaigns = await getCampaignsData();
  const scopeLookup = getScopeLookup(scope, campaigns);
  const [companies, contacts, messages, replies, senders, importBatches] =
    await Promise.all([
      getCompaniesData(scope, scopeLookup.contextOrganizations),
      getContactsData(scope, scopeLookup.contextOrganizations),
      getMessagesData(scope, scopeLookup.contextOrganizations),
      getRepliesData(scope, scopeLookup.contextOrganizations),
      getSendersData(scope, scopeLookup.contextOrganizations),
      getImportBatchesData(scope, scopeLookup.contextOrganizations),
    ]);

  return {
    campaigns,
    campaign: scopeLookup.campaign,
    context: scopeLookup.context,
    companies,
    contacts,
    messages,
    replies,
    senders,
    importBatches,
    stats: getStats(companies, messages, replies),
  };
}

export function getProjectContextsData(campaigns: AppCampaign[]) {
  const grouped = new Map<string, ProjectContext>();

  for (const campaign of campaigns) {
    const slug = slugifyContextName(campaign.organization);
    if (!slug) continue;
    const id = getContextScopeId(campaign.organization);
    const current = grouped.get(slug);
    if (current) {
      current.projectCount += 1;
    } else {
      grouped.set(slug, {
        id,
        name: campaign.organization,
        projectCount: 1,
      });
    }
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCompaniesData(
  scope: string,
  contextOrganizationsOverride?: string[],
) {
  const sql = getPostgresClient();

  if (!sql) {
    return filterDemoCompanies(scope);
  }

  try {
    const contextOrganizations =
      contextOrganizationsOverride ?? (await getContextOrganizationsForScope(scope));
    const scopeFilter = isAllCampaignsScope(scope)
      ? sql``
      : isContextScope(scope)
        ? contextOrganizations.length
          ? sql`where c.organization = any(${contextOrganizations}::text[])`
          : sql`where false`
        : sql`where c.slug = ${scope}`;

    const rows = await sql`
      select
        co.id::text as id,
        co.canonical_name as name,
        co.domain,
        co.website,
        co.industry,
        co.region,
        coalesce(co.description, co.global_notes, '') as description,
        co.global_notes as notes,
        co.do_not_contact,
        coalesce(max(cc.fit_score), 0)::int as fit_score,
        coalesce(
          (array_agg(cc.status::text order by cc.updated_at desc) filter (where cc.id is not null))[1],
          'new'
        ) as status,
        coalesce(
          array_agg(distinct c.slug) filter (where c.slug is not null),
          '{}'
        ) as campaign_ids,
        coalesce(
          array_agg(distinct el.url) filter (where el.url is not null),
          '{}'
        ) as evidence_urls,
        coalesce(
          (array_agg(cc.selected_contact_reason order by cc.updated_at desc) filter (where nullif(cc.selected_contact_reason, '') is not null))[1],
          ''
        ) as selected_contact_reason,
        coalesce(
          (array_agg(cc.campaign_notes order by cc.updated_at desc) filter (where nullif(cc.campaign_notes, '') is not null))[1],
          ''
        ) as campaign_notes,
        coalesce(
          (array_agg(cc.future_notes order by cc.updated_at desc) filter (where nullif(cc.future_notes, '') is not null))[1],
          ''
        ) as future_notes,
        max(cc.last_contacted_at) as last_contacted_at
      from companies co
      left join campaign_contacts cc on cc.company_id = co.id
      left join campaigns c on c.id = cc.campaign_id
      left join evidence_links el on el.company_id = co.id
      ${scopeFilter}
      group by co.id
      order by max(cc.priority_score) desc nulls last, co.canonical_name asc
    `;

    return rows.map(mapCompany);
  } catch (error) {
    console.error("Falling back to demo companies", error);
    return filterDemoCompanies(scope);
  }
}

export async function getContactsData(
  scope: string,
  contextOrganizationsOverride?: string[],
) {
  const sql = getPostgresClient();

  if (!sql) {
    return filterDemoContacts(scope);
  }

  try {
    const contextOrganizations =
      contextOrganizationsOverride ?? (await getContextOrganizationsForScope(scope));
    const rows = isAllCampaignsScope(scope)
      ? await sql`
          select
            ct.id::text as id,
            ct.company_id::text as company_id,
            ct.full_name,
            ct.role,
            ct.email::text as email,
            ct.phone,
            ct.category,
            ct.confidence,
            ct.verification_status::text as verification_status,
            ct.verified_at,
            ct.bounce_count,
            ct.source,
            ct.is_decision_maker,
            ct.do_not_contact,
            ct.global_notes
          from contacts ct
          order by ct.created_at desc
        `
      : isContextScope(scope)
        ? await sql`
          select distinct
            ct.id::text as id,
            ct.company_id::text as company_id,
            ct.full_name,
            ct.role,
            ct.email::text as email,
            ct.phone,
            ct.category,
            ct.confidence,
            ct.verification_status::text as verification_status,
            ct.verified_at,
            ct.bounce_count,
            ct.source,
            ct.is_decision_maker,
            ct.do_not_contact,
            ct.global_notes
          from contacts ct
          join campaign_contacts cc on cc.contact_id = ct.id
          join campaigns c on c.id = cc.campaign_id
          where ${
            contextOrganizations.length
              ? sql`c.organization = any(${contextOrganizations}::text[])`
              : sql`false`
          }
          order by ct.full_name asc
        `
      : await sql`
          select distinct
            ct.id::text as id,
            ct.company_id::text as company_id,
            ct.full_name,
            ct.role,
            ct.email::text as email,
            ct.phone,
            ct.category,
            ct.confidence,
            ct.verification_status::text as verification_status,
            ct.verified_at,
            ct.bounce_count,
            ct.source,
            ct.is_decision_maker,
            ct.do_not_contact,
            ct.global_notes
          from contacts ct
          join campaign_contacts cc on cc.contact_id = ct.id
          join campaigns c on c.id = cc.campaign_id
          where c.slug = ${scope}
          order by ct.full_name asc
        `;

    return rows.map(mapContact);
  } catch (error) {
    console.error("Falling back to demo contacts", error);
    return filterDemoContacts(scope);
  }
}

export async function getMessagesData(
  scope: string,
  contextOrganizationsOverride?: string[],
) {
  const sql = getPostgresClient();

  if (!sql) {
    return filterDemoMessages(scope);
  }

  try {
    const contextOrganizations =
      contextOrganizationsOverride ?? (await getContextOrganizationsForScope(scope));
    const scopeFilter = isAllCampaignsScope(scope)
      ? sql``
      : isContextScope(scope)
        ? contextOrganizations.length
          ? sql`and c.organization = any(${contextOrganizations}::text[])`
          : sql`and false`
        : sql`and c.slug = ${scope}`;

    const rows = await sql`
      select
        m.id::text as id,
        c.slug as campaign_id,
        m.company_id::text as company_id,
        m.contact_id::text as contact_id,
        m.sender_account_id::text as sender_id,
        m.kind::text as kind,
        m.status::text as status,
        coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
        coalesce(m.body_final, m.body_draft, '') as body,
        coalesce(m.future_note, '') as future_note,
        m.created_at,
        m.sent_at
      from messages m
      join campaigns c on c.id = m.campaign_id
      where m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
      ${scopeFilter}
      order by coalesce(m.sent_at, m.updated_at, m.created_at) desc
    `;

    return rows.map(mapMessage);
  } catch (error) {
    console.error("Falling back to demo messages", error);
    return filterDemoMessages(scope);
  }
}

export async function getRepliesData(
  scope: string,
  contextOrganizationsOverride?: string[],
) {
  const sql = getPostgresClient();

  if (!sql) {
    return filterDemoReplies(scope);
  }

  try {
    const contextOrganizations =
      contextOrganizationsOverride ?? (await getContextOrganizationsForScope(scope));
    const scopeFilter = isAllCampaignsScope(scope)
      ? sql``
      : isContextScope(scope)
        ? contextOrganizations.length
          ? sql`and c.organization = any(${contextOrganizations}::text[])`
          : sql`and false`
        : sql`and c.slug = ${scope}`;

    const rows = await sql`
      select
        m.id::text as id,
        m.id::text as message_id,
        m.company_id::text as company_id,
        m.contact_id::text as contact_id,
        m.sender_account_id::text as sender_id,
        coalesce(m.reply_classification, 'needs_info') as classification,
        coalesce(m.received_at, m.created_at) as received_at,
        coalesce(m.body_draft, '') as body,
        coalesce(m.body_final, '') as draft_response,
        m.status::text as approval_status,
        coalesce(m.future_note, '') as future_note
      from messages m
      join campaigns c on c.id = m.campaign_id
      where m.kind = 'inbound_reply'
      ${scopeFilter}
      order by coalesce(m.received_at, m.created_at) desc
    `;

    return rows.map(mapReply);
  } catch (error) {
    console.error("Falling back to demo replies", error);
    return filterDemoReplies(scope);
  }
}

export async function getSendersData(
  scope: string,
  contextOrganizationsOverride?: string[],
) {
  const sql = getPostgresClient();

  if (!sql) {
    return filterDemoSenders(scope);
  }

  try {
    const contextOrganizations =
      contextOrganizationsOverride ?? (await getContextOrganizationsForScope(scope));
    const scopeFilter = isAllCampaignsScope(scope)
      ? sql``
      : isContextScope(scope)
        ? contextOrganizations.length
          ? sql`where c.organization = any(${contextOrganizations}::text[])`
          : sql`where false`
        : sql`where c.slug = ${scope}`;

    const rows = await sql`
      select
        sa.id::text as id,
        c.slug as campaign_id,
        sa.email::text as email,
        sa.display_name,
        sa.organization,
        sa.account_type,
        sa.status::text as status,
        csa.is_default,
        csa.priority,
        sa.daily_limit,
        csa.campaign_daily_limit,
        coalesce(sent_counts.sent_today, 0)::int as sent_today,
        coalesce(sa.signature, '') as signature
      from campaign_sender_accounts csa
      join sender_accounts sa on sa.id = csa.sender_account_id
      join campaigns c on c.id = csa.campaign_id
      left join lateral (
        select count(*)::int as sent_today
        from messages m
        where m.sender_account_id = sa.id
          and m.campaign_id = c.id
          and m.status = 'sent'
          and m.sent_at::date = current_date
      ) sent_counts on true
      ${scopeFilter}
      order by c.name asc, csa.priority asc, sa.email asc
    `;

    return rows.map(mapSender);
  } catch (error) {
    console.error("Falling back to demo senders", error);
    return filterDemoSenders(scope);
  }
}

export async function getImportBatchesData(
  scope: string,
  contextOrganizationsOverride?: string[],
) {
  const sql = getPostgresClient();

  if (!sql) {
    return filterDemoImportBatches(scope);
  }

  try {
    const contextOrganizations =
      contextOrganizationsOverride ?? (await getContextOrganizationsForScope(scope));
    const rows = isAllCampaignsScope(scope)
      ? await sql`
          select
            ib.id::text as id,
            c.slug as campaign_id,
            ib.source_name,
            ib.source_type,
            ib.status::text as status,
            ib.row_count,
            ib.applied_count,
            ib.duplicate_count,
            ib.error_count,
            ib.created_at
          from import_batches ib
          left join campaigns c on c.id = ib.campaign_id
          order by ib.created_at desc
        `
      : isContextScope(scope)
        ? await sql`
          select
            ib.id::text as id,
            c.slug as campaign_id,
            ib.source_name,
            ib.source_type,
            ib.status::text as status,
            ib.row_count,
            ib.applied_count,
            ib.duplicate_count,
            ib.error_count,
            ib.created_at
          from import_batches ib
          join campaigns c on c.id = ib.campaign_id
          where ${
            contextOrganizations.length
              ? sql`c.organization = any(${contextOrganizations}::text[])`
              : sql`false`
          }
          order by ib.created_at desc
        `
      : await sql`
          select
            ib.id::text as id,
            c.slug as campaign_id,
            ib.source_name,
            ib.source_type,
            ib.status::text as status,
            ib.row_count,
            ib.applied_count,
            ib.duplicate_count,
            ib.error_count,
            ib.created_at
          from import_batches ib
          join campaigns c on c.id = ib.campaign_id
          where c.slug = ${scope}
          order by ib.created_at desc
        `;

    return rows.map(mapImportBatch);
  } catch (error) {
    console.error("Falling back to demo import batches", error);
    return filterDemoImportBatches(scope);
  }
}

function filterDemoCompanies(scope: string) {
  if (isAllCampaignsScope(scope)) return demoCompanies;
  if (isContextScope(scope)) {
    const campaignIds = getDemoCampaignIdsForContextScope(scope);
    return demoCompanies.filter((company) =>
      company.campaignIds.some((id) => campaignIds.has(id)),
    );
  }
  return demoCompanies.filter((company) => company.campaignIds.includes(scope));
}

function filterDemoContacts(scope: string) {
  if (isAllCampaignsScope(scope)) return demoContacts;
  const companyIds = new Set(filterDemoCompanies(scope).map((company) => company.id));
  return demoContacts.filter((contact) => companyIds.has(contact.companyId));
}

function filterDemoMessages(scope: string) {
  if (isAllCampaignsScope(scope)) return demoMessages;
  if (isContextScope(scope)) {
    const campaignIds = getDemoCampaignIdsForContextScope(scope);
    return demoMessages.filter((message) => campaignIds.has(message.campaignId));
  }
  return demoMessages.filter((message) => message.campaignId === scope);
}

function filterDemoReplies(scope: string) {
  if (isAllCampaignsScope(scope)) return demoReplies;
  const messageIds = new Set(filterDemoMessages(scope).map((message) => message.id));
  return demoReplies.filter((reply) => messageIds.has(reply.messageId));
}

function filterDemoSenders(scope: string) {
  if (isAllCampaignsScope(scope)) return demoSenders;
  if (isContextScope(scope)) {
    const campaignIds = getDemoCampaignIdsForContextScope(scope);
    return demoSenders.filter((sender) => campaignIds.has(sender.campaignId));
  }
  return demoSenders.filter((sender) => sender.campaignId === scope);
}

function filterDemoImportBatches(scope: string) {
  if (isAllCampaignsScope(scope)) return demoImportBatches;
  if (isContextScope(scope)) {
    const campaignIds = getDemoCampaignIdsForContextScope(scope);
    return demoImportBatches.filter((batch) =>
      batch.campaignId ? campaignIds.has(batch.campaignId) : false,
    );
  }
  return demoImportBatches.filter((batch) => batch.campaignId === scope);
}

async function getContextOrganizationsForScope(scope: string) {
  const campaigns = await getCampaignsData();
  return getContextOrganizationsFromCampaigns(scope, campaigns);
}

function getDemoCampaignIdsForContextScope(scope: string) {
  const contextSlug = getContextSlugFromScope(scope);
  return new Set(
    demoCampaigns
      .filter((campaign) => slugifyContextName(campaign.organization) === contextSlug)
      .map((campaign) => campaign.id),
  );
}

function getScopeLookup(scope: string, campaigns: AppCampaign[]): ScopeLookup {
  const campaign = isAllCampaignsScope(scope)
    ? null
    : campaigns.find((item) => item.id === scope) ?? null;
  const context = isContextScope(scope)
    ? getProjectContextsData(campaigns).find((item) => item.id === scope) ?? null
    : null;

  return {
    campaign,
    context,
    contextOrganizations: getContextOrganizationsFromCampaigns(scope, campaigns),
  };
}

function getContextOrganizationsFromCampaigns(
  scope: string,
  campaigns: AppCampaign[],
) {
  if (!isContextScope(scope)) return [];

  const contextSlug = getContextSlugFromScope(scope);
  return [
    ...new Set(
      campaigns
        .filter(
          (campaign) => slugifyContextName(campaign.organization) === contextSlug,
        )
        .map((campaign) => campaign.organization),
    ),
  ];
}

function getStats(
  companies: AppCompany[],
  messages: AppMessage[],
  replies: AppReply[],
): ProspectingStats {
  return {
    activeCompanies: companies.filter(
      (company) =>
        !["closed_negative", "closed_positive"].includes(company.status),
    ).length,
    pendingMessages: messages.filter(
      (message) => message.status === "needs_review",
    ).length,
    approvedMessages: messages.filter(
      (message) => message.status === "approved",
    ).length,
    repliesPending: replies.filter(
      (reply) => reply.approvalStatus === "needs_review",
    ).length,
  };
}

function mapCampaign(row: DbRow): AppCampaign {
  return {
    id: stringValue(row.slug),
    name: stringValue(row.name),
    organization: stringValue(row.organization),
    description: stringValue(row.description),
    status: stringValue(row.status) as AppCampaign["status"],
    valueProposition: stringValue(row.value_proposition),
    startsOn: dateValue(row.starts_on),
  };
}

function mapCompany(row: DbRow): AppCompany {
  return {
    id: stringValue(row.id),
    campaignIds: stringArray(row.campaign_ids),
    name: stringValue(row.name),
    domain: nullableString(row.domain),
    website: nullableString(row.website),
    industry: stringValue(row.industry),
    region: stringValue(row.region),
    description: stringValue(row.description),
    fitScore: numberValue(row.fit_score),
    status: stringValue(row.status) as AppCompany["status"],
    notes: stringValue(row.notes),
    campaignNotes: stringValue(row.campaign_notes),
    futureNotes: stringValue(row.future_notes),
    selectedContactReason: stringValue(row.selected_contact_reason),
    lastContactedAt: row.last_contacted_at ? isoValue(row.last_contacted_at) : null,
    doNotContact: booleanValue(row.do_not_contact),
    evidenceUrls: stringArray(row.evidence_urls),
  };
}

function mapContact(row: DbRow): AppContact {
  return {
    id: stringValue(row.id),
    companyId: stringValue(row.company_id),
    name: stringValue(row.full_name),
    role: stringValue(row.role),
    email: stringValue(row.email),
    phone: nullableString(row.phone),
    category: stringValue(row.category),
    confidence: numberValue(row.confidence),
    verificationStatus: stringValue(row.verification_status) as AppContact["verificationStatus"],
    verifiedAt: row.verified_at ? isoValue(row.verified_at) : null,
    bounceCount: numberValue(row.bounce_count),
    source: stringValue(row.source),
    isDecisionMaker: booleanValue(row.is_decision_maker),
    doNotContact: booleanValue(row.do_not_contact),
    notes: stringValue(row.global_notes),
  };
}

function mapMessage(row: DbRow): AppMessage {
  return {
    id: stringValue(row.id),
    campaignId: stringValue(row.campaign_id),
    companyId: stringValue(row.company_id),
    contactId: stringValue(row.contact_id),
    senderId: stringValue(row.sender_id),
    kind: stringValue(row.kind) as AppMessage["kind"],
    status: stringValue(row.status) as AppMessage["status"],
    subject: stringValue(row.subject),
    body: stringValue(row.body),
    futureNote: stringValue(row.future_note),
    createdAt: isoValue(row.created_at),
    sentAt: row.sent_at ? isoValue(row.sent_at) : null,
  };
}

function mapReply(row: DbRow): AppReply {
  return {
    id: stringValue(row.id),
    messageId: stringValue(row.message_id),
    companyId: stringValue(row.company_id),
    contactId: stringValue(row.contact_id),
    senderId: stringValue(row.sender_id),
    classification: stringValue(row.classification) as AppReply["classification"],
    receivedAt: isoValue(row.received_at),
    body: stringValue(row.body),
    draftResponse: stringValue(row.draft_response),
    approvalStatus: stringValue(row.approval_status) as AppReply["approvalStatus"],
    futureNote: stringValue(row.future_note),
  };
}

function mapSender(row: DbRow): AppSender {
  return {
    id: stringValue(row.id),
    campaignId: stringValue(row.campaign_id),
    email: stringValue(row.email),
    displayName: stringValue(row.display_name),
    organization: stringValue(row.organization),
    accountType: stringValue(row.account_type) as AppSender["accountType"],
    status: stringValue(row.status) as AppSender["status"],
    isDefault: booleanValue(row.is_default),
    priority: numberValue(row.priority),
    dailyLimit: numberValue(row.daily_limit),
    campaignDailyLimit: numberValue(row.campaign_daily_limit),
    sentToday: numberValue(row.sent_today),
    signature: stringValue(row.signature),
  };
}

function mapImportBatch(row: DbRow): AppImportBatch {
  return {
    id: stringValue(row.id),
    campaignId: nullableString(row.campaign_id),
    sourceName: stringValue(row.source_name),
    sourceType: stringValue(row.source_type) as AppImportBatch["sourceType"],
    status: stringValue(row.status) as AppImportBatch["status"],
    rowCount: numberValue(row.row_count),
    appliedCount: numberValue(row.applied_count),
    duplicateCount: numberValue(row.duplicate_count),
    errorCount: numberValue(row.error_count),
    createdAt: isoValue(row.created_at),
  };
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function nullableString(value: unknown) {
  const next = stringValue(value).trim();
  return next || null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map(String);
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return stringValue(value).slice(0, 10);
}

function isoValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = stringValue(value);
  return text || new Date(0).toISOString();
}
