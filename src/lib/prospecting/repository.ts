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
import {
  getPostgresClient,
  withPostgresQueryTimeout,
} from "@/lib/supabase/postgres";

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
    const rows = await withPostgresQueryTimeout(sql`
      select
        slug,
        name,
        organization,
        description,
        status::text as status,
        value_proposition,
        starts_on,
        ends_on
      from campaigns
      order by created_at asc
    `.execute(), "campaigns");

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

  const sql = getPostgresClient();
  if (sql) {
    try {
      if (isContextScope(scope)) {
        const rows = await withPostgresQueryTimeout(sql`
          select organization
          from campaigns
        `.execute(), "campaign scope context");

        return rows.some(
          (row) => getContextScopeId(String(row.organization ?? "")) === scope,
        );
      }

      const rows = await withPostgresQueryTimeout(sql`
        select 1
        from campaigns
        where slug = ${scope}
        limit 1
      `.execute(), "campaign scope");

      return rows.length > 0;
    } catch (error) {
      console.error("Could not validate campaign scope", error);
      return true;
    }
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
  // Keep batches within the Postgres pool size so streamed routes do not wait on queued queries forever.
  const [companies, contacts, messages] = await Promise.all([
    getCompaniesData(scope, scopeLookup.contextOrganizations),
    getContactsData(scope, scopeLookup.contextOrganizations),
    getMessagesData(scope, scopeLookup.contextOrganizations),
  ]);
  const [replies, senders, importBatches] = await Promise.all([
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

export async function getOutboundReviewSnapshot(
  scope: string,
): Promise<ProspectingSnapshot> {
  const campaigns = await getCampaignsData();
  const scopeLookup = getScopeLookup(scope, campaigns);
  const sql = getPostgresClient();

  if (!sql) {
    const messages = filterDemoReviewMessages(scope);
    return buildProspectingSnapshot({
      campaigns,
      scopeLookup,
      companies: filterDemoCompaniesForMessages(scope, messages),
      contacts: filterDemoContactsForMessages(messages),
      messages,
      senders: filterDemoSendersForMessages(scope, messages),
    });
  }

  try {
    const scopeFilter = isAllCampaignsScope(scope)
      ? sql``
      : isContextScope(scope)
        ? scopeLookup.contextOrganizations.length
          ? sql`and c.organization = any(${scopeLookup.contextOrganizations}::text[])`
          : sql`and false`
        : sql`and c.slug = ${scope}`;

    const rows = await withPostgresQueryTimeout(sql`
      select
        m.id::text as message_id,
        c.slug as message_campaign_id,
        m.company_id::text as message_company_id,
        m.contact_id::text as message_contact_id,
        m.sender_account_id::text as message_sender_id,
        m.kind::text as message_kind,
        m.status::text as message_status,
        coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as message_subject,
        coalesce(m.body_final, m.body_draft, '') as message_body,
        coalesce(m.future_note, '') as message_future_note,
        m.created_at as message_created_at,
        m.sent_at as message_sent_at,
        co.id::text as company_row_id,
        co.canonical_name as company_name,
        co.domain as company_domain,
        co.website as company_website,
        co.industry as company_industry,
        co.region as company_region,
        coalesce(co.description, co.global_notes, '') as company_description,
        co.global_notes as company_notes,
        co.quality_rating as company_quality_rating,
        co.quality_notes as company_quality_notes,
        co.do_not_contact as company_do_not_contact,
        coalesce(cc.fit_score, 0)::int as company_fit_score,
        coalesce(cc.status::text, 'new') as company_status,
        array[c.slug] as company_campaign_ids,
        '{}'::text[] as company_evidence_urls,
        coalesce(cc.selected_contact_reason, '') as company_selected_contact_reason,
        coalesce(cc.campaign_notes, '') as company_campaign_notes,
        coalesce(cc.future_notes, '') as company_future_notes,
        cc.last_contacted_at as company_last_contacted_at,
        ct.id::text as contact_row_id,
        ct.company_id::text as contact_company_id,
        ct.full_name as contact_full_name,
        ct.role as contact_role,
        ct.email::text as contact_email,
        ct.phone as contact_phone,
        ct.category as contact_category,
        ct.confidence as contact_confidence,
        ct.verification_status::text as contact_verification_status,
        ct.verified_at as contact_verified_at,
        ct.bounce_count as contact_bounce_count,
        ct.source as contact_source,
        ct.is_decision_maker as contact_is_decision_maker,
        ct.do_not_contact as contact_do_not_contact,
        ct.global_notes as contact_global_notes,
        sa.id::text as sender_row_id,
        sa.email::text as sender_email,
        sa.display_name as sender_display_name,
        sa.organization as sender_organization,
        sa.account_type as sender_account_type,
        sa.status::text as sender_status,
        coalesce(csa.is_default, false) as sender_is_default,
        coalesce(csa.priority, 0) as sender_priority,
        coalesce(sa.daily_limit, 0) as sender_daily_limit,
        coalesce(csa.campaign_daily_limit, 0) as sender_campaign_daily_limit,
        0 as sender_sent_today,
        coalesce(sa.signature, '') as sender_signature
      from messages m
      join campaigns c on c.id = m.campaign_id
      left join companies co on co.id = m.company_id
      left join campaign_contacts cc
        on cc.campaign_id = m.campaign_id
        and cc.company_id = m.company_id
      left join contacts ct on ct.id = m.contact_id
      left join sender_accounts sa on sa.id = m.sender_account_id
      left join campaign_sender_accounts csa
        on csa.campaign_id = m.campaign_id
        and csa.sender_account_id = m.sender_account_id
      where m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
        and m.status in ('needs_review', 'approved', 'rejected')
        ${scopeFilter}
      order by coalesce(m.sent_at, m.updated_at, m.created_at) desc
    `.execute(), "outbound review snapshot");

    return buildProspectingSnapshot({
      campaigns,
      scopeLookup,
      companies: uniqueMappedRows(rows, "company_row_id", mapReviewCompany),
      contacts: uniqueMappedRows(rows, "contact_row_id", mapReviewContact),
      messages: uniqueMappedRows(rows, "message_id", mapReviewMessage),
      senders: uniqueMappedRows(rows, "sender_row_id", mapReviewSender),
    });
  } catch (error) {
    console.error("Falling back to demo outbound review snapshot", error);
    const messages = filterDemoReviewMessages(scope);
    return buildProspectingSnapshot({
      campaigns,
      scopeLookup,
      companies: filterDemoCompaniesForMessages(scope, messages),
      contacts: filterDemoContactsForMessages(messages),
      messages,
      senders: filterDemoSendersForMessages(scope, messages),
    });
  }
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

    const rows = await withPostgresQueryTimeout(sql`
      select
        co.id::text as id,
        co.canonical_name as name,
        co.domain,
        co.website,
        co.industry,
        co.region,
        coalesce(co.description, co.global_notes, '') as description,
        co.global_notes as notes,
        co.quality_rating,
        co.quality_notes,
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
    `.execute(), "companies");

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
      ? await withPostgresQueryTimeout(sql`
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
        `.execute(), "contacts")
      : isContextScope(scope)
        ? await withPostgresQueryTimeout(sql`
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
        `.execute(), "contacts")
      : await withPostgresQueryTimeout(sql`
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
        `.execute(), "contacts");

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

    const rows = await withPostgresQueryTimeout(sql`
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
    `.execute(), "messages");

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

    const rows = await withPostgresQueryTimeout(sql`
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
        and (
          m.status <> 'needs_review'
          or not exists (
            select 1
            from messages newer
            where newer.kind = 'inbound_reply'
              and newer.campaign_id = m.campaign_id
              and newer.id <> m.id
              and (
                (m.gmail_thread_id is not null and newer.gmail_thread_id = m.gmail_thread_id)
                or (m.thread_id is not null and newer.thread_id = m.thread_id)
              )
              and coalesce(newer.received_at, newer.created_at) > coalesce(m.received_at, m.created_at)
          )
        )
        and (
          m.status <> 'needs_review'
          or not exists (
            select 1
            from messages outbound
            where outbound.kind = 'outbound_reply'
              and outbound.status in ('approved', 'sent')
              and outbound.campaign_id = m.campaign_id
              and (
                (m.gmail_thread_id is not null and outbound.gmail_thread_id = m.gmail_thread_id)
                or (m.thread_id is not null and outbound.thread_id = m.thread_id)
              )
              and coalesce(outbound.sent_at, outbound.approved_at, outbound.created_at) > coalesce(m.received_at, m.created_at)
          )
        )
      ${scopeFilter}
      order by coalesce(m.received_at, m.created_at) desc
    `.execute(), "replies");

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

    const rows = await withPostgresQueryTimeout(sql`
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
    `.execute(), "senders");

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
      ? await withPostgresQueryTimeout(sql`
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
        `.execute(), "import batches")
      : isContextScope(scope)
        ? await withPostgresQueryTimeout(sql`
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
        `.execute(), "import batches")
      : await withPostgresQueryTimeout(sql`
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
        `.execute(), "import batches");

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

function filterDemoReviewMessages(scope: string) {
  return filterDemoMessages(scope).filter((message) =>
    ["needs_review", "approved", "rejected"].includes(message.status),
  );
}

function filterDemoCompaniesForMessages(scope: string, messages: AppMessage[]) {
  const companyIds = new Set(messages.map((message) => message.companyId));
  return filterDemoCompanies(scope).filter((company) => companyIds.has(company.id));
}

function filterDemoContactsForMessages(messages: AppMessage[]) {
  const contactIds = new Set(messages.map((message) => message.contactId));
  return demoContacts.filter((contact) => contactIds.has(contact.id));
}

function filterDemoSendersForMessages(scope: string, messages: AppMessage[]) {
  const senderIds = new Set(messages.map((message) => message.senderId));
  return filterDemoSenders(scope).filter((sender) => senderIds.has(sender.id));
}

function buildProspectingSnapshot({
  campaigns,
  companies,
  contacts,
  messages,
  scopeLookup,
  senders,
}: {
  campaigns: AppCampaign[];
  companies: AppCompany[];
  contacts: AppContact[];
  messages: AppMessage[];
  scopeLookup: ScopeLookup;
  senders: AppSender[];
}): ProspectingSnapshot {
  return {
    campaigns,
    campaign: scopeLookup.campaign,
    context: scopeLookup.context,
    companies,
    contacts,
    messages,
    replies: [],
    senders,
    importBatches: [],
    stats: getStats(companies, messages, []),
  };
}

function uniqueMappedRows<T>(
  rows: DbRow[],
  idKey: string,
  mapper: (row: DbRow) => T,
) {
  const seen = new Set<string>();
  const items: T[] = [];

  for (const row of rows) {
    const id = stringValue(row[idKey]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(mapper(row));
  }

  return items;
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
    endsOn: row.ends_on ? dateValue(row.ends_on) : null,
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
    qualityRating: numberValue(row.quality_rating) || 3,
    qualityNotes: stringValue(row.quality_notes),
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

function mapReviewCompany(row: DbRow): AppCompany {
  return mapCompany({
    id: row.company_row_id,
    campaign_ids: row.company_campaign_ids,
    name: row.company_name,
    domain: row.company_domain,
    website: row.company_website,
    industry: row.company_industry,
    region: row.company_region,
    description: row.company_description,
    quality_rating: row.company_quality_rating,
    quality_notes: row.company_quality_notes,
    fit_score: row.company_fit_score,
    status: row.company_status,
    notes: row.company_notes,
    campaign_notes: row.company_campaign_notes,
    future_notes: row.company_future_notes,
    selected_contact_reason: row.company_selected_contact_reason,
    last_contacted_at: row.company_last_contacted_at,
    do_not_contact: row.company_do_not_contact,
    evidence_urls: row.company_evidence_urls,
  });
}

function mapReviewContact(row: DbRow): AppContact {
  return mapContact({
    id: row.contact_row_id,
    company_id: row.contact_company_id,
    full_name: row.contact_full_name,
    role: row.contact_role,
    email: row.contact_email,
    phone: row.contact_phone,
    category: row.contact_category,
    confidence: row.contact_confidence,
    verification_status: row.contact_verification_status,
    verified_at: row.contact_verified_at,
    bounce_count: row.contact_bounce_count,
    source: row.contact_source,
    is_decision_maker: row.contact_is_decision_maker,
    do_not_contact: row.contact_do_not_contact,
    global_notes: row.contact_global_notes,
  });
}

function mapReviewMessage(row: DbRow): AppMessage {
  return mapMessage({
    id: row.message_id,
    campaign_id: row.message_campaign_id,
    company_id: row.message_company_id,
    contact_id: row.message_contact_id,
    sender_id: row.message_sender_id,
    kind: row.message_kind,
    status: row.message_status,
    subject: row.message_subject,
    body: row.message_body,
    future_note: row.message_future_note,
    created_at: row.message_created_at,
    sent_at: row.message_sent_at,
  });
}

function mapReviewSender(row: DbRow): AppSender {
  return mapSender({
    id: row.sender_row_id,
    campaign_id: row.message_campaign_id,
    email: row.sender_email,
    display_name: row.sender_display_name,
    organization: row.sender_organization,
    account_type: row.sender_account_type,
    status: row.sender_status,
    is_default: row.sender_is_default,
    priority: row.sender_priority,
    daily_limit: row.sender_daily_limit,
    campaign_daily_limit: row.sender_campaign_daily_limit,
    sent_today: row.sender_sent_today,
    signature: row.sender_signature,
  });
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
