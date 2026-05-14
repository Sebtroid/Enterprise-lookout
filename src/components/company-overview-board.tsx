"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Mail,
  MessageSquareText,
  Search,
  Send,
  Users,
} from "lucide-react";

import { getStatusLabel, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createCompanyOverviewDomTaskAction,
  type ActionState,
} from "@/features/prospecting/actions";
import {
  buildCompanyExplorerRecords,
  filterCompanyExplorerRecords,
  type CompanyExplorerRecord,
  type CompanyExplorerStatus,
} from "@/lib/prospecting/company-intelligence";
import type {
  AppCampaign,
  AppCompany,
  AppContact,
  AppMessage,
  AppReply,
} from "@/lib/prospecting/demo-data";

const initialActionState: ActionState = { ok: false, message: "" };
const overviewCompanyStatuses = new Set<CompanyExplorerStatus>([
  "approved_to_send",
  "sent",
  "replied",
  "followup_due",
]);

export function CompanyOverviewBoard({
  campaign,
  companies,
  contacts,
  messages,
  now,
  replies,
  scope,
}: {
  campaign: AppCampaign | null;
  companies: AppCompany[];
  contacts: AppContact[];
  messages: AppMessage[];
  now: string;
  replies: AppReply[];
  scope: string;
}) {
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const records = useMemo(
    () =>
      buildCompanyExplorerRecords({
        scope,
        allCompanies: companies,
        campaignCompanies: companies,
        contacts,
        messages,
        replies,
        now,
      }),
    [companies, contacts, messages, now, replies, scope],
  );
  const overviewRecords = useMemo(
    () => records.filter(isApprovedOrContactedRecord),
    [records],
  );
  const filteredRecords = useMemo(
    () =>
      filterCompanyExplorerRecords(overviewRecords, {
        query,
        membership: "all",
        status: "all",
      }),
    [overviewRecords, query],
  );
  const visibleContactCount = useMemo(() => {
    const ids = new Set<string>();
    for (const record of overviewRecords) {
      for (const contact of record.contacts) {
        ids.add(contact.id);
      }
    }
    return ids.size;
  }, [overviewRecords]);
  const sentCount = useMemo(
    () =>
      overviewRecords.reduce(
        (count, record) =>
          count +
          getVisibleMessages(record.messages).filter(
            (message) => message.status === "sent",
          ).length,
        0,
      ),
    [overviewRecords],
  );

  function toggleCompany(companyId: string) {
    setExpandedCompanyIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar empresa, contacto, dominio, mail, respuesta o nota..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-3 gap-2 text-sm md:min-w-[28rem]">
          <OverviewMetric label="Empresas" value={overviewRecords.length} />
          <OverviewMetric label="Contactos" value={visibleContactCount} />
          <OverviewMetric label="Mails enviados" value={sentCount} />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(18rem,1.8fr)_12rem_12rem_10rem_auto] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <div>Empresa</div>
          <div>Contactos</div>
          <div>Historial</div>
          <div>Último contacto</div>
          <div>Registro</div>
        </div>

        {filteredRecords.map((record) => {
          const company = record.company;
          const isExpanded = expandedCompanyIds.has(company.id);
          const visibleMessages = getVisibleMessages(record.messages);
          const visibleReplies = getVisibleReplies(record.replies);
          const companySentCount = visibleMessages.filter(
            (message) => message.status === "sent",
          ).length;
          const timeline = buildTimeline(visibleMessages, visibleReplies);

          return (
            <div
              className="border-b border-border last:border-b-0"
              key={company.id}
            >
              <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(18rem,1.8fr)_12rem_12rem_10rem_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{company.name}</h2>
                    <StatusBadge status={record.campaignStatus} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{company.domain ?? "Sin dominio"}</span>
                    <span>{company.industry || "Sin industria"}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {company.description || "Sin descripción guardada."}
                  </p>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Users className="size-4 text-muted-foreground" />
                    {plural(record.contacts.length, "contacto", "contactos")}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {record.contacts[0]?.email ?? "Sin contacto guardado"}
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-muted-foreground" />
                    {plural(companySentCount, "mail enviado", "mails enviados")}
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="size-4 text-muted-foreground" />
                    {plural(visibleReplies.length, "respuesta", "respuestas")}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {record.lastInteractionAt
                    ? formatDate(record.lastInteractionAt)
                    : "Sin contacto"}
                </div>

                <Button
                  aria-label={`${isExpanded ? "Ocultar registro" : "Ver registro"} de ${company.name}`}
                  aria-expanded={isExpanded}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => toggleCompany(company.id)}
                >
                  {isExpanded ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  {isExpanded ? "Ocultar" : "Ver registro"}
                </Button>
              </div>

              {isExpanded ? (
                <div className="border-t border-border bg-muted/20 px-4 py-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-4">
                      <CompanyDetailBlock
                        icon={<Building2 className="size-4" />}
                        title="Registro de empresa"
                      >
                        <DetailLine
                          label="Estado"
                          value={getStatusLabel(record.campaignStatus)}
                        />
                        <DetailLine label="Fit" value={`${record.fitScore}/100`} />
                        <DetailLine
                          label="Último contacto"
                          value={record.frequencyWarning.label}
                        />
                        <DetailLine
                          label="Razón"
                          value={
                            record.campaignCompany?.selectedContactReason ||
                            company.selectedContactReason ||
                            "Sin razón guardada."
                          }
                        />
                        <DetailLine
                          label="Notas"
                          value={
                            record.campaignCompany?.campaignNotes ||
                            company.campaignNotes ||
                            company.notes ||
                            "Sin notas guardadas."
                          }
                        />
                      </CompanyDetailBlock>

                      <CompanyDetailBlock
                        icon={<Users className="size-4" />}
                        title="Contactos relacionados"
                      >
                        {record.contacts.length ? (
                          <div className="divide-y divide-border">
                            {record.contacts.map((contact) => (
                              <div className="py-3 first:pt-0 last:pb-0" key={contact.id}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">{contact.name}</div>
                                  <StatusBadge status={contact.verificationStatus} />
                                  {contact.isDecisionMaker ? (
                                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                                      Decisor
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                  {contact.role || "Sin cargo"} · {contact.email}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Fuente: {contact.source || "sin fuente"}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Sin contactos guardados para esta empresa.
                          </p>
                        )}
                      </CompanyDetailBlock>

                      <CompanyDomTaskBox
                        campaign={campaign}
                        company={company}
                        scope={scope}
                      />
                    </div>

                    <CompanyDetailBlock
                      icon={<Clock3 className="size-4" />}
                      title="Historial de contacto"
                    >
                      {timeline.length ? (
                        <div className="divide-y divide-border">
                          {timeline.map((item) => (
                            <TimelineRow item={item} key={item.id} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Sin mails ni respuestas registradas.
                        </p>
                      )}
                    </CompanyDetailBlock>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {!filteredRecords.length ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">
            No hay empresas aprobadas o contactadas que calcen con la búsqueda.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CompanyDomTaskBox({
  campaign,
  company,
  scope,
}: {
  campaign: AppCampaign | null;
  company: AppCompany;
  scope: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<ActionState>(initialActionState);
  const [isPending, startTransition] = useTransition();
  const disabled = !campaign;

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createCompanyOverviewDomTaskAction(
        initialActionState,
        formData,
      );
      setState(result);
      if (result.ok) {
        setInstruction("");
        setOpen(false);
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4" />
            Dom sobre esta empresa
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea una tarea con el registro de esta empresa como contexto.
          </p>
        </div>
        <Button
          aria-label={`Pedir a Dom sobre ${company.name}`}
          disabled={disabled}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setOpen((current) => !current)}
        >
          <Bot className="size-4" />
          Pedir a Dom
        </Button>
      </div>

      {disabled ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Entra a un proyecto concreto para crear tareas por empresa.
        </p>
      ) : null}

      {open ? (
        <form action={onSubmit} className="mt-3 space-y-3">
          <input name="scope" type="hidden" value={scope} />
          <input name="companyId" type="hidden" value={company.id} />
          <label
            className="block space-y-1 text-sm"
            htmlFor={`dom-company-note-${company.id}`}
          >
            <span className="font-medium">
              Qué quieres decirle a Dom sobre esta empresa
            </span>
            <Textarea
              className="h-28 min-h-0 resize-none [field-sizing:fixed]"
              id={`dom-company-note-${company.id}`}
              name="instruction"
              placeholder="Ej: ojo que respondió otra persona, revisa si hay que crear ese contacto y marcarlo verificado."
              required
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </label>
          {state.message ? <ActionMessage state={state} /> : null}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={isPending} size="sm" type="submit">
              {isPending ? "Creando" : "Crear tarea"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

type TimelineItem = {
  body: string;
  date: string;
  id: string;
  status: string;
  title: string;
  type: "mail" | "reply";
};

function buildTimeline(messages: AppMessage[], replies: AppReply[]): TimelineItem[] {
  return [
    ...messages.map((message) => ({
      body: message.body,
      date: message.sentAt ?? message.createdAt,
      id: `message-${message.id}`,
      status: message.status,
      title: message.subject,
      type: "mail" as const,
    })),
    ...replies.map((reply) => ({
      body: reply.body,
      date: reply.receivedAt,
      id: `reply-${reply.id}`,
      status: reply.approvalStatus,
      title: reply.classification,
      type: "reply" as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const itemTypeLabel = item.type === "mail" ? "mail" : "respuesta";

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {item.type === "mail" ? (
              <Mail className="size-4 text-muted-foreground" />
            ) : (
              <MessageSquareText className="size-4 text-muted-foreground" />
            )}
            {item.title}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.type === "mail" ? "Mail enviado" : "Respuesta recibida"} ·{" "}
            {formatDate(item.date)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={item.status} />
          <Button
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Cerrar" : "Abrir"} ${itemTypeLabel} ${item.title}`}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setIsOpen((current) => !current)}
          >
            {isOpen ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            {isOpen ? "Cerrar" : "Abrir"}
          </Button>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
        {isOpen ? item.body : getMailPreview(item.body)}
      </p>
    </div>
  );
}

function isApprovedOrContactedRecord(record: CompanyExplorerRecord) {
  if (overviewCompanyStatuses.has(record.campaignStatus)) return true;

  const hasApprovedOrSentMail = getVisibleMessages(record.messages).some(
    (message) => message.status === "approved" || message.status === "sent",
  );
  if (hasApprovedOrSentMail) return true;

  return getVisibleReplies(record.replies).length > 0;
}

function getVisibleMessages(messages: AppMessage[]) {
  return messages.filter((message) => message.status !== "rejected");
}

function getVisibleReplies(replies: AppReply[]) {
  return replies.filter((reply) => reply.approvalStatus !== "rejected");
}

function getMailPreview(body: string) {
  const firstParagraph =
    body
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .find(Boolean) ?? body.trim();

  if (firstParagraph.length <= 140) return firstParagraph;
  return `${firstParagraph.slice(0, 137).trimEnd()}...`;
}

function CompanyDetailBlock({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-border py-2 text-sm first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[8rem_1fr]">
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
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

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "2-digit",
  });
}
