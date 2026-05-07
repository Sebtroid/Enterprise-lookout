"use client";

import {
  useCallback,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Save,
  Send,
  UserRound,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  markMessageSentManuallyAction,
  rejectOutboundMessageAction,
  updateOutboundMessageAction,
  type ActionState,
} from "@/features/prospecting/actions";
import type {
  AppMessage,
  AppCompany,
  AppContact,
  AppCampaign,
  AppSender,
} from "@/lib/prospecting/demo-data";
import {
  buildOutboundEnvelope,
  outboundRejectionReasons,
  splitOutboundReviewQueue,
  type OutboundRejectionReason,
} from "@/lib/prospecting/review";
import { shouldAutoSendAfterApproval } from "@/lib/prospecting/sending";

type ReviewMessage = AppMessage & {
  localStatus: AppMessage["status"];
  localBody: string;
};

const initialActionState: ActionState = { ok: false, message: "" };

export function OutboundReview({
  campaigns,
  companies,
  contacts,
  messages,
  senders,
  gmailConnectedEmails = [],
}: {
  campaigns: AppCampaign[];
  companies: AppCompany[];
  contacts: AppContact[];
  messages: AppMessage[];
  scope: string;
  senders: AppSender[];
  gmailConnectedEmails?: string[];
}) {
  const router = useRouter();
  const [reviewState, reviewAction, isReviewPending] = useActionState(
    updateOutboundMessageAction,
    initialActionState,
  );
  const [rejectState, rejectAction, isRejectPending] = useActionState(
    rejectOutboundMessageAction,
    initialActionState,
  );
  const [manualSentState, manualSentAction, isManualSentPending] =
    useActionState(markMessageSentManuallyAction, initialActionState);
  const autoSendInFlightRef = useRef<string | null>(null);
  const autoSendAfterApproveIdRef = useRef<string | null>(null);
  const [sendingGmailId, setSendingGmailId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, OutboundRejectionReason>
  >({});
  const [items, setItems] = useState<ReviewMessage[]>(
    messages.map((message) => ({
      ...message,
      localStatus: message.status,
      localBody: message.body,
    })),
  );

  const queues = useMemo(() => splitOutboundReviewQueue(items), [items]);

  const sendWithGmail = useCallback(async (messageId: string) => {
    setSendingGmailId(messageId);
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (data.ok) {
        setItems((current) =>
          current.map((item) =>
            item.id === messageId ? { ...item, localStatus: "sent" } : item,
          ),
        );
        return true;
      } else {
        alert(`Error enviando mail: ${data.error}`);
        return false;
      }
    } catch {
      alert("Error de red al enviar mail.");
      return false;
    } finally {
      setSendingGmailId(null);
    }
  }, []);

  useEffect(() => {
    const autoSendAfterApproveId = autoSendAfterApproveIdRef.current;

    if (reviewState.ok && autoSendAfterApproveId) {
      const messageId = autoSendAfterApproveId;
      if (autoSendInFlightRef.current === messageId) return;

      autoSendInFlightRef.current = messageId;
      autoSendAfterApproveIdRef.current = null;
      void sendWithGmail(messageId).finally(() => {
        autoSendInFlightRef.current = null;
        router.refresh();
      });
      return;
    }

    if (reviewState.message && !reviewState.ok) {
      autoSendAfterApproveIdRef.current = null;
    }

    if (
      (reviewState.message || rejectState.message || manualSentState.message) &&
      !autoSendInFlightRef.current
    ) {
      router.refresh();
    }
  }, [
    manualSentState,
    rejectState,
    reviewState,
    router,
    sendWithGmail,
  ]);

  function updateStatus(id: string, status: AppMessage["status"]) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, localStatus: status } : item,
      ),
    );
  }

  function updateBody(id: string, body: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, localBody: body } : item,
      ),
    );
  }

  function updateRejectionReason(
    id: string,
    reason: OutboundRejectionReason,
  ) {
    setRejectionReasons((current) => ({ ...current, [id]: reason }));
  }

  function renderReviewCard(message: ReviewMessage, variant: "pending" | "redraft") {
    const company = companies.find((item) => item.id === message.companyId);
    const contact = contacts.find((item) => item.id === message.contactId);
    const campaign = campaigns.find((item) => item.id === message.campaignId);
    const sender = senders.find((item) => item.id === message.senderId);
    const rejectionReason = rejectionReasons[message.id] ?? "bad_copy";
    const envelope = buildOutboundEnvelope({ company, contact, sender });
    const autoSendsWithGmail = shouldAutoSendAfterApproval({
      connectedGmailEmails: gmailConnectedEmails,
      senderAccountType: sender?.accountType,
      senderEmail: sender?.email,
      senderStatus: sender?.status,
    });

    return (
      <form
        action={reviewAction}
        key={message.id}
        className={
          variant === "redraft"
            ? "rounded-lg border border-cyan-200 bg-card p-4 shadow-sm"
            : "rounded-lg border border-border bg-card p-4 shadow-sm"
        }
      >
        <input type="hidden" name="messageId" value={message.id} />
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{message.subject}</h2>
              <StatusBadge status={message.localStatus} />
              {variant === "redraft" ? (
                <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700">
                  Redactado de nuevo
                </span>
              ) : null}
              {message.kind === "outbound_reply" ? (
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  Respuesta en hilo
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRejectingId((current) =>
                  current === message.id ? null : message.id,
                )
              }
            >
              <X className="size-4" />
              Rechazar
            </Button>
            <Button
              disabled={isReviewPending}
              name="intent"
              type="submit"
              value="approved"
              size="sm"
              onClick={() => {
                updateStatus(message.id, "approved");
                autoSendAfterApproveIdRef.current = autoSendsWithGmail
                  ? message.id
                  : null;
              }}
            >
              <Check className="size-4" />
              {autoSendsWithGmail ? "Aprobar y enviar" : "Aprobar"}
            </Button>
          </div>
        </div>

        <MailEnvelope
          accountType={sender?.accountType}
          companyLabel={envelope.companyLabel}
          contactRole={contact?.role}
          recipientLabel={envelope.recipientLabel}
          projectLabel={formatProjectDetail(campaign)}
          senderLabel={envelope.senderLabel}
        />

        <Textarea
          className="mt-4 min-h-64 font-mono text-sm"
          name="body"
          value={message.localBody}
          onChange={(event) => updateBody(message.id, event.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button
            disabled={isReviewPending}
            name="intent"
            size="sm"
            type="submit"
            value="save"
            variant="outline"
          >
            <Save className="size-4" />
            Guardar cambios
          </Button>
        </div>

        {rejectingId === message.id ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
              <label className="space-y-1">
                <span className="font-medium text-amber-950">
                  Razón de rechazo
                </span>
                <select
                  className="h-9 w-full rounded-lg border border-amber-200 bg-background px-2 text-sm"
                  name="rejectionReason"
                  value={rejectionReason}
                  onChange={(event) =>
                    updateRejectionReason(
                      message.id,
                      event.target.value as OutboundRejectionReason,
                    )
                  }
                >
                  {Object.entries(outboundRejectionReasons).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-amber-950">
                  Feedback para la nueva redacción
                </span>
                <Textarea
                  className="min-h-24 bg-background"
                  name="rejectionComment"
                  placeholder={
                    rejectionReason === "bad_copy"
                      ? "Ej: más corto, menos genérico, pedir una reunión de 15 min, mencionar impacto social real..."
                      : "Opcional: explica por qué esta empresa no calza."
                  }
                  required={rejectionReason === "bad_copy"}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="flex items-start gap-2 text-amber-950">
                <input
                  className="mt-1"
                  name="rememberFeedback"
                  type="checkbox"
                />
                <span>Recordar este feedback para futuras redacciones</span>
              </label>
              <Button
                disabled={isRejectPending}
                formAction={rejectAction}
                size="sm"
                type="submit"
                variant="outline"
                onClick={() => {
                  updateStatus(message.id, "rejected");
                  setRejectingId(null);
                }}
              >
                <X className="size-4" />
                {rejectionReason === "bad_copy"
                  ? "Rechazar y redactar de nuevo"
                  : "Rechazar y cerrar contacto"}
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    );
  }

  function renderRejectedCard(
    message: ReviewMessage,
    variant: "redrafting" | "rejected",
  ) {
    const company = companies.find((item) => item.id === message.companyId);
    const contact = contacts.find((item) => item.id === message.contactId);
    const campaign = campaigns.find((item) => item.id === message.campaignId);
    const sender = senders.find((item) => item.id === message.senderId);
    const envelope = buildOutboundEnvelope({ company, contact, sender });

    return (
      <article
        key={message.id}
        className={
          variant === "redrafting"
            ? "rounded-lg border border-amber-200 bg-card p-4 shadow-sm"
            : "rounded-lg border border-border bg-card p-4 shadow-sm opacity-80"
        }
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{message.subject}</h2>
              <StatusBadge status={message.localStatus} />
              {variant === "redrafting" ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  <Loader2 className="size-3 animate-spin" />
                  Redactando nueva versión
                </span>
              ) : null}
            </div>
            {message.futureNote ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {message.futureNote}
              </p>
            ) : null}
          </div>
        </div>

        <MailEnvelope
          accountType={sender?.accountType}
          companyLabel={envelope.companyLabel}
          contactRole={contact?.role}
          recipientLabel={envelope.recipientLabel}
          projectLabel={formatProjectDetail(campaign)}
          senderLabel={envelope.senderLabel}
        />

        <p className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {message.localBody}
        </p>
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-5">
        <QueueSummary
          label="Pendientes"
          value={queues.pending.length}
          description="Editar, aprobar o rechazar con feedback."
        />
        <QueueSummary
          label="Redactando"
          value={queues.redrafting.length}
          description="Rechazados esperando nueva versión de Dom."
        />
        <QueueSummary
          label="Redacciones nuevas"
          value={queues.redrafts.length}
          description="Nuevos borradores hechos desde feedback."
        />
        <QueueSummary
          label="Aprobados sin enviar"
          value={queues.approved.length}
          description="Fallback si Gmail no está conectado o falló."
        />
        <QueueSummary
          label="Rechazados"
          value={queues.rejected.length}
          description="Descartados o cerrados sin nueva redacción."
        />
      </div>

      {reviewState.message ? <ActionMessage state={reviewState} /> : null}
      {rejectState.message ? <ActionMessage state={rejectState} /> : null}
      {manualSentState.message ? (
        <ActionMessage state={manualSentState} />
      ) : null}

      <section className="space-y-3">
        <div>
          <div className="text-sm font-medium">Pendientes de revisión</div>
          <div className="text-sm text-muted-foreground">
            Si el remitente tiene Gmail conectado, aprobar envía al tiro. Si no,
            queda como aprobado sin enviar.
          </div>
        </div>

        {queues.pending.length ? null : (
          <EmptyQueue message="No hay mails pendientes por revisar." />
        )}

        {queues.pending.map((message) => renderReviewCard(message, "pending"))}
      </section>

      <section className="space-y-3">
        <div>
          <div className="text-sm font-medium">Redactando nueva versión</div>
          <div className="text-sm text-muted-foreground">
            Estos mails ya salieron de pendientes. Dom tiene el feedback y está
            pendiente de crear una nueva redacción.
          </div>
        </div>

        {queues.redrafting.length ? null : (
          <EmptyQueue message="No hay mails esperando nueva redacción de Dom." />
        )}

        {queues.redrafting.map((message) =>
          renderRejectedCard(message, "redrafting"),
        )}
      </section>

      <section className="space-y-3">
        <div>
          <div className="text-sm font-medium">
            Redacciones nuevas por feedback
          </div>
          <div className="text-sm text-muted-foreground">
            Estos son nuevos borradores creados después de rechazar un mail.
          </div>
        </div>

        {queues.redrafts.length ? null : (
          <EmptyQueue message="No hay redacciones nuevas por feedback." />
        )}

        {queues.redrafts.map((message) => renderReviewCard(message, "redraft"))}
      </section>

      <section className="space-y-3">
        <div>
          <div className="text-sm font-medium">Aprobados sin enviar</div>
          <div className="text-sm text-muted-foreground">
            Solo aparecen acá cuando no se enviaron automáticamente: Gmail no
            está conectado, el remitente no es Gmail o falló el envío.
          </div>
        </div>

        {queues.approved.length ? null : (
          <EmptyQueue message="No hay mails aprobados para enviar." />
        )}

        {queues.approved.map((message) => {
          const company = companies.find((item) => item.id === message.companyId);
          const contact = contacts.find((item) => item.id === message.contactId);
          const campaign = campaigns.find((item) => item.id === message.campaignId);
          const sender = senders.find((item) => item.id === message.senderId);
          const envelope = buildOutboundEnvelope({ company, contact, sender });
          const composeHref =
            contact?.email && sender
              ? buildComposeHref({
                  accountType: sender.accountType,
                  body: message.localBody,
                  senderEmail: sender.email,
                  subject: message.subject,
                  to: contact.email,
                })
              : null;

          const hasGmail = shouldAutoSendAfterApproval({
            connectedGmailEmails: gmailConnectedEmails,
            senderAccountType: sender?.accountType,
            senderEmail: sender?.email,
            senderStatus: sender?.status,
          });

          return (
            <form
              key={message.id}
              className="rounded-lg border border-emerald-200 bg-card p-4 shadow-sm"
            >
              <input type="hidden" name="messageId" value={message.id} />
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{message.subject}</h2>
                    <StatusBadge status={message.localStatus} />
                    {message.kind === "outbound_reply" ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        Mismo hilo
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasGmail ? (
                    <Button
                      disabled={sendingGmailId === message.id}
                      size="sm"
                      type="button"
                      onClick={() => void sendWithGmail(message.id)}
                    >
                      {sendingGmailId === message.id ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 size-4" />
                      )}
                      {sendingGmailId === message.id ? "Enviando..." : "Enviar con Gmail"}
                    </Button>
                  ) : composeHref ? (
                    <a
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                      href={composeHref}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="size-4" />
                      {sender?.accountType === "outlook"
                        ? "Abrir en Outlook"
                        : "Abrir compose"}
                    </a>
                  ) : null}
                  <Button
                    disabled={isManualSentPending}
                    formAction={manualSentAction}
                    size="sm"
                    type="submit"
                    variant="outline"
                    onClick={() => updateStatus(message.id, "sent")}
                  >
                    <Send className="size-4" />
                    Marcar enviado
                  </Button>
                </div>
              </div>
              <MailEnvelope
                accountType={sender?.accountType}
                companyLabel={envelope.companyLabel}
                contactRole={contact?.role}
                recipientLabel={envelope.recipientLabel}
                projectLabel={formatProjectDetail(campaign)}
                senderLabel={envelope.senderLabel}
              />
              <p className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                {message.localBody}
              </p>
            </form>
          );
        })}
      </section>

      <section className="space-y-3">
        <div>
          <div className="text-sm font-medium">Rechazados</div>
          <div className="text-sm text-muted-foreground">
            Mails descartados o cerrados. No vuelven a pendientes salvo que se
            cree una nueva redacción.
          </div>
        </div>

        {queues.rejected.length ? null : (
          <EmptyQueue message="No hay mails rechazados cerrados." />
        )}

        {queues.rejected.map((message) =>
          renderRejectedCard(message, "rejected"),
        )}
      </section>
    </div>
  );
}

function MailEnvelope({
  accountType,
  companyLabel,
  contactRole,
  projectLabel,
  recipientLabel,
  senderLabel,
}: {
  accountType?: AppSender["accountType"];
  companyLabel: string;
  contactRole?: string;
  projectLabel: string;
  recipientLabel: string;
  senderLabel: string;
}) {
  return (
    <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm md:grid-cols-2">
      <EnvelopeField
        icon={<UserRound className="size-4" />}
        label="Para"
        value={recipientLabel}
        detail={contactRole}
      />
      <EnvelopeField
        icon={<Mail className="size-4" />}
        label="Desde"
        value={senderLabel}
        detail={projectLabel}
        suffix={accountType ? formatSenderProvider(accountType) : undefined}
      />
      <EnvelopeField
        icon={<Building2 className="size-4" />}
        label="Empresa"
        value={companyLabel}
      />
    </div>
  );
}

function formatProjectDetail(campaign: AppCampaign | undefined) {
  if (!campaign) return "Proyecto sin definir";
  return `${campaign.name} · ${campaign.organization}`;
}

function EnvelopeField({
  detail,
  icon,
  label,
  suffix,
  value,
}: {
  detail?: string;
  icon: ReactNode;
  label: string;
  suffix?: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        <span className="break-all font-medium text-foreground">{value}</span>
        {suffix ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      {detail ? (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function QueueSummary({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function EmptyQueue({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function formatSenderProvider(provider: AppSender["accountType"]) {
  const labels: Record<AppSender["accountType"], string> = {
    gmail: "Gmail",
    outlook: "Outlook",
    smtp: "SMTP",
    manual: "Manual",
  };

  return labels[provider] ?? provider;
}

function buildComposeHref({
  accountType,
  body,
  senderEmail,
  subject,
  to,
}: {
  accountType: AppSender["accountType"];
  body: string;
  senderEmail: string;
  subject: string;
  to: string;
}) {
  const encodedTo = encodeURIComponent(to);
  const encodedSender = encodeURIComponent(senderEmail);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  if (accountType === "outlook") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`;
  }

  if (accountType === "gmail") {
    return `https://mail.google.com/mail/?authuser=${encodedSender}&view=cm&fs=1&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`;
  }

  return `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`;
}

function ActionMessage({ state }: { state: ActionState }) {
  return (
    <div
      className={
        state.ok
          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
      }
    >
      {state.message}
    </div>
  );
}
