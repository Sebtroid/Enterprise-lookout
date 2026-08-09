import { createHash } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const ownerUserId = process.env.V2_OWNER_USER_ID;
const apply = process.argv.includes("--apply");
if (!databaseUrl) throw new Error("Falta SUPABASE_DB_URL o DATABASE_URL.");
if (!ownerUserId) throw new Error("Falta V2_OWNER_USER_ID.");
if (apply && process.env.CONFIRM_V2_MIGRATION !== "APPLY") throw new Error("Para mutar la base define CONFIRM_V2_MIGRATION=APPLY.");

const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
try {
  const [member] = await sql`select wm.workspace_id from public.workspace_members wm where wm.user_id = ${ownerUserId}::uuid and wm.status = 'active' limit 1`;
  if (!member) throw new Error("V2_OWNER_USER_ID no es miembro activo del workspace.");
  const workspaceId = member.workspace_id;
  const [counts] = await sql`
    select
      (select count(*)::int from public.campaigns) as campaigns,
      (select count(*)::int from public.companies where nullif(domain, '') is not null or nullif(website, '') is not null or exists (select 1 from public.threads t where t.company_id = companies.id and nullif(t.gmail_thread_id, '') is not null)) as qualified_companies,
      (select count(*)::int from public.contacts where (nullif(email::text, '') is not null and verification_status::text <> 'unverified') or exists (select 1 from public.messages m where m.contact_id = contacts.id and (m.received_at is not null or m.sent_at is not null or nullif(m.gmail_message_id, '') is not null))) as qualified_contacts,
      (select count(*)::int from public.companies where nullif(domain, '') is null and nullif(website, '') is null and not exists (select 1 from public.threads t where t.company_id = companies.id and nullif(t.gmail_thread_id, '') is not null)) as quarantined_companies,
      (select count(*)::int from public.contacts where not ((nullif(email::text, '') is not null and verification_status::text <> 'unverified') or exists (select 1 from public.messages m where m.contact_id = contacts.id and (m.received_at is not null or m.sent_at is not null or nullif(m.gmail_message_id, '') is not null)))) as quarantined_contacts
  `;
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", workspaceId, ownerUserId, counts }, null, 2));
  if (!apply) {
    console.log("Simulación terminada. Repite con --apply y CONFIRM_V2_MIGRATION=APPLY para ejecutar.");
    process.exitCode = 0;
  } else {
    await sql.begin(async (tx) => {
      const [run] = await tx`insert into public.migration_runs (workspace_id, executed_by, status) values (${workspaceId}, ${ownerUserId}, 'started') returning id`;
      await tx`
        insert into public.institutions (workspace_id, name, created_by)
        select ${workspaceId}, c.organization, ${ownerUserId} from public.campaigns c
        where nullif(trim(c.organization), '') is not null
        on conflict (workspace_id, name) do nothing
      `;
      await tx`
        insert into public.projects (workspace_id, owner_user_id, institution_id, legacy_campaign_id, name, slug, description, value_proposition, access_mode, status, starts_on, ends_on)
        select ${workspaceId}, ${ownerUserId}, i.id, c.id, c.name, c.slug, c.description, c.value_proposition, 'personal',
          case when c.status::text = 'active' then 'active' when c.status::text = 'paused' then 'paused' else 'draft' end,
          c.starts_on, c.ends_on
        from public.campaigns c left join public.institutions i on i.workspace_id = ${workspaceId} and i.name = c.organization
        on conflict (legacy_campaign_id) do update set name = excluded.name, institution_id = excluded.institution_id, updated_at = now()
      `;
      await tx`
        update public.companies c set record_state = case when nullif(c.domain, '') is not null or nullif(c.website, '') is not null or exists (select 1 from public.threads t where t.company_id = c.id and nullif(t.gmail_thread_id, '') is not null) then 'active' else 'quarantined' end
        where c.workspace_id = ${workspaceId}
      `;
      await tx`
        update public.contacts c set record_state = case when (nullif(c.email::text, '') is not null and c.verification_status::text <> 'unverified') or exists (select 1 from public.messages m where m.contact_id = c.id and (m.received_at is not null or m.sent_at is not null or nullif(m.gmail_message_id, '') is not null)) then 'active' else 'quarantined' end
        where c.workspace_id = ${workspaceId}
      `;
      await tx`
        insert into public.project_companies (workspace_id, project_id, company_id, primary_contact_id, stage, fit_score, priority, next_action, next_action_at, notes)
        select ${workspaceId}, p.id, cc.company_id,
          case when ct.record_state = 'active' then cc.contact_id else null end,
          cc.status::text, cc.fit_score, cc.priority_score, coalesce(cc.future_notes, cc.selected_contact_reason), cc.next_followup_at, cc.campaign_notes
        from public.campaign_contacts cc
        join public.projects p on p.legacy_campaign_id = cc.campaign_id
        join public.companies c on c.id = cc.company_id and c.record_state = 'active'
        left join public.contacts ct on ct.id = cc.contact_id
        on conflict (project_id, company_id) do update set primary_contact_id = excluded.primary_contact_id, fit_score = excluded.fit_score, next_action = excluded.next_action, updated_at = now()
      `;
      await tx`
        insert into public.legacy_quarantine (workspace_id, source_table, source_id, reason, payload)
        select ${workspaceId}, 'companies', c.id, 'empresa_sin_evidencia', to_jsonb(c) from public.companies c where c.workspace_id = ${workspaceId} and c.record_state = 'quarantined'
        on conflict do nothing
      `;
      await tx`
        insert into public.legacy_quarantine (workspace_id, source_table, source_id, reason, payload)
        select ${workspaceId}, 'contacts', c.id, 'contacto_sin_evidencia', to_jsonb(c) from public.contacts c where c.workspace_id = ${workspaceId} and c.record_state = 'quarantined'
        on conflict do nothing
      `;
      const checksum = createHash("sha256").update(JSON.stringify(counts)).digest("hex");
      await tx`update public.migration_runs set status = 'completed', counts = ${tx.json(counts)}, checksum = ${checksum}, completed_at = now() where id = ${run.id}`;
    });
    console.log("Migración V1 -> V2 completada. Revisa /settings/migration antes del corte.");
  }
} finally {
  await sql.end();
}
