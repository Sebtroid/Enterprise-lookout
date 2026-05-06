"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ALL_CAMPAIGNS_SCOPE,
  isAllCampaignsScope,
} from "@/lib/prospecting/repository";
import {
  getCampaignCompanyDecisionPatch,
  type CompanyCampaignDecision,
} from "@/lib/prospecting/company-intelligence";
import {
  buildRedraftSubject,
  buildRedraftedBody,
  outboundRejectionReasons,
} from "@/lib/prospecting/review";
import {
  extractDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
} from "@/lib/prospecting/normalize";
import {
  getKimiDeepResearchInstructions,
  kimiDeepResearchJobName,
} from "@/lib/prospecting/kimi-research";
import { notifyDomEventForCampaignSlug } from "@/lib/dom/client";
import {
  ensureDomChatThread,
  getDomCampaignContextBySlug,
} from "@/lib/dom/repository";
import { getPostgresClient } from "@/lib/supabase/postgres";

export type ActionState = {
  ok: boolean;
  message: string;
};

const initialError =
  "Falta configurar SUPABASE_DB_URL en el entorno del servidor.";

const messageIntentSchema = z.enum(["save", "approved", "rejected"]);
const replyIntentSchema = z.enum(["save", "approved", "rejected"]);
const outboundRejectionReasonSchema = z.enum([
  "company_not_fit",
  "bad_copy",
]);
const companyDecisionSchema = z.enum(["fit", "maybe", "not_fit"]);
const senderStatusSchema = z.enum(["active", "paused", "disabled"]);
const senderAccountTypeSchema = z.enum(["gmail", "outlook", "smtp", "manual"]);
const projectStatusSchema = z.enum(["draft", "active", "paused"]);
const researchSourceSchema = z.enum([
  "new_companies",
  "existing_and_new",
  "existing_only",
]);

const importRowSchema = z.object({
  companyName: z.string(),
  contactName: z.string(),
  role: z.string(),
  email: z.string(),
  isDecisionMaker: z.boolean(),
  source: z.string(),
});

export async function updateOutboundMessageAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const messageId = readFormString(formData, "messageId");
  const body = readFormString(formData, "body");
  const intent = messageIntentSchema.safeParse(readFormString(formData, "intent"));

  if (!messageId || !intent.success) {
    return { ok: false, message: "Faltan datos para actualizar el mail." };
  }

  const rows = await sql`
    select
      m.id,
      c.slug as campaign_slug,
      m.company_id::text as company_id,
      m.contact_id::text as contact_id,
      m.status::text as status,
      coalesce(m.subject_final, m.subject_draft) as subject,
      co.canonical_name as company_name,
      ct.email::text as contact_email,
      co.do_not_contact as company_do_not_contact,
      ct.do_not_contact as contact_do_not_contact
    from messages m
    join campaigns c on c.id = m.campaign_id
    left join companies co on co.id = m.company_id
    left join contacts ct on ct.id = m.contact_id
    where m.id = ${messageId}
      and m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
    limit 1
  `;

  const message = rows[0];
  if (!message) {
    return { ok: false, message: "No encontré ese mail en la base." };
  }

  if (message.status === "sent") {
    return { ok: false, message: "Ese mail ya fue enviado; no se modifica." };
  }

  if (
    intent.data === "approved" &&
    (message.company_do_not_contact || message.contact_do_not_contact)
  ) {
    return {
      ok: false,
      message: "Bloqueado por do_not_contact. No se puede aprobar.",
    };
  }

  const nextStatus =
    intent.data === "save" ? message.status : intent.data;

  await sql.begin(async (tx) => {
    await tx`
      update messages
      set
        status = ${nextStatus}::message_status,
        body_draft = ${body},
        body_final = case
          when ${nextStatus}::message_status = 'approved' then ${body}
          when status = 'approved' then ${body}
          else body_final
        end,
        subject_final = case
          when ${nextStatus}::message_status = 'approved' then coalesce(subject_final, subject_draft)
          else subject_final
        end,
        approved_at = case
          when ${nextStatus}::message_status = 'approved' then now()
          when ${nextStatus}::message_status = 'rejected' then null
          else approved_at
        end,
        updated_at = now()
      where id = ${messageId}
    `;

    if (nextStatus === "approved") {
      await tx`
        update campaign_contacts cc
        set status = 'approved_to_send', updated_at = now()
        from messages m
        where m.id = ${messageId}
          and cc.campaign_id = m.campaign_id
          and cc.company_id = m.company_id
          and (cc.contact_id = m.contact_id or cc.contact_id is null)
      `;
    }
  });

  revalidateProspectingPaths();
  if (nextStatus === "approved") {
    await notifyDomEventForCampaignSlug({
      event: "mail_approved",
      scope: String(message.campaign_slug),
      data: {
        message_id: String(message.id),
        company_id: String(message.company_id ?? ""),
        company_name: String(message.company_name ?? ""),
        contact_id: String(message.contact_id ?? ""),
        contact_email: String(message.contact_email ?? ""),
        subject: String(message.subject ?? ""),
      },
    });
  }

  return {
    ok: true,
    message:
      intent.data === "save"
        ? "Cambios guardados."
        : intent.data === "approved"
          ? "Mail aprobado y guardado."
          : "Mail rechazado.",
  };
}

export async function sendApprovedMessagesAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope") || ALL_CAMPAIGNS_SCOPE;
  const scopeFilter = isAllCampaignsScope(scope)
    ? sql``
    : sql`and c.slug = ${scope}`;

  const rows = await sql`
    select count(*)::int as approved_count
    from messages m
    join campaigns c on c.id = m.campaign_id
    join sender_accounts sa on sa.id = m.sender_account_id
    left join companies co on co.id = m.company_id
    left join contacts ct on ct.id = m.contact_id
    where m.status = 'approved'
      and m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
      and sa.status = 'active'
      and coalesce(co.do_not_contact, false) = false
      and coalesce(ct.do_not_contact, false) = false
      ${scopeFilter}
  `;
  const approvedCount = Number(rows[0]?.approved_count ?? 0);

  await sql`
    insert into automation_runs (
      campaign_id,
      job_name,
      status,
      finished_at,
      input_summary,
      output_summary
    )
    select
      case when ${isAllCampaignsScope(scope)} then null else c.id end,
      'send-approved',
      'skipped',
      now(),
      ${sql.json({ scope })},
      ${sql.json({
        approvedCount,
        reason: "provider_delivery_not_connected",
      })}
    from campaigns c
    where ${isAllCampaignsScope(scope)} or c.slug = ${scope}
    limit 1
  `;

  revalidateProspectingPaths();

  if (approvedCount === 0) {
    return {
      ok: true,
      message: "No hay mails aprobados y elegibles para enviar.",
    };
  }

  return {
    ok: true,
    message: `${approvedCount} mails listos. Para Outlook UC usa “Abrir en Outlook” y luego “Marcar enviado”.`,
  };
}

export async function markMessageSentManuallyAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const messageId = readFormString(formData, "messageId");

  if (!messageId) {
    return { ok: false, message: "Falta el ID del mensaje." };
  }

  const rows = await sql.begin(async (tx) => {
    const updated = await tx`
      update messages
      set
        status = 'sent',
        sent_at = now(),
        future_note = coalesce(future_note, 'Marcado enviado manualmente desde dashboard.'),
        updated_at = now()
      where id = ${messageId}
        and status = 'approved'
      returning campaign_id, company_id, contact_id
    `;

    if (!updated[0]) return [];

    await tx`
      update campaign_contacts cc
      set
        status = 'sent',
        last_contacted_at = now(),
        updated_at = now()
      where cc.campaign_id = ${updated[0].campaign_id}
        and cc.company_id = ${updated[0].company_id}
        and (cc.contact_id = ${updated[0].contact_id} or cc.contact_id is null)
    `;

    return updated;
  });

  revalidateProspectingPaths();

  return rows[0]
    ? { ok: true, message: "Mensaje marcado como enviado." }
    : {
        ok: false,
        message:
          "No se pudo marcar enviado. Solo se puede marcar si está aprobado.",
      };
}

export async function rejectOutboundMessageAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const messageId = readFormString(formData, "messageId");
  const reason = outboundRejectionReasonSchema.safeParse(
    readFormString(formData, "rejectionReason"),
  );
  const comment = readFormString(formData, "rejectionComment");
  const rememberForFuture = formData.get("rememberFeedback") === "on";

  if (!messageId || !reason.success) {
    return { ok: false, message: "Faltan datos para rechazar el mail." };
  }

  if (reason.data === "bad_copy" && comment.length < 4) {
    return {
      ok: false,
      message: "Agrega un comentario para poder redactar de nuevo.",
    };
  }

  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select
        m.id,
        m.campaign_id,
        c.slug as campaign_slug,
        m.company_id,
        m.contact_id,
        m.sender_account_id,
        m.kind::text as kind,
        coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
        coalesce(m.body_final, m.body_draft, '') as body,
        m.status::text as status
      from messages m
      join campaigns c on c.id = m.campaign_id
      where m.id = ${messageId}
        and m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
      limit 1
    `;
    const message = rows[0];

    if (!message) return { kind: "missing" as const };
    if (message.status === "sent") return { kind: "sent" as const };

    await tx`
      insert into outbound_feedback (
        message_id,
        campaign_id,
        company_id,
        contact_id,
        reason,
        comment,
        remember_for_future
      ) values (
        ${message.id},
        ${message.campaign_id},
        ${message.company_id},
        ${message.contact_id},
        ${reason.data},
        ${comment || null},
        ${rememberForFuture}
      )
    `;

    await tx`
      update messages
      set
        status = 'rejected',
        approved_at = null,
        future_note = ${[
          `Rechazado: ${outboundRejectionReasons[reason.data]}.`,
          comment ? `Feedback: ${comment}` : null,
          rememberForFuture ? "Recordar este feedback para futuras redacciones." : null,
        ]
          .filter(Boolean)
          .join(" ")},
        updated_at = now()
      where id = ${message.id}
    `;

    if (reason.data === "company_not_fit") {
      await tx`
        update campaign_contacts
        set
          status = 'closed_negative',
          future_notes = concat_ws(
            E'\n',
            future_notes,
            ${comment || "Empresa descartada por fit desde revisión de mail."}
          ),
          updated_at = now()
        where campaign_id = ${message.campaign_id}
          and company_id = ${message.company_id}
          and (contact_id = ${message.contact_id} or contact_id is null)
      `;

      return { kind: "closed" as const, campaign_slug: message.campaign_slug };
    }

    const rememberedRows = await tx`
      select comment
      from outbound_feedback
      where campaign_id = ${message.campaign_id}
        and remember_for_future = true
        and reason = 'bad_copy'
        and nullif(trim(comment), '') is not null
      order by created_at desc
      limit 5
    `;
    const redraftedBody = buildRedraftedBody({
      originalBody: String(message.body ?? ""),
      reason: reason.data,
      feedback: comment,
      rememberedFeedback: rememberedRows.map((row) => String(row.comment)),
    });
    const newMessage = await tx`
      insert into messages (
        campaign_id,
        company_id,
        contact_id,
        sender_account_id,
        kind,
        status,
        subject_draft,
        body_draft,
        future_note
      ) values (
        ${message.campaign_id},
        ${message.company_id},
        ${message.contact_id},
        ${message.sender_account_id},
        ${message.kind}::message_kind,
        'needs_review',
        ${buildRedraftSubject(String(message.subject))},
        ${redraftedBody},
        ${`Nuevo borrador generado desde rechazo del mensaje ${message.id}.`}
      )
      returning id
    `;

    await tx`
      update campaign_contacts
      set status = 'draft_ready', updated_at = now()
      where campaign_id = ${message.campaign_id}
        and company_id = ${message.company_id}
        and (contact_id = ${message.contact_id} or contact_id is null)
    `;

    return {
      kind: "redrafted" as const,
      campaign_slug: message.campaign_slug,
      messageId: newMessage[0]?.id,
    };
  });

  if ("campaign_slug" in result && result.campaign_slug) {
    revalidateProspectingPaths(String(result.campaign_slug));
  } else {
    revalidateProspectingPaths();
  }

  if (result.kind === "missing") {
    return { ok: false, message: "No encontré ese mail en la base." };
  }

  if (result.kind === "sent") {
    return { ok: false, message: "Ese mail ya fue enviado; no se rechaza." };
  }

  if (result.kind === "closed") {
    return {
      ok: true,
      message: "Mail rechazado y empresa/contacto cerrado por falta de fit.",
    };
  }

  if (result.kind === "redrafted" && result.campaign_slug) {
    await notifyDomEventForCampaignSlug({
      event: "mail_created",
      scope: String(result.campaign_slug),
      data: {
        message_id: String(result.messageId ?? ""),
        source: "outbound_rejection_redraft",
        reason: reason.data,
        feedback: comment,
        remember_for_future: rememberForFuture,
      },
    });
  }

  return {
    ok: true,
    message: "Mail rechazado. Generé un nuevo borrador con el feedback.",
  };
}

export async function classifyCompanyForCampaignAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope");
  const companyId = readFormString(formData, "companyId");
  const decision = companyDecisionSchema.safeParse(
    readFormString(formData, "decision"),
  );

  if (!scope || isAllCampaignsScope(scope)) {
    return {
      ok: false,
      message: "Elige un proyecto concreto para clasificar la empresa.",
    };
  }

  if (!companyId || !decision.success) {
    return { ok: false, message: "Faltan datos para clasificar la empresa." };
  }

  const patch = getCampaignCompanyDecisionPatch(
    decision.data as CompanyCampaignDecision,
  );

  const result = await sql.begin(async (tx) => {
    const campaignRows = await tx`
      select id, slug
      from campaigns
      where slug = ${scope}
      limit 1
    `;
    const campaign = campaignRows[0];
    if (!campaign) return { kind: "missing_campaign" as const };

    const companyRows = await tx`
      select id, canonical_name, do_not_contact
      from companies
      where id = ${companyId}
      limit 1
    `;
    const company = companyRows[0];
    if (!company) return { kind: "missing_company" as const };

    if (company.do_not_contact && decision.data !== "not_fit") {
      return { kind: "blocked_do_not_contact" as const };
    }

    const contactRows = await tx`
      select id
      from contacts
      where company_id = ${companyId}
      order by is_decision_maker desc, confidence desc nulls last, created_at asc
      limit 1
    `;
    const contactId = contactRows[0]?.id ?? null;

    const updatedRows = await tx`
      update campaign_contacts
      set
        fit_score = ${patch.fitScore},
        priority_score = ${patch.priorityScore},
        status = ${patch.status}::campaign_contact_status,
        selected_contact_reason = ${patch.selectedContactReason},
        campaign_notes = ${patch.campaignNotes},
        contact_id = coalesce(contact_id, ${contactId}),
        updated_at = now()
      where campaign_id = ${campaign.id}
        and company_id = ${companyId}
      returning id
    `;

    if (updatedRows.length === 0) {
      await tx`
        insert into campaign_contacts (
          campaign_id,
          company_id,
          contact_id,
          fit_score,
          priority_score,
          status,
          selected_contact_reason,
          campaign_notes
        ) values (
          ${campaign.id},
          ${companyId},
          ${contactId},
          ${patch.fitScore},
          ${patch.priorityScore},
          ${patch.status}::campaign_contact_status,
          ${patch.selectedContactReason},
          ${patch.campaignNotes}
        )
      `;
    }

    return {
      kind: "updated" as const,
      campaignSlug: String(campaign.slug),
      companyName: String(company.canonical_name),
      decision: decision.data,
    };
  });

  if (result.kind === "missing_campaign") {
    return { ok: false, message: "No encontré ese proyecto." };
  }

  if (result.kind === "missing_company") {
    return { ok: false, message: "No encontré esa empresa." };
  }

  if (result.kind === "blocked_do_not_contact") {
    return {
      ok: false,
      message: "Empresa bloqueada por do_not_contact. No se puede activar.",
    };
  }

  revalidateProspectingPaths(result.campaignSlug);
  if (result.decision === "fit" || result.decision === "maybe") {
    await notifyDomEventForCampaignSlug({
      event: "company_classified",
      scope: result.campaignSlug,
      data: {
        company_id: companyId,
        company_name: result.companyName,
        classification: result.decision === "fit" ? "sirve" : "investigar",
        reason:
          result.decision === "fit"
            ? "Usuario marcó esta empresa como fit para el proyecto."
            : "Usuario pidió investigar esta empresa para el proyecto.",
      },
    });
  }

  return {
    ok: true,
    message: `${result.companyName} actualizada para este proyecto.`,
  };
}

export async function createResearchRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope");
  const rubrics = readFormString(formData, "rubrics");
  const notes = readFormString(formData, "notes");
  const sourceMode = researchSourceSchema.safeParse(
    readFormString(formData, "sourceMode") || "existing_and_new",
  );

  if (!scope || isAllCampaignsScope(scope)) {
    return {
      ok: false,
      message: "Elige un proyecto concreto para pedir investigación.",
    };
  }

  if (!rubrics || !sourceMode.success) {
    return {
      ok: false,
      message: "Escribe rubros, tipos de empresa o criterios de búsqueda.",
    };
  }

  const campaignRows = await sql`
    select id, slug, name, organization, description, value_proposition
    from campaigns
    where slug = ${scope}
    limit 1
  `;
  const campaign = campaignRows[0];

  if (!campaign) {
    return { ok: false, message: "No encontré ese proyecto." };
  }

  await sql`
    insert into automation_runs (
      campaign_id,
      job_name,
      status,
      input_summary,
      output_summary
    ) values (
      ${campaign.id},
      ${kimiDeepResearchJobName},
      'running',
      ${sql.json({
        requestedBy: "dashboard",
        sourceMode: sourceMode.data,
        rubrics,
        notes,
        project: {
          slug: campaign.slug,
          name: campaign.name,
          organization: campaign.organization,
          description: campaign.description,
          valueProposition: campaign.value_proposition,
        },
        instructions: getKimiDeepResearchInstructions(),
      })},
      ${sql.json({
        nextStep:
          "KimiClaw debe investigar, guardar empresas/contactos no verificados y dejar evidencia.",
      })}
    )
  `;

  const campaignContext = await getDomCampaignContextBySlug(scope);
  const thread = campaignContext
    ? await ensureDomChatThread(campaignContext.dbId, campaignContext.name)
    : null;
  const taskRows = await sql`
    insert into dom_tasks (
      campaign_id,
      description,
      status,
      created_by,
      context,
      chat_thread_id
    ) values (
      ${campaign.id},
      ${`Investigar empresas: ${rubrics}`},
      'pending',
      'user',
      ${sql.json({
        sourceMode: sourceMode.data,
        rubrics,
        notes,
        instructions: getKimiDeepResearchInstructions(),
      })},
      ${thread?.id ?? null}
    )
    returning id::text as id
  `;

  if (thread?.id) {
    await sql`
      insert into chat_messages (
        thread_id,
        role,
        content,
        metadata
      ) values (
        ${thread.id},
        'user',
        ${`Tarea para Dom: investigar empresas de ${rubrics}${notes ? ` (${notes})` : ""}`},
        ${sql.json({
          event: "dom_task_created",
          taskId: taskRows[0]?.id ?? null,
          source: "research_request_form",
        })}
      )
    `;
  }

  revalidateProspectingPaths(scope);
  await notifyDomEventForCampaignSlug({
    event: "dom_task_created",
    scope,
    data: {
      task_id: String(taskRows[0]?.id ?? ""),
      description: `Investigar empresas: ${rubrics}`,
      source_mode: sourceMode.data,
      rubrics,
      notes,
    },
  });

  return {
    ok: true,
    message:
      "Pedido guardado para KimiClaw. Prioridad: empresas nuevas con investigación profunda y evidencia.",
  };
}

export async function createDomTaskAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope");
  const description = readFormString(formData, "description");
  const context = readFormString(formData, "context");

  if (!scope || isAllCampaignsScope(scope)) {
    return {
      ok: false,
      message: "Elige un proyecto concreto para crear una tarea de Dom.",
    };
  }

  if (description.length < 4) {
    return { ok: false, message: "Escribe una tarea clara para Dom." };
  }

  const campaignContext = await getDomCampaignContextBySlug(scope);
  if (!campaignContext) {
    return { ok: false, message: "No encontré ese proyecto." };
  }

  const thread = await ensureDomChatThread(campaignContext.dbId, campaignContext.name);
  const rows = await sql`
    insert into dom_tasks (
      campaign_id,
      description,
      status,
      created_by,
      context,
      chat_thread_id
    ) values (
      ${campaignContext.dbId},
      ${description},
      'pending',
      'user',
      ${sql.json({
        context: context || null,
        project: campaignContext,
      })},
      ${thread?.id ?? null}
    )
    returning id::text as id
  `;

  if (thread?.id) {
    await sql`
      insert into chat_messages (
        thread_id,
        role,
        content,
        metadata
      ) values (
        ${thread.id},
        'user',
        ${`Tarea para Dom: ${description}${context ? `\n\nContexto: ${context}` : ""}`},
        ${sql.json({
          event: "dom_task_created",
          taskId: rows[0]?.id ?? null,
          source: "manual_task_form",
        })}
      )
    `;
  }

  revalidateProspectingPaths(scope);
  await notifyDomEventForCampaignSlug({
    event: "dom_task_created",
    scope,
    data: {
      task_id: String(rows[0]?.id ?? ""),
      description,
      context,
      source: "manual_task_form",
    },
  });

  return { ok: true, message: "Tarea creada y enviada a Dom." };
}

export async function createProjectAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const name = readFormString(formData, "name");
  const organization = readFormString(formData, "organization");
  const description = readFormString(formData, "description");
  const valueProposition = readFormString(formData, "valueProposition");
  const startsOn = nullIfEmpty(readFormString(formData, "startsOn"));
  const senderEmail = normalizeEmail(
    readFormString(formData, "senderEmail") || "sawitting@miuandes.cl",
  );
  const status = projectStatusSchema.safeParse(
    readFormString(formData, "status") || "active",
  );

  if (!name || !organization || !description || !valueProposition || !status.success) {
    return {
      ok: false,
      message: "Completa nombre, organización/contexto, descripción y necesidad del proyecto.",
    };
  }

  const baseSlug = slugifyProjectName(name);
  if (!baseSlug) {
    return { ok: false, message: "El nombre no permite crear un slug válido." };
  }

  const result = await sql.begin(async (tx) => {
    const slug = await getUniqueCampaignSlug(tx, baseSlug);
    const campaignRows = await tx`
      insert into campaigns (
        slug,
        name,
        organization,
        description,
        value_proposition,
        status,
        starts_on
      ) values (
        ${slug},
        ${name},
        ${organization},
        ${description},
        ${valueProposition},
        ${status.data}::campaign_status,
        ${startsOn}
      )
      returning id, slug
    `;
    const campaign = campaignRows[0];

    let senderRows = await tx`
      select id
      from sender_accounts
      where email = ${senderEmail}
      limit 1
    `;

    if (!senderRows[0]) {
      senderRows = await tx`
        insert into sender_accounts (
          email,
          display_name,
          organization,
          account_type,
          signature,
          status,
          daily_limit
        ) values (
          ${senderEmail},
          'Sebastian Witting',
          ${organization},
          'gmail',
          ${`Sebastian Witting\nJefatura de Recursos Financieros\n${organization}`},
          'active',
          25
        )
        returning id
      `;
    }

    const senderAccountId = senderRows[0].id;

    await tx`
      insert into campaign_sender_accounts (
        campaign_id,
        sender_account_id,
        priority,
        campaign_daily_limit,
        is_default
      ) values (
        ${campaign.id},
        ${senderAccountId},
        1,
        25,
        true
      )
      on conflict (campaign_id, sender_account_id) do update
      set
        priority = excluded.priority,
        campaign_daily_limit = excluded.campaign_daily_limit,
        is_default = true
    `;

    return { slug: String(campaign.slug) };
  });

  revalidateProspectingPaths(result.slug);
  return {
    ok: true,
    message: `Proyecto creado. Entra a /campaigns/${result.slug} para cargar empresas.`,
  };
}

export async function updateReplyDraftAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const replyId = readFormString(formData, "replyId");
  const draft = readFormString(formData, "draft");
  const intent = replyIntentSchema.safeParse(readFormString(formData, "intent"));

  if (!replyId || !intent.success) {
    return { ok: false, message: "Faltan datos para actualizar la respuesta." };
  }

  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select
        m.id,
        m.thread_id,
        m.campaign_id,
        c.slug as campaign_slug,
        m.company_id,
        m.contact_id,
        m.sender_account_id,
        coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
        coalesce(m.gmail_thread_id, t.gmail_thread_id) as gmail_thread_id,
        m.status::text as status
      from messages m
      join campaigns c on c.id = m.campaign_id
      left join threads t on t.id = m.thread_id
      where m.id = ${replyId}
        and m.kind = 'inbound_reply'
      limit 1
    `;
    const reply = rows[0];

    if (!reply) return { kind: "missing" as const };
    if (reply.status === "sent") return { kind: "sent" as const };

    const nextStatus = intent.data === "save" ? reply.status : intent.data;

    await tx`
      update messages
      set
        status = ${nextStatus}::message_status,
        body_final = ${draft},
        approved_at = case
          when ${nextStatus}::message_status = 'approved' then now()
          when ${nextStatus}::message_status = 'rejected' then null
          else approved_at
        end,
        updated_at = now()
      where id = ${replyId}
    `;

    if (intent.data !== "approved") {
      return {
        kind: intent.data,
        campaignSlug: String(reply.campaign_slug),
      };
    }

    const existingOutboundReply = await tx`
      select id
      from messages
      where kind = 'outbound_reply'
        and position(${replyId} in coalesce(future_note, '')) > 0
      limit 1
    `;

    if (!existingOutboundReply[0]) {
      await tx`
        insert into messages (
          thread_id,
          campaign_id,
          company_id,
          contact_id,
          sender_account_id,
          kind,
          status,
          subject_draft,
          subject_final,
          body_draft,
          body_final,
          gmail_thread_id,
          approved_at,
          future_note
        ) values (
          ${reply.thread_id},
          ${reply.campaign_id},
          ${reply.company_id},
          ${reply.contact_id},
          ${reply.sender_account_id},
          'outbound_reply',
          'approved',
          ${reply.subject},
          ${reply.subject},
          ${draft},
          ${draft},
          ${reply.gmail_thread_id},
          now(),
          ${`Respuesta creada desde reply ${replyId}. Enviar usando el thread Gmail existente: ${reply.gmail_thread_id ?? "sin thread_id registrado"}.`}
        )
      `;
    }

    await tx`
      update campaign_contacts cc
      set
        status = 'approved_to_send',
        updated_at = now()
      where cc.campaign_id = ${reply.campaign_id}
        and cc.company_id = ${reply.company_id}
        and (cc.contact_id = ${reply.contact_id} or cc.contact_id is null)
    `;

    return {
      kind: "approved",
      campaignSlug: String(reply.campaign_slug),
    };
  });

  if (result.kind === "missing") {
    return { ok: false, message: "No encontré esa respuesta en la base." };
  }

  if (result.kind === "sent") {
    return { ok: false, message: "Esa respuesta ya fue enviada." };
  }

  const campaignSlug = result.campaignSlug;
  if (!campaignSlug) {
    return { ok: false, message: "No encontré el proyecto de esta respuesta." };
  }

  revalidateProspectingPaths(campaignSlug);
  if (intent.data === "approved") {
    await notifyDomEventForCampaignSlug({
      event: "mail_approved",
      scope: campaignSlug,
      data: {
        reply_id: replyId,
        source: "reply_review",
        note: "Usuario aprobó una respuesta para enviar en el mismo hilo.",
      },
    });
  }

  return {
    ok: true,
    message:
      intent.data === "save"
        ? "Draft guardado."
        : intent.data === "approved"
          ? "Respuesta aprobada. La dejé en Mails > Aprobados para enviar y saldrá en el mismo hilo."
          : "Respuesta rechazada.",
  };
}

export async function createLeadAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope") || ALL_CAMPAIGNS_SCOPE;
  const campaignSlug = isAllCampaignsScope(scope)
    ? readFormString(formData, "campaignSlug")
    : scope;
  const companyName = readFormString(formData, "companyName");
  const contactName = readFormString(formData, "contactName");
  const role = nullIfEmpty(readFormString(formData, "role"));
  const email = normalizeEmail(readFormString(formData, "email"));
  const website = nullIfEmpty(readFormString(formData, "website"));
  const companyDescription = nullIfEmpty(
    readFormString(formData, "companyDescription"),
  );
  const source = readFormString(formData, "source") || "dashboard";
  const isDecisionMaker = formData.get("isDecisionMaker") === "on";
  const domain =
    normalizeDomain(readFormString(formData, "domain")) ??
    normalizeDomain(website) ??
    extractDomain(email);

  if (!campaignSlug) {
    return { ok: false, message: "El lead necesita un proyecto." };
  }

  if (!companyName && !domain) {
    return { ok: false, message: "El lead necesita empresa o dominio." };
  }

  if (!contactName && !email) {
    return { ok: false, message: "El lead necesita contacto o email." };
  }

  const normalizedName = normalizeCompanyName(companyName || domain || "");
  const fullName = contactName || "Contacto por definir";

  await sql.begin(async (tx) => {
    const campaignRows = await tx`
      select id
      from campaigns
      where slug = ${campaignSlug}
      limit 1
    `;
    const campaignId = campaignRows[0]?.id;

    if (!campaignId) {
      throw new Error("campaign_not_found");
    }

    const existingCompany = domain
      ? await tx`
          select id
          from companies
          where domain = ${domain} or normalized_name = ${normalizedName}
          limit 1
        `
      : await tx`
          select id
          from companies
          where normalized_name = ${normalizedName}
          limit 1
        `;

    const companyId = existingCompany[0]?.id
      ? existingCompany[0].id
      : (
          await tx`
            insert into companies (
              canonical_name,
              normalized_name,
              domain,
              website,
              industry,
              region,
              description,
              global_notes
            ) values (
              ${companyName || domain || "Empresa sin nombre"},
              ${normalizedName},
              ${domain},
              ${website},
              'Por clasificar',
              'Por definir',
              ${companyDescription ?? (role ? `Empresa/contacto creado manualmente. Contacto principal: ${fullName}, ${role}.` : "Empresa creada manualmente; falta descripción breve.")},
              'Creado manualmente desde dashboard.'
            )
            returning id
          `
        )[0].id;

    if (existingCompany[0]?.id) {
      await tx`
        update companies
        set
          website = coalesce(website, ${website}),
          domain = coalesce(domain, ${domain}),
          description = coalesce(${companyDescription}, description),
          updated_at = now()
        where id = ${companyId}
      `;
    }

    const contactRows = email
      ? await tx`
          insert into contacts (
            company_id,
            full_name,
            normalized_name,
            role,
            category,
            email,
            source,
            confidence,
            verification_status,
            is_decision_maker,
            global_notes
          ) values (
            ${companyId},
            ${fullName},
            ${normalizeCompanyName(fullName)},
            ${role},
            ${role ? "Por cargo" : "Por clasificar"},
            ${email},
            ${source},
            0.6,
            'unverified',
            false,
            'Creado manualmente desde dashboard.'
          )
          on conflict (email) do update
          set
            company_id = excluded.company_id,
            full_name = excluded.full_name,
            normalized_name = excluded.normalized_name,
            role = coalesce(excluded.role, contacts.role),
            category = coalesce(excluded.category, contacts.category),
            source = coalesce(excluded.source, contacts.source),
            is_decision_maker = case
              when contacts.verification_status = 'verified' then contacts.is_decision_maker or excluded.is_decision_maker
              else contacts.is_decision_maker
            end,
            updated_at = now()
          returning id
        `
      : await tx`
          insert into contacts (
            company_id,
            full_name,
            normalized_name,
            role,
            category,
            source,
            confidence,
            verification_status,
            is_decision_maker,
            global_notes
          ) values (
            ${companyId},
            ${fullName},
            ${normalizeCompanyName(fullName)},
            ${role},
            ${role ? "Por cargo" : "Por clasificar"},
            ${source},
            0.45,
            'unverified',
            false,
            'Creado manualmente desde dashboard.'
          )
          returning id
        `;

    const contactId = contactRows[0].id;

    await tx`
      insert into campaign_contacts (
        campaign_id,
        company_id,
        contact_id,
        fit_score,
        priority_score,
        status,
        selected_contact_reason,
        campaign_notes
      ) values (
        ${campaignId},
        ${companyId},
        ${contactId},
        50,
        45,
        'new',
        'Lead creado manualmente desde dashboard.',
        ${[
          source,
          isDecisionMaker
            ? "Marcado como posible decisor, pero queda sin validar hasta recibir respuesta real."
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
      )
      on conflict (campaign_id, company_id, contact_id) do update
      set
        priority_score = case
          when exists (
            select 1
            from contacts
            where contacts.id = excluded.contact_id
              and contacts.verification_status = 'verified'
          )
          then greatest(campaign_contacts.priority_score, excluded.priority_score)
          else least(campaign_contacts.priority_score, excluded.priority_score)
        end,
        updated_at = now()
    `;
  });

  revalidateProspectingPaths(campaignSlug);
  return { ok: true, message: "Lead creado y linkeado al proyecto." };
}

export async function createSenderAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope") || ALL_CAMPAIGNS_SCOPE;
  const campaignSlug = isAllCampaignsScope(scope)
    ? readFormString(formData, "campaignSlug")
    : scope;
  const email = normalizeEmail(readFormString(formData, "email"));
  const displayName = readFormString(formData, "displayName");
  const organization = readFormString(formData, "organization");
  const signature = readFormString(formData, "signature");
  const dailyLimit = Math.max(1, Number(readFormString(formData, "dailyLimit")) || 15);
  const campaignDailyLimit = Math.max(
    1,
    Number(readFormString(formData, "campaignDailyLimit")) || dailyLimit,
  );
  const status = senderStatusSchema.safeParse(readFormString(formData, "status"));
  const accountType = senderAccountTypeSchema.safeParse(
    readFormString(formData, "accountType") || "gmail",
  );
  const isDefault = formData.get("isDefault") === "on";

  if (!campaignSlug) {
    return { ok: false, message: "El remitente necesita un proyecto." };
  }

  if (!email || !displayName || !status.success || !accountType.success) {
    return {
      ok: false,
      message: "Completa email, nombre visible y estado del remitente.",
    };
  }

  await sql.begin(async (tx) => {
    const campaignRows = await tx`
      select id
      from campaigns
      where slug = ${campaignSlug}
      limit 1
    `;
    const campaignId = campaignRows[0]?.id;

    if (!campaignId) {
      throw new Error("campaign_not_found");
    }

    const senderRows = await tx`
      insert into sender_accounts (
        email,
        display_name,
        organization,
        account_type,
        signature,
        status,
        daily_limit
      ) values (
        ${email},
        ${displayName},
        ${organization || null},
        ${accountType.data},
        ${signature || null},
        ${status.data}::sender_account_status,
        ${dailyLimit}
      )
      on conflict (email) do update
      set
        display_name = excluded.display_name,
        organization = excluded.organization,
        account_type = excluded.account_type,
        signature = excluded.signature,
        status = excluded.status,
        daily_limit = excluded.daily_limit,
        updated_at = now()
      returning id
    `;
    const senderAccountId = senderRows[0].id;

    const existingLinks = await tx`
      select count(*)::int as count
      from campaign_sender_accounts
      where campaign_id = ${campaignId}
    `;
    const shouldBeDefault = isDefault || Number(existingLinks[0]?.count ?? 0) === 0;

    if (shouldBeDefault) {
      await tx`
        update campaign_sender_accounts
        set is_default = false
        where campaign_id = ${campaignId}
      `;
    }

    await tx`
      insert into campaign_sender_accounts (
        campaign_id,
        sender_account_id,
        priority,
        campaign_daily_limit,
        is_default
      ) values (
        ${campaignId},
        ${senderAccountId},
        1,
        ${campaignDailyLimit},
        ${shouldBeDefault}
      )
      on conflict (campaign_id, sender_account_id) do update
      set
        campaign_daily_limit = excluded.campaign_daily_limit,
        is_default = excluded.is_default
    `;
  });

  revalidateProspectingPaths(campaignSlug);
  return { ok: true, message: "Remitente guardado y linkeado." };
}

export async function applyImportAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const scope = readFormString(formData, "scope") || ALL_CAMPAIGNS_SCOPE;
  const campaignSlug = isAllCampaignsScope(scope) ? null : scope;
  const sourceName = readFormString(formData, "sourceName") || "Import dashboard";
  const rowsJson = readFormString(formData, "rowsJson");
  const parsedRows = z.array(importRowSchema).safeParse(parseJson(rowsJson));

  if (!parsedRows.success || parsedRows.data.length === 0) {
    return { ok: false, message: "No hay filas válidas para importar." };
  }

  let appliedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  await sql.begin(async (tx) => {
    const campaignRows = campaignSlug
      ? await tx`
          select id
          from campaigns
          where slug = ${campaignSlug}
          limit 1
        `
      : [];
    const campaignId = campaignRows[0]?.id ?? null;

    const batchRows = await tx`
      insert into import_batches (
        campaign_id,
        source_name,
        source_type,
        status,
        row_count
      ) values (
        ${campaignId},
        ${sourceName},
        ${guessSourceType(sourceName)},
        'parsed',
        ${parsedRows.data.length}
      )
      returning id
    `;
    const batchId = batchRows[0].id;

    for (const [index, row] of parsedRows.data.entries()) {
      try {
        const normalizedCompany = normalizeCompanyName(row.companyName);
        const email = normalizeEmail(row.email);
        const domain = extractDomain(email);
        const companyName = row.companyName || domain || "Empresa sin nombre";
        const contactName = row.contactName || "Contacto importado";

        const duplicateCompanyRows = domain
          ? await tx`
              select id
              from companies
              where domain = ${domain} or normalized_name = ${normalizedCompany}
              limit 1
            `
          : await tx`
              select id
              from companies
              where normalized_name = ${normalizedCompany}
              limit 1
            `;
        const duplicateCompanyId = duplicateCompanyRows[0]?.id ?? null;

        if (duplicateCompanyId) duplicateCount += 1;

        const companyId = duplicateCompanyId
          ? duplicateCompanyId
          : (
              await tx`
                insert into companies (
                  canonical_name,
                  normalized_name,
                  domain,
                  website,
                  industry,
                  region,
                  description,
                  global_notes
                ) values (
                  ${companyName},
                  ${normalizedCompany || normalizeCompanyName(companyName)},
                  ${domain},
                  ${domain ? `https://${domain}` : null},
                  'Por clasificar',
                  'Por definir',
                  ${row.role ? `Empresa importada con contacto ${contactName}, ${row.role}.` : "Empresa importada; falta descripción breve."},
                  'Creado desde import.'
                )
                returning id
              `
            )[0].id;

        const duplicateContactRows = email
          ? await tx`
              select id
              from contacts
              where email = ${email}
              limit 1
            `
          : [];
        const duplicateContactId = duplicateContactRows[0]?.id ?? null;

        const contactId = email
          ? (
              await tx`
                insert into contacts (
                  company_id,
                  full_name,
                  normalized_name,
                  role,
                  category,
                  email,
                  source,
                  confidence,
                  verification_status,
                  is_decision_maker,
                  global_notes
                ) values (
                  ${companyId},
                  ${contactName},
                  ${normalizeCompanyName(contactName)},
                  ${nullIfEmpty(row.role)},
                  ${row.role ? "Por cargo" : "Por clasificar"},
                  ${email},
                  ${row.source || "import"},
                  0.55,
                  'unverified',
                  false,
                  'Creado desde import.'
                )
                on conflict (email) do update
                set
                  company_id = excluded.company_id,
                  role = coalesce(excluded.role, contacts.role),
                  source = coalesce(excluded.source, contacts.source),
                  updated_at = now()
                returning id
              `
            )[0].id
          : (
              await tx`
                insert into contacts (
                  company_id,
                  full_name,
                  normalized_name,
                  role,
                  category,
                  source,
                  confidence,
                  verification_status,
                  is_decision_maker,
                  global_notes
                ) values (
                  ${companyId},
                  ${contactName},
                  ${normalizeCompanyName(contactName)},
                  ${nullIfEmpty(row.role)},
                  ${row.role ? "Por cargo" : "Por clasificar"},
                  ${row.source || "import"},
                  0.4,
                  'unverified',
                  false,
                  'Creado desde import.'
                )
                returning id
              `
            )[0].id;

        if (campaignId) {
          await tx`
            insert into campaign_contacts (
              campaign_id,
              company_id,
              contact_id,
              fit_score,
              priority_score,
              status,
              selected_contact_reason,
              campaign_notes
            ) values (
              ${campaignId},
              ${companyId},
              ${contactId},
              50,
              45,
              'new',
              'Lead importado desde archivo.',
              ${[
                sourceName,
                row.isDecisionMaker
                  ? "El archivo lo marcaba como posible decisor; validar solo si responde."
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            )
            on conflict (campaign_id, company_id, contact_id) do update
            set updated_at = now()
          `;
        }

        await tx`
          insert into import_rows (
            import_batch_id,
            row_index,
            raw_data,
            normalized_data,
            duplicate_company_id,
            duplicate_contact_id,
            resolution
          ) values (
            ${batchId},
            ${index},
            ${tx.json(row)},
            ${tx.json({
              companyName,
              contactName,
              email,
              domain,
            })},
            ${duplicateCompanyId},
            ${duplicateContactId},
            ${duplicateCompanyId || duplicateContactId ? "linked" : "created"}
          )
        `;

        appliedCount += 1;
      } catch (error) {
        errorCount += 1;
        await tx`
          insert into import_rows (
            import_batch_id,
            row_index,
            raw_data,
            resolution,
            error
          ) values (
            ${batchId},
            ${index},
            ${tx.json(row)},
            'failed',
            ${error instanceof Error ? error.message : "unknown_error"}
          )
        `;
      }
    }

    await tx`
      update import_batches
      set
        status = ${errorCount > 0 ? "needs_review" : "applied"}::import_status,
        applied_count = ${appliedCount},
        duplicate_count = ${duplicateCount},
        error_count = ${errorCount}
      where id = ${batchId}
    `;
  });

  revalidateProspectingPaths(campaignSlug ?? undefined);
  return {
    ok: errorCount === 0,
    message: `${appliedCount} filas aplicadas, ${duplicateCount} duplicados linkeados, ${errorCount} errores.`,
  };
}

function readFormString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function nullIfEmpty(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function guessSourceType(sourceName: string) {
  const lower = sourceName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.includes("sheet")) return "sheets";
  if (lower.includes("notion")) return "notion";
  return "excel";
}

function parseJson(value: string) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

function revalidateProspectingPaths(scope?: string) {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${ALL_CAMPAIGNS_SCOPE}`);

  if (scope) {
    revalidatePath(`/campaigns/${scope}`);
    revalidatePath(`/campaigns/${scope}/contacts`);
    revalidatePath(`/campaigns/${scope}/companies`);
    revalidatePath(`/campaigns/${scope}/imports`);
    revalidatePath(`/campaigns/${scope}/pipeline`);
    revalidatePath(`/campaigns/${scope}/tasks`);
    revalidatePath(`/campaigns/${scope}/review/outbound`);
    revalidatePath(`/campaigns/${scope}/review/replies`);
    revalidatePath(`/campaigns/${scope}/settings/senders`);
  }
}

// postgres.js transaction tags have helper overloads that are stricter than
// this helper needs; we only use the tagged-template query surface here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUniqueCampaignSlug(tx: any, baseSlug: string) {
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const rows = await tx`
      select 1
      from campaigns
      where slug = ${candidate}
      limit 1
    `;

    if (!rows[0]) return candidate;
  }

  return `${baseSlug}-${Date.now()}`;
}

function slugifyProjectName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}
