import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Inbox,
  LockKeyhole,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { deactivatePastoralMemoryRuleAction } from "@/features/pastoral/actions";
import {
  PASTORAL_CONTACT_SHEET_URL,
  pastoralBankAccount,
  pastoralDonationSteps,
  pastoralFundraisingGoals,
  pastoralImpactStats,
  pastoralSendRules,
} from "@/lib/pastoral/config";
import {
  getPastoralOpsSnapshot,
  getPastoralSheetStatus,
  type PastoralQueueItem,
} from "@/lib/pastoral/dashboard";
import {
  formatPastoralGoalDate,
  getCurrentPastoralGoal,
} from "@/lib/pastoral/goals";
import {
  findPastoralDuplicate,
} from "@/lib/pastoral/sheet";
import { pastoralMailTemplates } from "@/lib/pastoral/templates";
import {
  getCompaniesData,
  getContactsData,
} from "@/lib/prospecting/repository";
import { cn } from "@/lib/utils";

export async function PastoralFundraisingView({ scope }: { scope: string }) {
  const [companies, contacts, ops] = await Promise.all([
    getCompaniesData(scope),
    getContactsData(scope),
    getPastoralOpsSnapshot(scope),
  ]);
  const sheetStatus = await getPastoralSheetStatus();
  const currentGoal = getCurrentPastoralGoal();
  const localDuplicates = contacts
    .map((contact) => {
      const company = companies.find((item) => item.id === contact.companyId);
      const duplicate = findPastoralDuplicate({
        companyName: company?.name ?? contact.name,
        email: contact.email,
        sheetContacts: sheetStatus.contacts,
      });

      return duplicate ? { company, contact, duplicate } : null;
    })
    .filter((item) => item !== null);
  const visibleCompanies = companies.filter((company) =>
    ["approved_to_send", "sent", "replied", "followup_due"].includes(
      company.status,
    ),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pastoral UC - cockpit de recaudación"
        eyebrow="Trabajo País 2026"
      >
        <Link
          href={PASTORAL_CONTACT_SHEET_URL}
          className={buttonVariants({ variant: "outline" })}
          target="_blank"
        >
          <ExternalLink className="size-4" />
          Sheets
        </Link>
        <Link
          href={`/campaigns/${scope}/review/replies`}
          className={buttonVariants({ variant: "outline" })}
        >
          <Inbox className="size-4" />
          Respuestas
        </Link>
        <Link
          href={`/campaigns/${scope}/review/outbound`}
          className={buttonVariants()}
        >
          <Mail className="size-4" />
          Revisar mails
        </Link>
      </PageHeader>

      <section className="grid gap-3 lg:grid-cols-5">
        <HealthTile
          detail={
            ops.counts.gmailConnected
              ? `${ops.counts.gmailConnected} cuenta conectada`
              : "Conecta Gmail antes de operar"
          }
          label="Gmail"
          state={ops.counts.gmailConnected ? "ok" : "warn"}
          value={ops.counts.gmailConnected ? "Listo" : "Falta"}
        />
        <HealthTile
          detail={
            sheetStatus.mode === "google_oauth" && sheetStatus.ok
              ? `${sheetStatus.contacts.length} filas verificadas como ${sheetStatus.oauthUserEmail}`
              : sheetStatus.mode === "google_oauth"
                ? sheetStatus.error ?? "Reconecta Google con permiso de Sheets"
                : sheetStatus.ok
                  ? "CSV solo vista; enviar valida OAuth del remitente"
                  : sheetStatus.error ?? "Sheets no disponible"
          }
          label="Sheets OAuth"
          state={
            sheetStatus.mode === "google_oauth" && sheetStatus.ok
              ? "ok"
              : "critical"
          }
          value={
            sheetStatus.mode === "google_oauth" && sheetStatus.ok
              ? "Seguro"
              : "Bloquea"
          }
        />
        <HealthTile
          detail="Choques locales contra planilla"
          label="Duplicados"
          state={localDuplicates.length ? "critical" : "ok"}
          value={String(localDuplicates.length)}
        />
        <HealthTile
          detail="Sin respuesta por 5+ días"
          label="Follow-ups"
          state={ops.counts.followupsDue ? "warn" : "ok"}
          value={String(ops.counts.followupsDue)}
        />
        <HealthTile
          detail="Replies sin cierre"
          label="Respuestas"
          state={ops.counts.pendingReplies ? "warn" : "ok"}
          value={String(ops.counts.pendingReplies)}
        />
      </section>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-semibold">Guardrail crítico: fail-closed</h2>
            <p className="mt-1 text-sm leading-6">
              Un mail inicial de Pastoral solo sale si antes se leyó el Sheets
              fresco, no hubo duplicado, se creó reserva local, se agregó la fila,
              se releyó y se verificó. Si falla cualquier paso, Gmail queda
              bloqueado con el motivo exacto.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Gauge className="size-5" />
                Cola priorizada
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Primero respuestas, luego follow-ups, luego mails seguros para enviar.
              </p>
            </div>
            <Badge variant="outline">{ops.queue.length} acciones</Badge>
          </div>

          <div className="mt-4 divide-y divide-border">
            {ops.queue.length ? (
              ops.queue.map((item) => (
                <QueueRow item={item} key={`${item.companyId}-${item.state}`} />
              ))
            ) : (
              <EmptyState
                icon={<ClipboardList className="size-5" />}
                text="No hay empresas accionables ahora. Revisa si faltan empresas aprobadas/contactadas para este proyecto."
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Target className="size-5" />
              Meta de zona
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Metric label="Meta actual" value={formatMoney(currentGoal.amount)} />
              <Metric label="Meta final" value="$6.000.000" />
            </div>
            <Progress
              className="mt-4"
              value={(currentGoal.amount / 6000000) * 100}
            />
            <div className="mt-4 grid gap-2 text-sm">
              {pastoralFundraisingGoals.map((goal) => (
                <div
                  className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0"
                  key={goal.date}
                >
                  <span>{formatPastoralGoalDate(goal.date)}</span>
                  <span className="font-mono">{formatMoney(goal.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <LockKeyhole className="size-5" />
              Sheets
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <InfoLine label="Modo" value={formatSheetMode(sheetStatus.mode)} />
              <InfoLine
                label="Cuenta"
                value={sheetStatus.oauthUserEmail ?? "Se valida al enviar"}
              />
              <InfoLine label="Rango" value={sheetStatus.range || "A:F"} />
              <InfoLine
                label="Filas"
                value={String(sheetStatus.contacts.length)}
              />
            </div>
            {sheetStatus.error ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                {sheetStatus.error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5" />
            Secuencia de envío seguro
          </div>
          <div className="mt-4 grid gap-3">
            {[
              "Leer Sheets fresco con la cuenta Google conectada del remitente.",
              "Detectar duplicado por email, dominio y nombre normalizado.",
              "Reservar localmente por mail y dominio antes de tocar Gmail.",
              "Append al Sheets, releer y verificar la fila.",
              "Enviar Gmail solo si todo lo anterior pasó.",
            ].map((item, index) => (
              <div className="flex gap-3 text-sm" key={item}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CopyIcon />
              Duplicados detectados
            </div>
            <Badge variant={localDuplicates.length ? "destructive" : "outline"}>
              {localDuplicates.length}
            </Badge>
          </div>
          <div className="mt-4 divide-y divide-border">
            {localDuplicates.length ? (
              localDuplicates.slice(0, 6).map(({ company, contact, duplicate }) => (
                <div className="py-3 first:pt-0 last:pb-0" key={contact.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {company?.name ?? contact.name}
                    </span>
                    <Badge variant="outline">
                      {formatDuplicateReason(duplicate.reason)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sheets: {duplicate.contact.name || "sin nombre"} ·{" "}
                    {duplicate.contact.email || "sin mail"} ·{" "}
                    {duplicate.contact.contactedBy || "sin responsable"}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<CheckCircle2 className="size-5" />}
                text="No hay choques entre contactos locales y la planilla leída."
              />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Brain className="size-5" />
            Qué aprendió la IA
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Reglas duras y memoria vectorial creada desde feedback, aprobaciones y tareas.
          </p>
          <div className="mt-4 divide-y divide-border">
            {ops.memoryRules.length ? (
              ops.memoryRules.map((rule) => (
                <div className="py-3 first:pt-0 last:pb-0" key={rule.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{rule.ruleType}</Badge>
                    <form action={deactivatePastoralMemoryRuleAction}>
                      <input name="ruleId" type="hidden" value={rule.id} />
                      <input name="scope" type="hidden" value={scope} />
                      <button
                        className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        type="submit"
                      >
                        Desactivar
                      </button>
                    </form>
                  </div>
                  <p className="mt-2 text-sm leading-6">{rule.ruleText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fuente: {rule.source} · confianza{" "}
                    {Math.round(rule.confidence * 100)}%
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<Brain className="size-5" />}
                text="Aún no hay reglas activas. Cuando rechaces, edites o apruebes, Dom podrá convertir patrones útiles en memoria."
              />
            )}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Memoria semántica</h3>
              <Badge variant="outline">{ops.semanticMemory.length}</Badge>
            </div>
            <div className="mt-2 divide-y divide-border">
              {ops.semanticMemory.length ? (
                ops.semanticMemory.map((memory) => (
                  <div className="py-2 first:pt-0 last:pb-0" key={memory.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatMemorySource(memory.sourceType)}</Badge>
                      {memory.confidence == null ? null : (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(memory.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {memory.preview}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay embeddings guardados. Se crearán con rechazos,
                  aprobaciones, no responder y tareas a Dom.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <History className="size-5" />
            Actividad reciente
          </div>
          <div className="mt-4 divide-y divide-border">
            {ops.recentActivity.length ? (
              ops.recentActivity.map((item) => (
                <div
                  className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_1fr_auto]"
                  key={`${item.companyName}-${item.subject}-${item.occurredAt}`}
                >
                  <Badge className="w-fit" variant="outline">
                    {formatMessageType(item.type)}
                  </Badge>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.companyName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.subject}
                    </p>
                    {item.preview ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {item.preview}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatShortDate(item.occurredAt)}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<History className="size-5" />}
                text="Todavía no hay actividad real en Pastoral."
              />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Banknote className="size-5" />
            Donación y certificado
          </div>
          <div className="mt-4 grid gap-2 rounded-lg border border-border p-3 text-sm">
            <InfoLine label="Banco" value={pastoralBankAccount.bank} />
            <InfoLine label="Nombre" value={pastoralBankAccount.name} />
            <InfoLine label="RUT" value={pastoralBankAccount.rut} />
            <InfoLine label="Cuenta" value={pastoralBankAccount.type} />
            <InfoLine label="N°" value={pastoralBankAccount.number} />
            <InfoLine label="Correo" value={pastoralBankAccount.email} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <Checklist
              title="Sin certificado"
              items={pastoralDonationSteps.withoutCertificate}
            />
            <Checklist
              title="Con certificado"
              items={pastoralDonationSteps.withCertificate}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="size-5" />
            Plantillas y reglas
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              {pastoralSendRules.map((rule) => (
                <div className="flex gap-2 text-sm" key={rule}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {pastoralMailTemplates.map((template) => (
                <details
                  className="rounded-lg border border-border bg-background p-3"
                  key={template.id}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {template.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {template.subject}
                    </span>
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm leading-6">
                    {template.body}
                  </pre>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {pastoralImpactStats.map((stat) => (
          <Metric key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="size-5" />
          Empresas aprobadas o contactadas
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta vista evita ruido: solo aparecen empresas que ya fueron aprobadas,
          contactadas, respondieron o necesitan follow-up.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleCompanies.slice(0, 12).map((company) => (
            <div
              className="rounded-lg border border-border bg-background p-3"
              key={company.id}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{company.name}</p>
                <Badge variant="outline">{formatCompanyStatus(company.status)}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {company.campaignNotes || company.futureNotes || company.description}
              </p>
            </div>
          ))}
          {!visibleCompanies.length ? (
            <EmptyState
              icon={<Bot className="size-5" />}
              text="No hay empresas aprobadas o contactadas para mostrar todavía."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function QueueRow({ item }: { item: PastoralQueueItem }) {
  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StateDot state={item.state} />
          <h3 className="min-w-0 truncate text-base font-semibold">
            {item.companyName}
          </h3>
          <Badge variant={item.state === "blocked" ? "destructive" : "outline"}>
            {formatQueueState(item.state)}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            fit {item.fitScore}/100
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.contactName}
          {item.contactEmail ? ` · ${item.contactEmail}` : ""}
        </p>
        <p className="mt-2 text-sm">{item.reason}</p>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <span className="hidden text-xs text-muted-foreground lg:inline">
          {formatShortDate(item.lastActivityAt)}
        </span>
        <Link
          href={item.actionHref}
          className={buttonVariants({
            size: "sm",
            variant: item.state === "safe_to_send" ? "default" : "outline",
          })}
        >
          {getQueueIcon(item.state)}
          {item.actionLabel}
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function HealthTile({
  detail,
  label,
  state,
  value,
}: {
  detail: string;
  label: string;
  state: "critical" | "ok" | "warn";
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        state === "ok" && "border-emerald-200",
        state === "warn" && "border-amber-300 bg-amber-50/60",
        state === "critical" && "border-red-300 bg-red-50/70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        {state === "ok" ? (
          <CheckCircle2 className="size-4 text-emerald-600" />
        ) : state === "warn" ? (
          <AlertTriangle className="size-4 text-amber-600" />
        ) : (
          <XCircle className="size-4 text-red-600" />
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function Checklist({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div className="flex gap-2 text-sm text-muted-foreground" key={item}>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  text,
}: {
  icon: ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function StateDot({ state }: { state: PastoralQueueItem["state"] }) {
  return (
    <span
      className={cn(
        "size-2.5 rounded-full",
        state === "reply_pending" && "bg-blue-600",
        state === "followup_ready" && "bg-amber-500",
        state === "safe_to_send" && "bg-emerald-600",
        state === "review_mail" && "bg-cyan-600",
        state === "waiting" && "bg-muted-foreground",
        state === "blocked" && "bg-red-600",
      )}
    />
  );
}

function CopyIcon() {
  return <ShieldCheck className="size-5" />;
}

function getQueueIcon(state: PastoralQueueItem["state"]) {
  if (state === "reply_pending") return <Inbox className="size-4" />;
  if (state === "followup_ready") return <RefreshCw className="size-4" />;
  if (state === "safe_to_send") return <Send className="size-4" />;
  if (state === "review_mail") return <Mail className="size-4" />;
  return <History className="size-4" />;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CL", {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDuplicateReason(reason: "domain" | "email" | "name") {
  if (reason === "email") return "Mismo mail";
  if (reason === "domain") return "Mismo dominio";
  return "Mismo nombre";
}

function formatQueueState(state: PastoralQueueItem["state"]) {
  if (state === "reply_pending") return "Respondió";
  if (state === "followup_ready") return "Follow-up";
  if (state === "safe_to_send") return "Seguro enviar";
  if (state === "review_mail") return "Revisar mail";
  if (state === "blocked") return "Bloqueado";
  return "Esperando";
}

function formatMessageType(type: string) {
  if (type === "inbound_reply") return "Reply";
  if (type === "outbound_followup") return "Follow-up";
  if (type === "outbound_reply") return "Respuesta";
  return "Inicial";
}

function formatCompanyStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatMemorySource(source: string) {
  if (source === "approved_message") return "aprobado";
  if (source === "dom_task") return "tarea";
  if (source === "no_reply") return "no responder";
  if (source === "outbound_feedback") return "feedback";
  if (source === "reply_feedback") return "reply";
  return source.replaceAll("_", " ");
}

function formatSheetMode(mode: "google_oauth" | "public_csv" | "unavailable") {
  if (mode === "google_oauth") return "Google OAuth";
  if (mode === "public_csv") return "CSV público solo lectura";
  return "No disponible";
}

function formatShortDate(value: string | null) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
