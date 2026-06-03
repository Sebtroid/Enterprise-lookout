export type PastoralReservationInput = {
  campaignId: string;
  companyId: string | null;
  contactEmail: string;
  contactId?: string | null;
  contactName: string;
  messageId: string;
  senderEmail?: string | null;
  sheetId: string;
  sheetRange: string;
};

export type PastoralReservationRecord = {
  contactDomain: string | null;
  contactEmail: string;
  messageId: string;
  status: string;
};

export type PastoralReservationStore = {
  findConflict(input: PastoralReservationInput & { contactDomain: string | null }): Promise<PastoralReservationRecord | null>;
  findByMessage(messageId: string): Promise<PastoralReservationRecord | null>;
  upsert(input: PastoralReservationInput & { contactDomain: string | null }): Promise<void>;
};

export async function createPastoralLocalReservation(
  store: PastoralReservationStore,
  input: PastoralReservationInput,
) {
  const normalized = normalizeReservationInput(input);
  const conflict = await store.findConflict(normalized);
  if (conflict) {
    return {
      ok: false as const,
      conflict,
      reason:
        conflict.contactEmail === normalized.contactEmail
          ? "local_email_conflict"
          : "local_domain_conflict",
    };
  }

  await store.upsert(normalized);
  return { ok: true as const };
}

export function createPostgresPastoralReservationStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
): PastoralReservationStore & {
  markStatus(messageId: string, status: string, detail?: unknown): Promise<void>;
} {
  return {
    async findByMessage(messageId) {
      const rows = await sql`
        select
          message_id::text as message_id,
          contact_email::text as contact_email,
          contact_domain::text as contact_domain,
          status
        from pastoral_sheet_reservations
        where message_id = ${messageId}
        limit 1
      `;
      return rows[0]
        ? {
            contactDomain: rows[0].contact_domain ?? null,
            contactEmail: String(rows[0].contact_email),
            messageId: String(rows[0].message_id),
            status: String(rows[0].status),
          }
        : null;
    },
    async findConflict(input) {
      const rows = await sql`
        select
          message_id::text as message_id,
          contact_email::text as contact_email,
          contact_domain::text as contact_domain,
          status
        from pastoral_sheet_reservations
        where sheet_id = ${input.sheetId}
          and message_id <> ${input.messageId}
          and status in ('reserved', 'appended', 'verified', 'sent')
          and (
            lower(contact_email::text) = ${input.contactEmail}
            or (${input.contactDomain}::text is not null and contact_domain = ${input.contactDomain})
          )
        order by created_at asc
        limit 1
      `;
      return rows[0]
        ? {
            contactDomain: rows[0].contact_domain ?? null,
            contactEmail: String(rows[0].contact_email),
            messageId: String(rows[0].message_id),
            status: String(rows[0].status),
          }
        : null;
    },
    async markStatus(messageId, status, detail) {
      if (detail == null) {
        await sql`
          update pastoral_sheet_reservations
          set
            status = ${status},
            sent_at = case
              when ${status} = 'sent' then coalesce(sent_at, now())
              else sent_at
            end,
            updated_at = now()
          where message_id = ${messageId}
        `;
        return;
      }

      await sql`
        update pastoral_sheet_reservations
        set
          status = ${status},
          detail = ${sql.json(detail)},
          sent_at = case
            when ${status} = 'sent' then coalesce(sent_at, now())
            else sent_at
          end,
          updated_at = now()
        where message_id = ${messageId}
      `;
    },
    async upsert(input) {
      await sql`
        insert into pastoral_sheet_reservations (
          message_id,
          campaign_id,
          company_id,
          contact_id,
          sender_email,
          sheet_id,
          sheet_range,
          contact_name,
          contact_email,
          contact_domain,
          status
        ) values (
          ${input.messageId},
          ${input.campaignId},
          ${input.companyId},
          ${input.contactId ?? null},
          ${input.senderEmail ?? null},
          ${input.sheetId},
          ${input.sheetRange},
          ${input.contactName},
          ${input.contactEmail},
          ${input.contactDomain},
          'reserved'
        )
        on conflict (message_id) do update
        set
          contact_name = excluded.contact_name,
          contact_email = excluded.contact_email,
          contact_domain = excluded.contact_domain,
          sheet_range = excluded.sheet_range,
          status = 'reserved',
          updated_at = now()
      `;
    },
  };
}

export function getPastoralReservationDomain(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? "";
  const domain = value.includes("@") ? value.split("@").at(-1) ?? "" : "";
  if (!domain || COMMON_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function normalizeReservationInput(input: PastoralReservationInput) {
  return {
    ...input,
    contactDomain: getPastoralReservationDomain(input.contactEmail),
    contactEmail: input.contactEmail.trim().toLowerCase(),
    contactName: input.contactName.trim() || input.contactEmail.trim().toLowerCase(),
  };
}

const COMMON_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.cl",
  "hotmail.com",
  "icloud.com",
  "live.cl",
  "live.com",
  "me.com",
  "outlook.cl",
  "outlook.com",
  "uc.cl",
  "yahoo.com",
  "yahoo.es",
]);
