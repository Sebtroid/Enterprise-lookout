"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sendAgentEvent } from "@/lib/agent/events";
import {
  ALL_CAMPAIGNS_SCOPE,
  isAllCampaignsScope,
} from "@/lib/prospecting/repository";
import {
  getCampaignCompanyDecisionPatch,
  type CompanyCampaignDecision,
} from "@/lib/prospecting/company-intelligence";
import {
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
import {
  ensureDomChatThread,
  getDomCampaignContextBySlug,
} from "@/lib/dom/repository";
import { PROJECT_CONTEXT_REFINEMENT_TASK_TYPE } from "@/lib/dom/project-context";
import { getExistingContextName } from "@/lib/prospecting/context";
import { getPostgresClient } from "@/lib/supabase/postgres";

export type ActionState = {
  ok: boolean;
  message: string;
  intent?: string;
  messageId?: string;
};

const initialError =
  "Falta configurar SUPABASE_DB_URL en el entorno del servidor.";

const messageIntentSchema = z.enum(["save", "approved", "rejected"]);
const replyIntentSchema = z.enum(["save", "approved", "rejected", "no_reply"]);
const outboundRejectionReasonSchema = z.enum([
  "company_not_fit",
  "bad_copy",
]);
const companyDecisionSchema = z.enum(["fit", "maybe", "not_fit"]);
const candidateReviewIntentSchema = z.enum(["accept", "reject", "research"]);
const senderStatusSchema = z.enum(["active", "paused", "disabled"]);
const senderAccountTypeSchema = z.enum(["gmail", "outlook", "smtp", "manual"]);
const projectStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
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
      m.campaign_id::text as campaign_id,
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

  return {
    ok: true,
    intent: intent.data,
    messageId,
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
        returning
          campaign_id::text as campaign_id,
          company_id::text as company_id,
          contact_id::text as contact_id
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

  const sentMessage = rows[0] as
    | { campaign_id: string; company_id: string | null; contact_id: string | null }
    | undefined;
  if (sentMessage) {
    await sendAgentEvent({
      event: "mail_sent",
      campaignId: sentMessage.campaign_id,
      companyId: sentMessage.company_id ?? "",
      contactId: sentMessage.contact_id ?? "",
      messageId,
      data: { sent_manually: true },
      priority: "normal",
      source: "manual_mark_sent",
    });
  }

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
        m.campaign_id::text as campaign_id,
        c.slug as campaign_slug,
        m.company_id::text as company_id,
        m.contact_id::text as contact_id,
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
          reason.data === "bad_copy"
            ? "Esperando nueva redacción de Dom."
            : "Cerrado sin nueva redacción.",
        ]
          .filter(Boolean)
          .join(" ")},
        updated_at = now()
      where id = ${message.id}
    `;

    if (reason.data === "company_not_fit") {
      const closedNegativeNote =
        comment || "Empresa descartada por fit desde revisión de mail.";

      await tx`
        update campaign_contacts
        set
          status = 'closed_negative'::campaign_contact_status,
          future_notes = concat_ws(
            E'\n',
            future_notes,
            ${closedNegativeNote}::text
          ),
          updated_at = now()
        where campaign_id = ${message.campaign_id}
          and company_id = ${message.company_id}
          and (contact_id = ${message.contact_id} or contact_id is null)
      `;

      return {
        kind: "closed" as const,
        campaign_slug: message.campaign_slug,
        campaignId: String(message.campaign_id),
        companyId: String(message.company_id ?? ""),
        contactId: String(message.contact_id ?? ""),
      };
    }

    await tx`
      update campaign_contacts
      set status = 'draft_ready', updated_at = now()
      where campaign_id = ${message.campaign_id}
        and company_id = ${message.company_id}
        and (contact_id = ${message.contact_id} or contact_id is null)
    `;

    return {
      kind: "redraft_requested" as const,
      campaign_slug: message.campaign_slug,
      campaignId: String(message.campaign_id),
      companyId: String(message.company_id ?? ""),
      contactId: String(message.contact_id ?? ""),
      subject: String(message.subject ?? ""),
      originalBody: String(message.body ?? ""),
      rememberForFuture,
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
    await sendAgentEvent({
      event: "mail_rejected",
      campaignId: result.campaignId,
      companyId: result.companyId,
      contactId: result.contactId,
      messageId,
      data: {
        reason: reason.data,
        comment,
        remember_for_future: rememberForFuture,
        outcome: "company_closed_negative",
      },
      priority: "high",
      source: "outbound_review",
    });
    return {
      ok: true,
      message: "Mail rechazado y empresa/contacto cerrado por falta de fit.",
    };
  }

  if (result.kind === "redraft_requested" && result.campaign_slug) {
    const taskDescription = `Redactar nueva versión del mail rechazado para ${result.subject}.`;
    const taskContext = {
      source: "outbound_rejection",
      task_type: "redraft_email",
      requested_action: "draft_needed",
      redraft_target: "outbound_review_redrafts",
      source_message_id: messageId,
      message_id: messageId,
      company_id: result.companyId,
      contact_id: result.contactId,
      reason: reason.data,
      feedback: comment,
      remember_for_future: result.rememberForFuture,
      subject: result.subject,
      original_body: result.originalBody,
      instructions: [
        "Crear un nuevo borrador en messages con status needs_review.",
        "No modificar ni enviar el mail rechazado original.",
        "La action create_draft debe incluir source_message_id para sacar el original de Redactando nueva version.",
      ],
    };
    const taskId = await createVisibleDomTaskForCampaign({
      campaignId: result.campaignId,
      campaignSlug: String(result.campaign_slug),
      description: taskDescription,
      context: taskContext,
    });

    await sendAgentEvent({
      event: "mail_rejected",
      campaignId: result.campaignId,
      companyId: result.companyId,
      contactId: result.contactId,
      messageId,
      data: {
        reason: reason.data,
        comment,
        remember_for_future: rememberForFuture,
        outcome: "waiting_for_dom_redraft",
      },
      priority: "high",
      source: "outbound_review",
    });
    await sendAgentEvent({
      event: "dom_task_created",
      campaignId: result.campaignId,
      companyId: result.companyId,
      contactId: result.contactId,
      messageId,
      data: {
        task_id: taskId,
        task_type: "redraft_email",
        description: taskDescription,
        source_message_id: messageId,
        source: "outbound_rejection",
        requested_action: "draft_needed",
        reason: reason.data,
        feedback: comment,
        remember_for_future: result.rememberForFuture,
        subject: result.subject,
        original_body: result.originalBody,
        redraft_target: "outbound_review_redrafts",
        company_id: result.companyId,
        contact_id: result.contactId,
      },
      priority: "high",
      source: "outbound_review",
    });
  }

  return {
    ok: true,
    message: "Mail rechazado. Quedó en Rechazados mientras Dom redacta la nueva versión.",
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
        and email is not null
        and do_not_contact = false
        and verification_status <> 'invalid'
      order by is_decision_maker desc, confidence desc nulls last, created_at asc
      limit 1
    `;
    const contactId = contactRows[0]?.id ?? null;
    const senderRows = await tx`
      select csa.sender_account_id::text as sender_id
      from campaign_sender_accounts csa
      join sender_accounts sa on sa.id = csa.sender_account_id
      where csa.campaign_id = ${campaign.id}
        and sa.status = 'active'
      order by csa.is_default desc, csa.priority asc
      limit 1
    `;
    const senderId = senderRows[0]?.sender_id
      ? String(senderRows[0].sender_id)
      : null;
    const nextStatus =
      decision.data === "fit" && (!contactId || !senderId)
        ? "needs_research"
        : patch.status;
    const campaignNotes =
      decision.data === "fit" && (!contactId || !senderId)
        ? "Sirve para este proyecto. Falta contacto/remitente usable antes de redactar."
        : patch.campaignNotes;

    const updatedRows = await tx`
      update campaign_contacts
      set
        fit_score = ${patch.fitScore},
        priority_score = ${patch.priorityScore},
        status = ${nextStatus}::campaign_contact_status,
        selected_contact_reason = ${patch.selectedContactReason},
        campaign_notes = ${campaignNotes},
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
          ${nextStatus}::campaign_contact_status,
          ${patch.selectedContactReason},
          ${campaignNotes}
        )
      `;
    }

    return {
      kind: "updated" as const,
      campaignId: String(campaign.id),
      companyId,
      campaignSlug: String(campaign.slug),
      companyName: String(company.canonical_name),
      contactId: contactId ? String(contactId) : "",
      senderId,
      status: nextStatus,
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
    await sendAgentEvent({
      event: "company_classified",
      campaignId: result.campaignId,
      companyId: result.companyId,
      data: {
        company_name: result.companyName,
        classification: result.decision === "fit" ? "sirve" : "investigar",
      },
      priority: result.decision === "fit" ? "high" : "normal",
      source: "company_explorer",
    });
  }

  if (result.decision === "fit") {
    if (result.contactId && result.senderId) {
      const taskId = await createVisibleDomTaskForCampaign({
        campaignId: result.campaignId,
        campaignSlug: result.campaignSlug,
        description: `Redactar mail inicial para ${result.companyName}.`,
        context: {
          source: "company_marked_fit",
          requested_action: "draft_needed",
          desired_status: "needs_review",
          company_id: result.companyId,
          contact_id: result.contactId,
          company_name: result.companyName,
        },
      });
      await sendAgentEvent({
        event: "dom_task_created",
        campaignId: result.campaignId,
        companyId: result.companyId,
        contactId: result.contactId,
        data: {
          task_id: taskId,
          description: `Redactar mail inicial para ${result.companyName}.`,
          company_name: result.companyName,
          source: "company_marked_fit",
          requested_action: "draft_needed",
          desired_status: "needs_review",
        },
        priority: "high",
        source: "company_explorer",
      });
    } else {
      const taskId = await createVisibleDomTaskForCampaign({
        campaignId: result.campaignId,
        campaignSlug: result.campaignSlug,
        description: `Investigar contacto usable y redactar mail inicial para ${result.companyName}.`,
        context: {
          source: "company_marked_fit_without_contact",
          company_id: result.companyId,
          company_name: result.companyName,
        },
      });
      await sendAgentEvent({
        event: "dom_task_created",
        campaignId: result.campaignId,
        companyId: result.companyId,
        data: {
          task_id: taskId,
          description: `Investigar contacto usable y redactar mail inicial para ${result.companyName}.`,
          source: "company_marked_fit_without_contact",
        },
        priority: "high",
        source: "company_explorer",
      });
    }
  }

  if (result.decision === "maybe") {
    const taskId = await createVisibleDomTaskForCampaign({
      campaignId: result.campaignId,
      campaignSlug: result.campaignSlug,
      description: `Investigar si ${result.companyName} sirve para este proyecto y proponer próximos pasos.`,
      context: {
        source: "company_marked_investigate",
        company_id: result.companyId,
        company_name: result.companyName,
      },
    });
    await sendAgentEvent({
      event: "dom_task_created",
      campaignId: result.campaignId,
      companyId: result.companyId,
      data: {
        task_id: taskId,
        description: `Investigar si ${result.companyName} sirve para este proyecto y proponer próximos pasos.`,
        source: "company_marked_investigate",
      },
      priority: "normal",
      source: "company_explorer",
    });
  }

  return {
    ok: true,
    message:
      result.decision === "fit"
        ? `${result.companyName} marcada como sirve. ${result.status === "ready_to_draft" ? "Se creó tarea visible para que Dom redacte." : "Dom recibió tarea para investigar contacto y redactar."}`
        : result.decision === "maybe"
          ? `${result.companyName} marcada para investigar. Se creó tarea visible para Dom.`
          : `${result.companyName} descartada para este proyecto.`,
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
  await sendAgentEvent({
    event: "dom_task_created",
    campaignId: String(campaign.id),
    data: {
      task_id: String(taskRows[0]?.id ?? ""),
      description: `Investigar empresas: ${rubrics}`,
      source_mode: sourceMode.data,
      rubrics,
      notes,
      instructions: getKimiDeepResearchInstructions(),
    },
    priority: "high",
    source: "research_request_form",
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
  await sendAgentEvent({
    event: "dom_task_created",
    campaignId: campaignContext.dbId,
    data: {
      task_id: String(rows[0]?.id ?? ""),
      description,
      context,
    },
    priority: "normal",
    source: "manual_task_form",
  });

  return { ok: true, message: "Tarea creada y enviada a Dom." };
}

export async function reviewDomCandidateAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const candidateId = readFormString(formData, "candidateId");
  const intent = candidateReviewIntentSchema.safeParse(
    readFormString(formData, "intent"),
  );
  const feedback = readFormString(formData, "feedback");
  const fitScore = boundedFormInt(formData, "fitScore", 0, 100, null);
  const qualityRating = boundedFormInt(formData, "qualityRating", 1, 5, null);

  if (!candidateId || !intent.success) {
    return { ok: false, message: "Faltan datos para revisar el resultado de Dom." };
  }

  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select
        dcc.id::text as id,
        dcc.task_id::text as task_id,
        coalesce(dcc.campaign_id, dt.campaign_id)::text as campaign_id,
        c.slug as campaign_slug,
        c.name as campaign_name,
        dcc.company_id::text as company_id,
        dcc.name,
        dcc.normalized_name,
        dcc.domain,
        dcc.website,
        dcc.industry,
        dcc.region,
        dcc.description,
        dcc.evidence_urls,
        dcc.suggested_contacts,
        dcc.fit_score,
        dcc.fit_reason,
        dcc.quality_rating,
        dcc.quality_reason,
        dcc.status
      from dom_task_company_candidates dcc
      join dom_tasks dt on dt.id = dcc.task_id
      join campaigns c on c.id = coalesce(dcc.campaign_id, dt.campaign_id)
      where dcc.id = ${candidateId}
      limit 1
    `;
    const candidate = rows[0];
    if (!candidate) return { kind: "missing" as const };

    if (intent.data === "reject") {
      await tx`
        update dom_task_company_candidates
        set
          status = 'rejected',
          user_feedback = ${feedback || null},
          reviewed_at = now(),
          updated_at = now()
        where id = ${candidateId}
      `;
      return {
        kind: "rejected" as const,
        campaignSlug: String(candidate.campaign_slug),
        name: String(candidate.name),
      };
    }

    if (intent.data === "research") {
      await tx`
        update dom_task_company_candidates
        set
          status = 'needs_more_research',
          user_feedback = ${feedback || null},
          reviewed_at = now(),
          updated_at = now()
        where id = ${candidateId}
      `;
      return {
        kind: "research" as const,
        campaignId: String(candidate.campaign_id),
        campaignSlug: String(candidate.campaign_slug),
        companyId: nullableRowString(candidate.company_id),
        name: String(candidate.name),
        feedback,
      };
    }

    const finalFitScore = fitScore ?? numberFromRow(candidate.fit_score, 50);
    const finalQualityRating =
      qualityRating ?? numberFromRow(candidate.quality_rating, 3);
    const domain = nullableRowString(candidate.domain);
    const normalizedName = String(candidate.normalized_name);
    const existingRows = await tx`
      select id
      from companies
      where ${
        domain
          ? tx`domain = ${domain} or normalized_name = ${normalizedName}`
          : tx`normalized_name = ${normalizedName}`
      }
      order by updated_at desc
      limit 1
    `;
    let companyId = existingRows[0]?.id ? String(existingRows[0].id) : "";

    if (companyId) {
      await tx`
        update companies
        set
          canonical_name = ${String(candidate.name)},
          domain = coalesce(${domain}, domain),
          website = coalesce(${nullableRowString(candidate.website)}, website),
          industry = coalesce(${nullableRowString(candidate.industry)}, industry),
          region = coalesce(${nullableRowString(candidate.region)}, region),
          description = coalesce(${nullableRowString(candidate.description)}, description),
          quality_rating = ${finalQualityRating},
          quality_notes = ${nullableRowString(candidate.quality_reason) ?? (feedback || null)},
          updated_at = now()
        where id = ${companyId}
      `;
    } else {
      const companyRows = await tx`
        insert into companies (
          canonical_name,
          normalized_name,
          domain,
          website,
          industry,
          region,
          description,
          global_notes,
          quality_rating,
          quality_notes
        ) values (
          ${String(candidate.name)},
          ${normalizedName},
          ${domain},
          ${nullableRowString(candidate.website)},
          ${nullableRowString(candidate.industry)},
          ${nullableRowString(candidate.region)},
          ${nullableRowString(candidate.description)},
          ${nullableRowString(candidate.fit_reason)},
          ${finalQualityRating},
          ${nullableRowString(candidate.quality_reason) ?? (feedback || null)}
        )
        returning id::text as id
      `;
      companyId = String(companyRows[0].id);
    }

    const contactIds = await insertSuggestedCandidateContacts({
      companyId,
      contacts: arrayFromRow(candidate.suggested_contacts),
      tx,
    });
    const contactId = contactIds[0] ?? null;
    const nextStatus = contactId ? "ready_to_draft" : "needs_research";

    const updatedCampaignRows = await tx`
      update campaign_contacts
      set
        contact_id = coalesce(contact_id, ${contactId}),
        fit_score = ${finalFitScore},
        priority_score = ${Math.round(finalFitScore * 0.8)},
        status = ${nextStatus}::campaign_contact_status,
        selected_contact_reason = ${nullableRowString(candidate.fit_reason) ?? "Aceptada desde resultados de Dom."},
        campaign_notes = ${feedback || "Guardada desde revisión de resultados de Dom."},
        updated_at = now()
      where campaign_id = ${String(candidate.campaign_id)}
        and company_id = ${companyId}
      returning id
    `;

    if (updatedCampaignRows.length === 0) {
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
          ${String(candidate.campaign_id)},
          ${companyId},
          ${contactId},
          ${finalFitScore},
          ${Math.round(finalFitScore * 0.8)},
          ${nextStatus}::campaign_contact_status,
          ${nullableRowString(candidate.fit_reason) ?? "Aceptada desde resultados de Dom."},
          ${feedback || "Guardada desde revisión de resultados de Dom."}
        )
      `;
    }

    for (const url of stringArrayFromRow(candidate.evidence_urls)) {
      await tx`
        insert into evidence_links (
          campaign_id,
          company_id,
          url,
          title,
          note,
          confidence
        )
        select
          ${String(candidate.campaign_id)},
          ${companyId},
          ${url},
          ${String(candidate.name)},
          ${nullableRowString(candidate.fit_reason) ?? "Evidencia sugerida por Dom."},
          0.7
        where not exists (
          select 1
          from evidence_links
          where company_id = ${companyId}
            and url = ${url}
        )
      `;
    }

    await tx`
      update dom_task_company_candidates
      set
        status = 'accepted',
        company_id = ${companyId},
        fit_score = ${finalFitScore},
        quality_rating = ${finalQualityRating},
        user_feedback = ${feedback || null},
        reviewed_at = now(),
        updated_at = now()
      where id = ${candidateId}
    `;

    return {
      kind: "accepted" as const,
      campaignId: String(candidate.campaign_id),
      campaignSlug: String(candidate.campaign_slug),
      companyId,
      contactId: contactId ?? "",
      name: String(candidate.name),
      status: nextStatus,
    };
  });

  if (result.kind === "missing") {
    return { ok: false, message: "No encontré ese resultado de Dom." };
  }

  revalidateProspectingPaths(result.campaignSlug);

  if (result.kind === "accepted") {
    if (result.contactId) {
      const taskId = await createVisibleDomTaskForCampaign({
        campaignId: result.campaignId,
        campaignSlug: result.campaignSlug,
        description: `Redactar mail inicial para ${result.name}.`,
        context: {
          source: "dom_candidate_accepted",
          requested_action: "draft_needed",
          desired_status: "needs_review",
          company_id: result.companyId,
          contact_id: result.contactId,
          company_name: result.name,
        },
      });
      await sendAgentEvent({
        event: "dom_task_created",
        campaignId: result.campaignId,
        companyId: result.companyId,
        contactId: result.contactId,
        data: {
          task_id: taskId,
          description: `Redactar mail inicial para ${result.name}.`,
          company_name: result.name,
          source: "dom_candidate_accepted",
          requested_action: "draft_needed",
          desired_status: "needs_review",
        },
        priority: "high",
        source: "dom_candidate_review",
      });
    } else {
      const taskId = await createVisibleDomTaskForCampaign({
        campaignId: result.campaignId,
        campaignSlug: result.campaignSlug,
        description: `Investigar contacto usable y redactar mail inicial para ${result.name}.`,
        context: {
          source: "dom_candidate_accepted_without_contact",
          company_id: result.companyId,
          company_name: result.name,
        },
      });
      await sendAgentEvent({
        event: "dom_task_created",
        campaignId: result.campaignId,
        companyId: result.companyId,
        data: {
          task_id: taskId,
          description: `Investigar contacto usable y redactar mail inicial para ${result.name}.`,
          source: "dom_candidate_accepted_without_contact",
        },
        priority: "high",
        source: "dom_candidate_review",
      });
    }
    return {
      ok: true,
      message:
        result.status === "ready_to_draft"
          ? `${result.name} guardada. Se creó tarea visible para que Dom redacte.`
          : `${result.name} guardada. Dom recibió tarea para buscar contacto y redactar.`,
    };
  }

  if (result.kind === "research") {
    const taskId = await createVisibleDomTaskForCampaign({
      campaignId: result.campaignId,
      campaignSlug: result.campaignSlug,
      description: `Reinvestigar ${result.name} con el feedback del usuario.`,
      context: {
        source: "dom_candidate_needs_more_research",
        candidate_id: candidateId,
        company_id: result.companyId,
        company_name: result.name,
        feedback: result.feedback,
      },
    });
    await sendAgentEvent({
      event: "dom_task_created",
      campaignId: result.campaignId,
      companyId: result.companyId || undefined,
      data: {
        task_id: taskId,
        description: `Reinvestigar ${result.name} con el feedback del usuario.`,
        feedback: result.feedback,
        source: "dom_candidate_needs_more_research",
      },
      priority: "normal",
      source: "dom_candidate_review",
    });
    return { ok: true, message: `${result.name}: Dom recibió pedido de reinvestigar.` };
  }

  return { ok: true, message: `${result.name} descartada de esta tarea.` };
}

export async function requestMoreResearchForCandidateAction(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  formData.set("intent", "research");
  return reviewDomCandidateAction(previousState, formData);
}

export async function updateCompanyQualityAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const companyId = readFormString(formData, "companyId");
  const qualityRating = boundedFormInt(formData, "qualityRating", 1, 5, null);
  const qualityNotes = readFormString(formData, "qualityNotes");
  const scope = readFormString(formData, "scope");

  if (!companyId || qualityRating === null) {
    return { ok: false, message: "Faltan datos para actualizar la calidad." };
  }

  const rows = await sql`
    update companies
    set
      quality_rating = ${qualityRating},
      quality_notes = ${qualityNotes || null},
      updated_at = now()
    where id = ${companyId}
    returning canonical_name
  `;

  if (!rows[0]) return { ok: false, message: "No encontré esa empresa." };

  revalidateProspectingPaths(scope || undefined);
  return {
    ok: true,
    message: `${String(rows[0].canonical_name)} actualizada.`,
  };
}

export async function createProjectAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const name = readFormString(formData, "name");
  const rawOrganization = readFormString(formData, "organization");
  const description = readFormString(formData, "description");
  const valueProposition = readFormString(formData, "valueProposition");
  const startsOn = nullIfEmpty(readFormString(formData, "startsOn"));
  const requestContextRefinement = readFormBoolean(
    formData,
    "requestContextRefinement",
  );
  const senderEmail = normalizeEmail(
    readFormString(formData, "senderEmail") || "sawitting@miuandes.cl",
  );
  const status = projectStatusSchema.safeParse(
    readFormString(formData, "status") || "active",
  );

  if (!name || !rawOrganization || !description || !valueProposition || !status.success) {
    return {
      ok: false,
      message: "Completa nombre, organización/contexto, descripción y necesidad del proyecto.",
    };
  }

  const baseSlug = slugifyProjectName(name);
  if (!baseSlug) {
    return { ok: false, message: "El nombre no permite crear un slug válido." };
  }

  const existingContextRows = await sql`
    select distinct organization
    from campaigns
    where nullif(trim(organization), '') is not null
    order by organization asc
  `;
  const organization = getExistingContextName(
    rawOrganization,
    existingContextRows.map((row) => ({ name: String(row.organization) })),
  );

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

    return { id: String(campaign.id), slug: String(campaign.slug) };
  });

  revalidateProspectingPaths(result.slug);
  await sendAgentEvent({
    event: "campaign_created",
    campaignId: result.id,
    data: {
      slug: result.slug,
      name,
      organization,
      description,
      value_proposition: valueProposition,
      starts_on: startsOn,
      default_sender: senderEmail,
    },
    priority: "normal",
    source: "project_form",
  });

  if (requestContextRefinement) {
    await createProjectContextRefinementTask({
      campaignId: result.id,
      campaignSlug: result.slug,
      source: "project_form",
      project: {
        name,
        organization,
        description,
        valueProposition,
        startsOn,
        endsOn: null,
      },
    });
  }

  return {
    ok: true,
    message: requestContextRefinement
      ? `Proyecto creado. También dejé una tarea para que la IA ordene el contexto.`
      : `Proyecto creado. Entra a /campaigns/${result.slug} para cargar empresas.`,
  };
}

export async function updateProjectAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const slug = readFormString(formData, "slug");
  const name = readFormString(formData, "name");
  const rawOrganization = readFormString(formData, "organization");
  const description = readFormString(formData, "description");
  const valueProposition = readFormString(formData, "valueProposition");
  const startsOn = nullIfEmpty(readFormString(formData, "startsOn"));
  const endsOn = nullIfEmpty(readFormString(formData, "endsOn"));
  const requestContextRefinement = readFormBoolean(
    formData,
    "requestContextRefinement",
  );
  const status = projectStatusSchema.safeParse(
    readFormString(formData, "status") || "active",
  );

  if (!slug || !name || !rawOrganization || !description || !valueProposition || !status.success) {
    return {
      ok: false,
      message: "Completa nombre, organización/contexto, descripción y necesidad del proyecto.",
    };
  }

  const existingContextRows = await sql`
    select distinct organization
    from campaigns
    where nullif(trim(organization), '') is not null
    order by organization asc
  `;
  const organization = getExistingContextName(
    rawOrganization,
    existingContextRows.map((row) => ({ name: String(row.organization) })),
  );

  const rows = await sql`
    update campaigns
    set
      name = ${name},
      organization = ${organization},
      description = ${description},
      value_proposition = ${valueProposition},
      starts_on = ${startsOn},
      ends_on = ${endsOn},
      status = ${status.data}::campaign_status,
      updated_at = now()
    where slug = ${slug}
    returning id::text as id, slug
  `;

  const campaign = rows[0];
  if (!campaign) return { ok: false, message: "No encontré ese proyecto." };

  revalidateProspectingPaths(String(campaign.slug));
  await sendAgentEvent({
    event: "campaign_updated",
    campaignId: String(campaign.id),
    data: {
      slug: campaign.slug,
      name,
      organization,
      description,
      value_proposition: valueProposition,
      starts_on: startsOn,
      ends_on: endsOn,
      status: status.data,
    },
    priority: "normal",
    source: "project_edit_form",
  });

  if (requestContextRefinement) {
    await createProjectContextRefinementTask({
      campaignId: String(campaign.id),
      campaignSlug: String(campaign.slug),
      source: "project_edit_form",
      project: {
        name,
        organization,
        description,
        valueProposition,
        startsOn,
        endsOn,
      },
    });
  }

  return {
    ok: true,
    message: requestContextRefinement
      ? "Proyecto actualizado. También dejé una tarea para que la IA proponga una versión ordenada."
      : "Proyecto actualizado. Dom usará este contexto en próximas tareas.",
  };
}

export async function applyProjectContextSuggestionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const taskId = readFormString(formData, "taskId");
  const campaignSlug = readFormString(formData, "campaignSlug");
  const name = nullIfEmpty(readFormString(formData, "name"));
  const rawOrganization = nullIfEmpty(readFormString(formData, "organization"));
  const description = nullIfEmpty(readFormString(formData, "description"));
  const valueProposition = nullIfEmpty(readFormString(formData, "valueProposition"));

  if (!taskId || !campaignSlug || (!description && !valueProposition)) {
    return {
      ok: false,
      message: "Falta la propuesta estructurada para aplicar el contexto.",
    };
  }

  let organization = rawOrganization;
  if (rawOrganization) {
    const existingContextRows = await sql`
      select distinct organization
      from campaigns
      where nullif(trim(organization), '') is not null
      order by organization asc
    `;
    organization = getExistingContextName(
      rawOrganization,
      existingContextRows.map((row) => ({ name: String(row.organization) })),
    );
  }

  const rows = await sql`
    update campaigns c
    set
      name = coalesce(${name}, c.name),
      organization = coalesce(${organization}, c.organization),
      description = coalesce(${description}, c.description),
      value_proposition = coalesce(${valueProposition}, c.value_proposition),
      updated_at = now()
    from dom_tasks dt
    where c.slug = ${campaignSlug}
      and dt.id = ${taskId}
      and dt.campaign_id = c.id
    returning c.id::text as id, c.slug, c.name, c.organization, c.description, c.value_proposition
  `;

  const campaign = rows[0];
  if (!campaign) {
    return { ok: false, message: "No encontré esa propuesta para este proyecto." };
  }

  await sql`
    update dom_tasks
    set
      progress_message = 'Propuesta de contexto aplicada al proyecto.',
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        project_context_review: {
          status: "accepted",
          applied_at: new Date().toISOString(),
          applied_fields: {
            name: Boolean(name),
            organization: Boolean(organization),
            description: Boolean(description),
            value_proposition: Boolean(valueProposition),
          },
        },
      })}::jsonb,
      updated_at = now()
    where id = ${taskId}
  `;

  revalidateProspectingPaths(campaignSlug);
  await sendAgentEvent({
    event: "campaign_updated",
    campaignId: String(campaign.id),
    data: {
      slug: campaign.slug,
      name: campaign.name,
      organization: campaign.organization,
      description: campaign.description,
      value_proposition: campaign.value_proposition,
      source: "project_context_review",
      task_id: taskId,
    },
    priority: "normal",
    source: "project_context_review",
  });

  return {
    ok: true,
    message: "Contexto aplicado. Dom/GPT usará esta versión en futuras tareas.",
  };
}

export async function requestProjectContextRevisionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sql = getPostgresClient();
  if (!sql) return { ok: false, message: initialError };

  const taskId = readFormString(formData, "taskId");
  const campaignSlug = readFormString(formData, "campaignSlug");
  const feedback = readFormString(formData, "feedback");

  if (!taskId || !campaignSlug || feedback.length < 4) {
    return {
      ok: false,
      message: "Escribe feedback concreto para pedir otra versión.",
    };
  }

  const rows = await sql`
    select
      c.id::text as campaign_id,
      c.slug,
      c.name,
      c.organization,
      c.description,
      c.value_proposition,
      c.starts_on,
      c.ends_on,
      dt.result
    from dom_tasks dt
    join campaigns c on c.id = dt.campaign_id
    where dt.id = ${taskId}
      and c.slug = ${campaignSlug}
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return { ok: false, message: "No encontré esa propuesta para este proyecto." };
  }

  await sql`
    update dom_tasks
    set
      progress_message = 'Se pidió una nueva versión con feedback.',
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        project_context_review: {
          status: "revision_requested",
          feedback,
          requested_at: new Date().toISOString(),
        },
      })}::jsonb,
      updated_at = now()
    where id = ${taskId}
  `;

  const revisionTaskId = await createProjectContextRefinementTask({
    campaignId: String(row.campaign_id),
    campaignSlug: String(row.slug),
    source: "project_context_feedback",
    feedback,
    previousTaskId: taskId,
    previousProposal: nullableRowString(row.result),
    project: {
      name: String(row.name),
      organization: String(row.organization),
      description: nullableRowString(row.description) ?? "",
      valueProposition: nullableRowString(row.value_proposition) ?? "",
      startsOn: nullableRowString(row.starts_on),
      endsOn: nullableRowString(row.ends_on),
    },
  });

  if (!revisionTaskId) {
    return {
      ok: false,
      message: "No pude crear la nueva tarea de contexto. Intenta de nuevo.",
    };
  }

  revalidateProspectingPaths(campaignSlug);

  return {
    ok: true,
    message: "Listo. Se creó una nueva tarea para rehacer la propuesta con tu feedback.",
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
  const feedback = readFormString(formData, "feedback");
  const intent = replyIntentSchema.safeParse(readFormString(formData, "intent"));

  if (!replyId || !intent.success) {
    return { ok: false, message: "Faltan datos para actualizar la respuesta." };
  }

  if (intent.data === "rejected" && feedback.length < 4) {
    return {
      ok: false,
      message: "Escribe feedback concreto para pedir una nueva respuesta.",
    };
  }

  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select
        m.id,
        m.thread_id,
        m.campaign_id::text as campaign_id,
        c.slug as campaign_slug,
        m.company_id::text as company_id,
        m.contact_id::text as contact_id,
        m.sender_account_id,
        coalesce(m.subject_final, m.subject_draft, '(sin asunto)') as subject,
        coalesce(m.body_draft, '') as reply_body,
        coalesce(m.body_final, '') as current_draft,
        co.canonical_name as company_name,
        ct.full_name as contact_name,
        ct.email::text as contact_email,
        coalesce(m.gmail_thread_id, t.gmail_thread_id) as gmail_thread_id,
        m.status::text as status
      from messages m
      join campaigns c on c.id = m.campaign_id
      left join companies co on co.id = m.company_id
      left join contacts ct on ct.id = m.contact_id
      left join threads t on t.id = m.thread_id
      where m.id = ${replyId}
        and m.kind = 'inbound_reply'
      limit 1
    `;
    const reply = rows[0];

    if (!reply) return { kind: "missing" as const };
    if (reply.status === "sent") return { kind: "sent" as const };

    const nextStatus =
      intent.data === "save"
        ? reply.status
        : intent.data === "no_reply"
          ? "rejected"
          : intent.data;
    const futureNote = intent.data === "no_reply"
      ? "No responder: marcado manualmente como mensaje automatico o sin accion necesaria."
      : intent.data === "rejected"
        ? `Respuesta rechazada para nueva redaccion. Feedback: ${feedback}`
        : null;

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
        future_note = case
          when ${futureNote}::text is null then future_note
          else concat_ws(E'\n', nullif(future_note, ''), ${futureNote}::text)
        end,
        updated_at = now()
      where id = ${replyId}
    `;

    if (intent.data !== "approved") {
      return {
        kind: intent.data,
        campaignId: String(reply.campaign_id),
        companyId: String(reply.company_id ?? ""),
        contactId: String(reply.contact_id ?? ""),
        campaignSlug: String(reply.campaign_slug),
        companyName: String(reply.company_name ?? ""),
        contactName: String(reply.contact_name ?? ""),
        contactEmail: String(reply.contact_email ?? ""),
        subject: String(reply.subject ?? ""),
        replyBody: String(reply.reply_body ?? ""),
        currentDraft: String(reply.current_draft ?? ""),
        feedback,
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
      campaignId: String(reply.campaign_id),
      companyId: String(reply.company_id ?? ""),
      contactId: String(reply.contact_id ?? ""),
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

  if (result.kind === "rejected") {
    const taskDescription = `Redactar nueva respuesta para ${result.companyName || result.subject}.`;
    const taskContext = {
      source: "reply_rejection",
      task_type: "redraft_reply",
      requested_action: "draft_needed",
      redraft_target: "reply_review_redrafts",
      source_message_id: replyId,
      message_id: replyId,
      reply_id: replyId,
      company_id: result.companyId,
      contact_id: result.contactId,
      contact_name: result.contactName,
      contact_email: result.contactEmail,
      subject: result.subject,
      inbound_reply_body: result.replyBody,
      rejected_draft: result.currentDraft,
      feedback: result.feedback,
      instructions: [
        "Redactar una nueva respuesta para este inbound reply usando el feedback del usuario.",
        "No enviar el mail ni crear un outbound_reply aprobado.",
        "Responder con una action top-level: { type: 'update_reply_draft', source_message_id, body }.",
        "La action update_reply_draft debe dejar el inbound_reply en status needs_review con body_final actualizado.",
      ],
    };
    const taskId = await createVisibleDomTaskForCampaign({
      campaignId: result.campaignId,
      campaignSlug,
      description: taskDescription,
      context: taskContext,
    });

    await sendAgentEvent({
      event: "draft_needed",
      campaignId: result.campaignId,
      companyId: result.companyId,
      contactId: result.contactId,
      messageId: replyId,
      data: {
        task_id: taskId,
        task_type: "redraft_reply",
        source: "reply_rejection",
        feedback: result.feedback,
        subject: result.subject,
      },
      priority: "high",
      source: "reply_review",
    });

    await sendAgentEvent({
      event: "dom_task_created",
      campaignId: result.campaignId,
      companyId: result.companyId,
      contactId: result.contactId,
      messageId: replyId,
      data: {
        task_id: taskId,
        task_type: "redraft_reply",
        description: taskDescription,
        source_message_id: replyId,
        source: "reply_rejection",
        requested_action: "draft_needed",
        feedback: result.feedback,
        redraft_target: "reply_review_redrafts",
      },
      priority: "high",
      source: "reply_review",
    });
  }

  return {
    ok: true,
    message:
      intent.data === "save"
        ? "Draft guardado."
        : intent.data === "approved"
          ? "Respuesta aprobada. La dejé en Mails > Aprobados para enviar y saldrá en el mismo hilo."
          : intent.data === "no_reply"
            ? "Respuesta marcada como no responder."
            : "Respuesta rechazada. Se pidió una nueva redacción con tu feedback.",
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

  const result = await sql.begin(async (tx) => {
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

    return {
      campaignId: String(campaignId),
      companyId: String(companyId),
      contactId: String(contactId),
    };
  });

  revalidateProspectingPaths(campaignSlug);
  await sendAgentEvent({
    event: "lead_created",
    campaignId: result.campaignId,
    companyId: result.companyId,
    contactId: result.contactId,
    data: {
      company_name: companyName || domain || "Empresa sin nombre",
      contact_name: fullName,
      email,
      source,
      is_decision_maker_hint: isDecisionMaker,
      verification_status: "unverified",
    },
    priority: "normal",
    source: "new_lead_form",
  });
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

function readFormBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

async function createProjectContextRefinementTask({
  campaignId,
  campaignSlug,
  feedback,
  previousProposal,
  previousTaskId,
  project,
  source,
}: {
  campaignId: string;
  campaignSlug: string;
  feedback?: string;
  previousProposal?: string | null;
  previousTaskId?: string;
  project: {
    name: string;
    organization: string;
    description: string;
    valueProposition: string;
    startsOn: string | null;
    endsOn: string | null;
  };
  source: string;
}) {
  const description = feedback
    ? `Reordenar contexto del proyecto "${project.name}" con feedback del usuario.`
    : `Ordenar contexto del proyecto "${project.name}" sin inventar informacion.`;
  const context = {
    source,
    task_type: PROJECT_CONTEXT_REFINEMENT_TASK_TYPE,
    requested_action: "refine_project_context",
    feedback: feedback ?? null,
    previous_task_id: previousTaskId ?? null,
    previous_proposal: previousProposal ?? null,
    raw_project: {
      name: project.name,
      organization: project.organization,
      description: project.description,
      value_proposition: project.valueProposition,
      starts_on: project.startsOn,
      ends_on: project.endsOn,
    },
    guardrails: [
      "Ordenar, sintetizar y profesionalizar solo con la informacion entregada.",
      "No inventar fechas, cifras, beneficios, marcas, compromisos ni necesidades.",
      "Si falta informacion importante, incluirla en missing_info en vez de inventarla.",
      "Mantener un tono claro, concreto y usable para investigacion y redaccion de mails.",
    ],
    expected_output: {
      format: "json",
      fields: {
        name: "string opcional, solo si mejora claridad sin cambiar el slug",
        organization: "string opcional",
        description: "string profesional para Que es el proyecto",
        value_proposition: "string profesional para Que se necesita conseguir",
        missing_info: "string[] con dudas o informacion faltante",
        notes: "string breve explicando cambios de orden/redaccion",
      },
    },
  };

  const taskId = await createVisibleDomTaskForCampaign({
    campaignId,
    campaignSlug,
    description,
    context,
  });

  if (!taskId) return "";

  await sendAgentEvent({
    event: "dom_task_created",
    campaignId,
    data: {
      task_id: taskId,
      task_type: PROJECT_CONTEXT_REFINEMENT_TASK_TYPE,
      description,
      source,
      project: context.raw_project,
      feedback: feedback ?? null,
      previous_task_id: previousTaskId ?? null,
      expected_output: context.expected_output,
      guardrails: context.guardrails,
    },
    priority: "normal",
    source,
  });

  return taskId;
}

async function createVisibleDomTaskForCampaign({
  campaignId,
  campaignSlug,
  context,
  description,
}: {
  campaignId: string;
  campaignSlug: string;
  context: Record<string, unknown>;
  description: string;
}) {
  const sql = getPostgresClient();
  if (!sql) return "";

  const campaignContext = await getDomCampaignContextBySlug(campaignSlug);
  const thread = campaignContext
    ? await ensureDomChatThread(campaignContext.dbId, campaignContext.name)
    : null;

  const rows = await sql`
    insert into dom_tasks (
      campaign_id,
      description,
      status,
      created_by,
      context,
      chat_thread_id
    ) values (
      ${campaignId},
      ${description},
      'pending',
      'system',
      ${sql.json(context as Parameters<typeof sql.json>[0])},
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
        'system',
        ${`Tarea automática para Dom: ${description}`},
        ${sql.json({
          event: "dom_task_created",
          taskId: rows[0]?.id ?? null,
          source: nullableRowString(context.source) ?? "system",
        })}
      )
    `;
  }

  return rows[0]?.id ? String(rows[0].id) : "";
}

async function insertSuggestedCandidateContacts({
  companyId,
  contacts,
  tx,
}: {
  companyId: string;
  contacts: unknown[];
  // postgres.js transaction tags have helper overloads stricter than this use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
}) {
  const contactIds: string[] = [];

  for (const contact of contacts) {
    const row = contact && typeof contact === "object"
      ? (contact as Record<string, unknown>)
      : {};
    const name = nullableRowString(row.name);
    const email = normalizeEmail(nullableRowString(row.email));
    if (!name && !email) continue;

    const fullName = name ?? email ?? "Contacto sugerido";
    const confidence = Math.min(
      1,
      Math.max(0, Number(row.confidence ?? 0.5) || 0.5),
    );

    const rows = email
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
            ${nullableRowString(row.role)},
            ${nullableRowString(row.role) ? "Por cargo" : "Por clasificar"},
            ${email},
            ${nullableRowString(row.source) ?? "dom_candidate"},
            ${confidence},
            'unverified',
            false,
            'Contacto sugerido por Dom; validar antes de asumir respuesta.'
          )
          on conflict (email) do update
          set
            company_id = excluded.company_id,
            role = coalesce(excluded.role, contacts.role),
            source = coalesce(excluded.source, contacts.source),
            updated_at = now()
          returning id::text as id
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
            ${nullableRowString(row.role)},
            ${nullableRowString(row.role) ? "Por cargo" : "Por clasificar"},
            ${nullableRowString(row.source) ?? "dom_candidate"},
            ${confidence},
            'unverified',
            false,
            'Contacto sugerido por Dom; validar antes de asumir respuesta.'
          )
          returning id::text as id
        `;

    if (rows[0]?.id) contactIds.push(String(rows[0].id));
  }

  return contactIds;
}

function boundedFormInt(
  formData: FormData,
  key: string,
  min: number,
  max: number,
  fallback: number | null,
) {
  const value = readFormString(formData, key);
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function nullableRowString(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text || null;
}

function numberFromRow(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function arrayFromRow(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringArrayFromRow(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => nullableRowString(item))
    .filter((item): item is string => Boolean(item));
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
