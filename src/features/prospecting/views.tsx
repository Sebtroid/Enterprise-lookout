import Link from "next/link";
import { CalendarDays, MailCheck, Mail, Check, AlertTriangle, ExternalLink } from "lucide-react";

import { CompanyExplorer } from "@/components/company-explorer";
import { ImportWorkbench } from "@/components/import-workbench";
import { MetricStrip } from "@/components/metric-strip";
import { NewLeadForm } from "@/components/new-lead-form";
import { OutboundReview } from "@/components/outbound-review";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline-board";
import { ProjectForm } from "@/components/project-form";
import { RepliesReview } from "@/components/replies-review";
import { SenderForm } from "@/components/sender-form";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GmailConnectButton } from "@/components/gmail-connect-button";
import { GmailSyncRepliesButton } from "@/components/gmail-sync-replies-button";
import { getContactPriority } from "@/lib/prospecting/demo-data";
import { getPostgresClient } from "@/lib/supabase/postgres";
import type { AppMessage, AppReply } from "@/lib/prospecting/demo-data";
import {
  ALL_CAMPAIGNS_SCOPE,
  getCampaignsData,
  getCompaniesData,
  getContactsData,
  getMessagesData,
  getProspectingSnapshot,
  getRepliesData,
  isAllCampaignsScope,
  type ProspectingSnapshot,
} from "@/lib/prospecting/repository";

export async function CampaignsIndexView() {
  const snapshot = await getProspectingSnapshot(ALL_CAMPAIGNS_SCOPE);

  return (
    <div className="space-y-6">
      <PageHeader title="Elige proyecto" eyebrow="Workspace">
        <ProjectForm />
        <Link
          href={`/campaigns/${ALL_CAMPAIGNS_SCOPE}`}
          className={buttonVariants()}
        >
          Ver todo
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        {snapshot.campaigns.map((campaign) => {
          const stats = getStatsForCampaign(snapshot, campaign.id);
          const defaultSender = snapshot.senders.find(
            (sender) => sender.campaignId === campaign.id && sender.isDefault,
          );

          return (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{campaign.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {campaign.organization}
                  </p>
                </div>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {campaign.valueProposition}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <Metric label="Empresas" value={stats.activeCompanies} />
                <Metric label="Mails" value={stats.pendingMessages} />
                <Metric label="Respuestas" value={stats.repliesPending} />
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <MailCheck className="size-4" />
                {defaultSender?.email ?? "Sin remitente"}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export async function CampaignOverviewView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);
  const { campaigns, campaign, messages, senders, stats } = snapshot;
  const title = getScopeLabel(snapshot);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        eyebrow={campaign?.organization ?? "Todos los proyectos"}
      >
        <NewLeadForm scope={scope} campaigns={campaigns} />
      </PageHeader>

      {campaign ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <StatusBadge status={campaign.status} />
              <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
                {campaign.valueProposition}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              {campaign.startsOn}
            </div>
          </div>
        </section>
      ) : null}

      <MetricStrip
        metrics={[
          { label: "Empresas activas", value: stats.activeCompanies },
          { label: "Mails por revisar", value: stats.pendingMessages },
          { label: "Aprobados para envío", value: stats.approvedMessages },
          { label: "Replies por aprobar", value: stats.repliesPending },
        ]}
      />

      {campaign ? (
        <section className="grid gap-3 md:grid-cols-3">
          <QuickAction
            href={`/campaigns/${campaign.id}/companies`}
            label="Clasificar empresas"
            description="Ver base general, filtrar sin evaluar y marcar Sirve / Investigar / No sirve."
          />
          <QuickAction
            href={`/campaigns/${campaign.id}/review/outbound`}
            label="Revisar mails"
            description="Editar borradores, aprobarlos y enviarlos con Gmail si el remitente está conectado."
          />
          <QuickAction
            href={`/campaigns/${campaign.id}/review/replies`}
            label="Responder interesados"
            description="Aprobar respuestas; quedan listas para enviarse en el mismo hilo."
          />
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Últimos mails</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Remitente</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.slice(0, 6).map((message) => {
              const sender = senders.find((item) => item.id === message.senderId);
              return (
                <TableRow key={message.id}>
                  <TableCell className="min-w-72 whitespace-normal">
                    <div className="font-medium">{message.subject}</div>
                    <div className="text-sm text-muted-foreground">
                      {message.kind}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={message.status} />
                  </TableCell>
                  <TableCell>{sender?.email}</TableCell>
                  <TableCell>{message.sentAt ?? message.createdAt}</TableCell>
                </TableRow>
              );
            })}
            {!messages.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Sin mails todavía para esta vista.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      {isAllCampaignsScope(scope) ? (
        <section className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Organización</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Remitente default</TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {campaigns.map((item) => {
                const defaultSender = senders.find(
                  (sender) => sender.campaignId === item.id && sender.isDefault,
                );
                return (
                  <TableRow key={item.id}>
                    <TableCell className="min-w-72 whitespace-normal">
                      <Link
                        href={`/campaigns/${item.id}`}
                        className="font-medium text-primary"
                      >
                        {item.name}
                      </Link>
                      <div className="text-sm text-muted-foreground">
                        {item.valueProposition}
                      </div>
                    </TableCell>
                    <TableCell>{item.organization}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>{defaultSender?.email}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

export async function PipelineView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);

  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline" eyebrow={getScopeLabel(snapshot)} />
      <PipelineBoard companies={snapshot.companies} />
    </div>
  );
}

export async function CompaniesView({ scope }: { scope: string }) {
  const campaigns = await getCampaignsData();
  const campaign = isAllCampaignsScope(scope)
    ? null
    : campaigns.find((item) => item.id === scope) ?? null;
  const allCompanies = await getCompaniesData(ALL_CAMPAIGNS_SCOPE);
  const campaignCompanies = isAllCampaignsScope(scope)
    ? allCompanies
    : await getCompaniesData(scope);
  const contacts = await getContactsData(ALL_CAMPAIGNS_SCOPE);
  const messages = await getMessagesData(ALL_CAMPAIGNS_SCOPE);
  const replies = await getRepliesData(ALL_CAMPAIGNS_SCOPE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        eyebrow={campaign?.name ?? "Todos los proyectos"}
      />
      <CompanyExplorer
        scope={scope}
        campaigns={campaigns}
        allCompanies={allCompanies}
        campaignCompanies={campaignCompanies}
        contacts={contacts}
        messages={messages}
        replies={replies}
        now={new Date().toISOString()}
      />
    </div>
  );
}

export async function ContactsView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);

  return (
    <div className="space-y-6">
      <PageHeader title="Contactos" eyebrow={getScopeLabel(snapshot)} />
      <section className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contacto</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Fuente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.contacts.map((contact) => {
              const company = snapshot.companies.find(
                (item) => item.id === contact.companyId,
              );

              return (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="font-medium">{contact.name}</div>
                    <div className="mt-1 flex gap-2">
                      {contact.isDecisionMaker ? (
                        <Badge variant="outline">Decisor</Badge>
                      ) : null}
                      {contact.doNotContact ? (
                        <StatusBadge status="do_not_contact" />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{company?.name}</TableCell>
                  <TableCell>{contact.role}</TableCell>
                  <TableCell>{contact.email}</TableCell>
                  <TableCell>{getContactPriority(contact)}</TableCell>
                  <TableCell>{contact.source}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export async function ImportsView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);

  return (
    <div className="space-y-6">
      <PageHeader title="Imports" eyebrow={getScopeLabel(snapshot)} />
      <ImportWorkbench
        campaigns={snapshot.campaigns}
        companies={snapshot.companies}
        scope={scope}
      />
      <section className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fuente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Filas</TableHead>
              <TableHead className="text-right">Aplicadas</TableHead>
              <TableHead className="text-right">Duplicados</TableHead>
              <TableHead className="text-right">Errores</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.importBatches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell className="font-medium">{batch.sourceName}</TableCell>
                <TableCell>{batch.sourceType}</TableCell>
                <TableCell>
                  <StatusBadge status={batch.status} />
                </TableCell>
                <TableCell className="text-right">{batch.rowCount}</TableCell>
                <TableCell className="text-right">{batch.appliedCount}</TableCell>
                <TableCell className="text-right">
                  {batch.duplicateCount}
                </TableCell>
                <TableCell className="text-right">{batch.errorCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export async function OutboundReviewView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);
  
  // Check which senders have Gmail connected
  const sql = getPostgresClient();
  let gmailConnectedEmails: string[] = [];
  if (sql) {
    const tokenRows = await sql`select user_email from gmail_tokens`;
    gmailConnectedEmails = tokenRows.map((r) => r.user_email as string);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mails por aprobar" eyebrow={getScopeLabel(snapshot)} />
      <OutboundReview
        key={snapshot.messages
          .map((message) => `${message.id}:${message.status}:${message.body}`)
          .join("|")}
        companies={snapshot.companies}
        contacts={snapshot.contacts}
        messages={snapshot.messages.filter((message) =>
          ["needs_review", "approved"].includes(message.status),
        )}
        scope={scope}
        senders={snapshot.senders}
        gmailConnectedEmails={gmailConnectedEmails}
      />
    </div>
  );
}

export async function RepliesReviewView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);
  const pendingReplies = snapshot.replies.filter(
    (reply) => reply.approvalStatus === "needs_review",
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Respuestas por aprobar" eyebrow={getScopeLabel(snapshot)}>
        <GmailSyncRepliesButton scope={scope} />
      </PageHeader>
      <RepliesReview
        key={pendingReplies
          .map((reply) => `${reply.id}:${reply.approvalStatus}:${reply.draftResponse}`)
          .join("|")}
        companies={snapshot.companies}
        contacts={snapshot.contacts}
        replies={pendingReplies}
        senders={snapshot.senders}
      />
    </div>
  );
}

export async function SendersView({ scope }: { scope: string }) {
  const snapshot = await getProspectingSnapshot(scope);

  return (
    <div className="space-y-6">
      <PageHeader title="Remitentes" eyebrow={getScopeLabel(snapshot)}>
        <SenderForm campaigns={snapshot.campaigns} scope={scope} />
      </PageHeader>
      <section className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Correo</TableHead>
              <TableHead>Proyecto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Límite diario</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Firma</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.senders.map((sender) => {
              const campaign = snapshot.campaigns.find(
                (item) => item.id === sender.campaignId,
              );
              return (
                <TableRow key={sender.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <MailCheck className="size-4 text-muted-foreground" />
                      {sender.email}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sender.displayName} · {formatSenderProvider(sender.accountType)}
                    </div>
                  </TableCell>
                  <TableCell>{campaign?.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={sender.status} />
                  </TableCell>
                  <TableCell className="min-w-36">
                    <Progress
                      value={(sender.sentToday / sender.campaignDailyLimit) * 100}
                      className="h-1.5"
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      {sender.sentToday}/{sender.campaignDailyLimit}
                    </div>
                  </TableCell>
                  <TableCell>
                    {sender.isDefault ? "Default" : `P${sender.priority}`}
                  </TableCell>
                  <TableCell className="whitespace-pre-line text-sm text-muted-foreground">
                    {sender.signature}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function formatSenderProvider(provider: string) {
  const labels: Record<string, string> = {
    gmail: "Gmail",
    outlook: "Outlook",
    smtp: "SMTP",
    manual: "Manual",
  };

  return labels[provider] ?? provider;
}

function getScopeLabel(snapshot: ProspectingSnapshot) {
  return snapshot.campaign?.name ?? "Todos los proyectos";
}

function getStatsForCampaign(snapshot: ProspectingSnapshot, campaignId: string) {
  const messages = snapshot.messages.filter(
    (message: AppMessage) => message.campaignId === campaignId,
  );
  const messageIds = new Set(messages.map((message) => message.id));
  const replies = snapshot.replies.filter((reply: AppReply) =>
    messageIds.has(reply.messageId),
  );
  const companies = snapshot.companies.filter((company) =>
    company.campaignIds.includes(campaignId),
  );

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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function QuickAction({
  description,
  href,
  label,
}: {
  description: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-background p-4 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
      prefetch
    >
      <div className="font-medium">{label}</div>
      <p className="mt-1 text-muted-foreground">{description}</p>
    </Link>
  );
}

export async function GmailSettingsView() {
  const sql = getPostgresClient();
  let tokens: { user_email: string; updated_at: string }[] = [];

  if (sql) {
    tokens = await sql`
      select user_email, updated_at::text
      from gmail_tokens
      order by updated_at desc
    `;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Gmail</h1>
        <p className="text-sm text-muted-foreground">
          Conecta tu cuenta de Gmail para enviar mails directamente desde Dom.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Estado de conexión
          </CardTitle>
          <CardDescription>
            {tokens.length > 0
              ? `${tokens.length} cuenta(s) conectada(s)`
              : "Ninguna cuenta conectada"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length > 0 ? (
            <div className="space-y-3">
              {tokens.map((token) => (
                <div
                  key={token.user_email}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Check className="size-4 text-emerald-500" />
                    <div>
                      <div className="font-medium">{token.user_email}</div>
                      <div className="text-xs text-muted-foreground">
                        Conectado el {new Date(token.updated_at).toLocaleDateString("es-CL")}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">Activo</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6">
              <AlertTriangle className="size-8 text-amber-500" />
              <div className="text-center">
                <div className="font-medium">No hay cuentas conectadas</div>
                <div className="text-sm text-muted-foreground">
                  Conecta Gmail para que Dom pueda enviar mails como tú.
                </div>
              </div>
              <GmailConnectButton />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>¿Cómo funciona?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            1. Conectas tu Gmail con OAuth (seguro, no guardamos tu contraseña).
          </p>
          <p>
            2. Cuando apruebes un mail en &quot;Mails&quot;, Dom puede enviarlo directamente
            con Gmail.
          </p>
          <p>
            3. Las respuestas aparecen en &quot;Respuestas&quot;; al aprobarlas se crea
            un mail de vuelta listo para enviar en el mismo hilo.
          </p>
          <p>
            4. Puedes revocar el acceso en cualquier momento desde{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Google Account Settings
              <ExternalLink className="size-3" />
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
