"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  HelpCircle,
  Mail,
  Search,
  StickyNote,
  XCircle,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  classifyCompanyForCampaignAction,
  type ActionState,
} from "@/features/prospecting/actions";
import {
  buildCompanyExplorerRecords,
  filterCompanyExplorerRecords,
  type CompanyExplorerMembership,
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
const allCampaignsScope = "all";

const statusOptions: Array<{ value: "all" | CompanyExplorerStatus; label: string }> =
  [
    { value: "all", label: "Todos los estados" },
    { value: "not_evaluated", label: "Sin evaluar" },
    { value: "needs_research", label: "Investigar" },
    { value: "qualified", label: "Calificado" },
    { value: "ready_to_draft", label: "Listo para borrador" },
    { value: "draft_ready", label: "Borrador listo" },
    { value: "approved_to_send", label: "Aprobado" },
    { value: "sent", label: "Enviado" },
    { value: "replied", label: "Respondió" },
    { value: "followup_due", label: "Follow-up" },
    { value: "closed_positive", label: "Cerrado positivo" },
    { value: "closed_negative", label: "Cerrado negativo" },
    { value: "do_not_contact", label: "No contactar" },
  ];

const membershipOptions: Array<{
  value: "all" | CompanyExplorerMembership;
  label: string;
}> = [
  { value: "all", label: "Toda la base" },
  { value: "in_campaign", label: "En este proyecto" },
  { value: "not_evaluated", label: "Sin evaluar aquí" },
];

export function CompanyExplorer({
  scope,
  campaigns,
  allCompanies,
  campaignCompanies,
  contacts,
  messages,
  replies,
  now,
}: {
  scope: string;
  campaigns: AppCampaign[];
  allCompanies: AppCompany[];
  campaignCompanies: AppCompany[];
  contacts: AppContact[];
  messages: AppMessage[];
  replies: AppReply[];
  now: string;
}) {
  const router = useRouter();
  const [actionState, classifyAction, isClassifying] = useActionState(
    classifyCompanyForCampaignAction,
    initialActionState,
  );
  const [query, setQuery] = useState("");
  const [membership, setMembership] =
    useState<"all" | CompanyExplorerMembership>("all");
  const [status, setStatus] = useState<"all" | CompanyExplorerStatus>("all");
  const canClassify = scope !== allCampaignsScope;

  useEffect(() => {
    if (actionState.message) {
      router.refresh();
    }
  }, [actionState, router]);

  const records = useMemo(
    () =>
      buildCompanyExplorerRecords({
        scope,
        allCompanies,
        campaignCompanies,
        contacts,
        messages,
        replies,
        now,
      }),
    [allCompanies, campaignCompanies, contacts, messages, now, replies, scope],
  );

  const filteredRecords = useMemo(
    () =>
      filterCompanyExplorerRecords(records, {
        query,
        membership,
        status,
      }),
    [membership, query, records, status],
  );

  const notEvaluatedCount = records.filter(
    (record) => record.membership === "not_evaluated",
  ).length;
  const inCampaignCount = records.length - notEvaluatedCount;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_13rem_13rem]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar empresa, dominio, contacto, cargo, mail, respuesta o nota..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Base
            </span>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={membership}
              onChange={(event) =>
                setMembership(event.target.value as typeof membership)
              }
              disabled={!canClassify}
            >
              {membershipOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Estado
            </span>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{filteredRecords.length} empresas visibles</span>
          <span>·</span>
          <span>{inCampaignCount} en este proyecto</span>
          {canClassify ? (
            <>
              <span>·</span>
              <button
                className="font-medium text-primary"
                type="button"
                onClick={() => {
                  setMembership("not_evaluated");
                  setStatus("all");
                }}
              >
                {notEvaluatedCount} sin evaluar aquí
              </button>
            </>
          ) : null}
        </div>

        {actionState.message ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              actionState.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {actionState.message}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(18rem,2fr)_10rem_8rem_12rem_15rem] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <div>Empresa</div>
          <div>Contexto</div>
          <div>Fit</div>
          <div>Última interacción</div>
          <div>Acción</div>
        </div>

        {filteredRecords.map((record) => (
          <CompanyRow
            key={record.company.id}
            record={record}
            campaigns={campaigns}
            scope={scope}
            canClassify={canClassify}
            isClassifying={isClassifying}
            classifyAction={classifyAction}
          />
        ))}

        {filteredRecords.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">
            No hay empresas que calcen con esos filtros.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CompanyRow({
  record,
  campaigns,
  scope,
  canClassify,
  isClassifying,
  classifyAction,
}: {
  record: ReturnType<typeof buildCompanyExplorerRecords>[number];
  campaigns: AppCampaign[];
  scope: string;
  canClassify: boolean;
  isClassifying: boolean;
  classifyAction: (payload: FormData) => void;
}) {
  const company = record.company;
  const campaignNames = company.campaignIds
    .map((campaignId) => campaigns.find((campaign) => campaign.id === campaignId))
    .filter((campaign): campaign is AppCampaign => Boolean(campaign))
    .map((campaign) => campaign.organization);
  const historyCount = record.messages.length + record.replies.length;

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(18rem,2fr)_10rem_8rem_12rem_15rem] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate font-medium">{company.name}</div>
            <StatusBadge status={record.campaignStatus} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{company.domain ?? "Sin dominio"}</span>
            {company.website ? (
              <a
                href={company.website}
                className="inline-flex items-center gap-1 font-medium text-primary"
                target="_blank"
                rel="noreferrer"
              >
                Sitio <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {company.industry} · {company.region}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="font-medium">
            {record.membership === "in_campaign"
              ? "Tiene contexto"
              : "Sin evaluar"}
          </div>
          <div className="flex flex-wrap gap-1">
            {campaignNames.length ? (
              campaignNames.map((name) => (
                <span
                  key={name}
                  className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                >
                  {name}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                Solo base general
              </span>
            )}
          </div>
        </div>

        <div>
          <Progress value={record.fitScore} className="h-1.5" />
          <div className="mt-1 text-xs text-muted-foreground">
            {record.fitScore}/100
          </div>
        </div>

        <div className="text-sm">
          <div
            className={
              record.frequencyWarning.blocked
                ? "font-medium text-amber-700"
                : "text-muted-foreground"
            }
          >
            {record.frequencyWarning.label}
          </div>
          {historyCount > 0 ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {historyCount} registros en historial
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canClassify ? (
            <>
              <ClassifyButton
                companyId={company.id}
                scope={scope}
                decision="fit"
                disabled={isClassifying}
              >
                <CheckCircle2 className="size-4" />
                Sirve
              </ClassifyButton>
              <ClassifyButton
                companyId={company.id}
                scope={scope}
                decision="maybe"
                disabled={isClassifying}
              >
                <HelpCircle className="size-4" />
                Investigar
              </ClassifyButton>
              <ClassifyButton
                companyId={company.id}
                scope={scope}
                decision="not_fit"
                disabled={isClassifying}
              >
                <XCircle className="size-4" />
                No sirve
              </ClassifyButton>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Entra a un proyecto para clasificar.
            </span>
          )}
        </div>
      </div>

      <details className="group px-4 pb-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-primary">
          Ver historial, contactos y notas
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
          <div className="space-y-3">
            <InfoBlock
              icon={<StickyNote className="size-4" />}
              title="Notas"
              items={[
                company.notes,
                record.campaignCompany?.campaignNotes
                  ? `Proyecto: ${record.campaignCompany.campaignNotes}`
                  : null,
                record.campaignCompany?.futureNotes
                  ? `Futuro: ${record.campaignCompany.futureNotes}`
                  : null,
                record.campaignCompany?.selectedContactReason
                  ? `Razón: ${record.campaignCompany.selectedContactReason}`
                  : null,
              ]}
              empty="Sin notas registradas."
            />

            <InfoBlock
              icon={<Mail className="size-4" />}
              title="Contactos"
              items={record.contacts.map((contact) =>
                [
                  contact.name,
                  contact.role,
                  contact.email,
                  contact.isDecisionMaker ? "decisor" : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )}
              empty="Sin contactos guardados para esta empresa."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="size-4" />
              Historial de comunicaciones
            </div>
            <div className="space-y-2">
              {record.messages.map((message) => (
                <HistoryItem
                  key={message.id}
                  label={message.campaignId}
                  status={message.status}
                  title={message.subject}
                  body={message.body}
                  date={message.sentAt ?? message.createdAt}
                />
              ))}
              {record.replies.map((reply) => (
                <HistoryItem
                  key={reply.id}
                  label="Respuesta recibida"
                  status={reply.approvalStatus}
                  title={reply.classification}
                  body={reply.body}
                  date={reply.receivedAt}
                />
              ))}
              {historyCount === 0 ? (
                <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                  No hay mails ni respuestas registradas.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </details>
    </div>
  );

  function ClassifyButton({
    companyId,
    scope,
    decision,
    disabled,
    children,
  }: {
    companyId: string;
    scope: string;
    decision: "fit" | "maybe" | "not_fit";
    disabled: boolean;
    children: ReactNode;
  }) {
    return (
      <form action={classifyAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="scope" value={scope} />
        <Button
          disabled={disabled}
          name="decision"
          size="sm"
          type="submit"
          value={decision}
          variant={decision === "fit" ? "default" : "outline"}
        >
          {children}
        </Button>
      </form>
    );
  }
}

function InfoBlock({
  icon,
  title,
  items,
  empty,
}: {
  icon: ReactNode;
  title: string;
  items: Array<string | null | undefined>;
  empty: string;
}) {
  const visibleItems = items.filter((item): item is string => Boolean(item));

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {visibleItems.length ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          {visibleItems.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function HistoryItem({
  label,
  status,
  title,
  body,
  date,
}: {
  label: string;
  status: string;
  title: string;
  body: string;
  date: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {label} · {formatDate(date)}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
