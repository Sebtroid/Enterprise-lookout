import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CopyCheck,
  ExternalLink,
  FileText,
  LockKeyhole,
  Mail,
  Target,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PASTORAL_CONTACT_SHEET_URL,
  pastoralBankAccount,
  pastoralDonationSteps,
  pastoralFundraisingGoals,
  pastoralImpactStats,
  pastoralSendRules,
} from "@/lib/pastoral/config";
import {
  fetchPastoralSheetContacts,
  findPastoralDuplicate,
  type PastoralSheetContact,
} from "@/lib/pastoral/sheet";
import {
  formatPastoralGoalDate,
  getCurrentPastoralGoal,
} from "@/lib/pastoral/goals";
import { pastoralMailTemplates } from "@/lib/pastoral/templates";
import {
  getCompaniesData,
  getContactsData,
} from "@/lib/prospecting/repository";

export async function PastoralFundraisingView({ scope }: { scope: string }) {
  const [companies, contacts, sheetResult] = await Promise.all([
    getCompaniesData(scope),
    getContactsData(scope),
    fetchPastoralSheetContacts()
      .then((contacts) => ({ ok: true as const, contacts }))
      .catch((error: Error) => ({
        ok: false as const,
        contacts: [] as PastoralSheetContact[],
        error: error.message,
      })),
  ]);
  const currentGoal = getCurrentPastoralGoal();
  const localDuplicates = contacts
    .map((contact) => {
      const company = companies.find((item) => item.id === contact.companyId);
      const duplicate = findPastoralDuplicate({
        companyName: company?.name ?? contact.name,
        email: contact.email,
        sheetContacts: sheetResult.contacts,
      });

      return duplicate ? { company, contact, duplicate } : null;
    })
    .filter((item) => item !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pastoral UC - recaudación"
        eyebrow="Trabajo País 2026"
      >
        <Link
          href={PASTORAL_CONTACT_SHEET_URL}
          className={buttonVariants({ variant: "outline" })}
          target="_blank"
        >
          <ExternalLink className="size-4" />
          Sheets contactados
        </Link>
        <Link
          href={`/campaigns/${scope}/review/outbound`}
          className={buttonVariants()}
        >
          <Mail className="size-4" />
          Revisar mails
        </Link>
      </PageHeader>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Regla crítica anti-duplicados</h2>
            <p className="mt-1 text-sm leading-6">
              Ningún mail inicial de Pastoral debe salir si el contacto o empresa
              ya aparece en el Sheets compartido. El envío automático queda
              bloqueado si no puede registrar la fila antes de mandar el correo.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4" />
              Meta de zona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Meta actual" value={formatMoney(currentGoal.amount)} />
              <Metric label="Meta final" value="$6.000.000" />
            </div>
            <Progress value={(currentGoal.amount / 6000000) * 100} />
            <div className="grid gap-2 text-sm">
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
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="size-4" />
              Guardia del Sheets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Contactos en Sheets"
                value={sheetResult.ok ? String(sheetResult.contacts.length) : "Error"}
              />
              <Metric
                label="Webhook registro"
                value={
                  process.env.PASTORAL_CONTACT_SHEET_WEBHOOK_URL
                    ? "Configurado"
                    : "Falta"
                }
              />
            </div>
            {sheetResult.ok ? (
              <p className="text-sm text-muted-foreground">
                Últimas filas visibles desde el Sheets público. El bloqueo de
                envío usa email y nombre normalizado.
              </p>
            ) : (
              <p className="text-sm text-destructive">{sheetResult.error}</p>
            )}
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetResult.contacts.slice(0, 6).map((contact) => (
                    <TableRow key={`${contact.email}-${contact.name}`}>
                      <TableCell className="min-w-56 whitespace-normal">
                        <div className="font-medium">{contact.name || "Sin nombre"}</div>
                        <div className="text-xs text-muted-foreground">
                          {contact.email || "Sin mail"}
                        </div>
                      </TableCell>
                      <TableCell>{contact.contactedBy || "-"}</TableCell>
                      <TableCell>{contact.status || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" />
              Cadencia y reglas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pastoralSendRules.map((rule) => (
                <div className="flex gap-2 text-sm" key={rule}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CopyCheck className="size-4" />
              Duplicados locales detectados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {localDuplicates.length ? (
              <div className="divide-y divide-border">
                {localDuplicates.slice(0, 8).map(({ company, contact, duplicate }) => (
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
                      Sheets: {duplicate.contact.name} · {duplicate.contact.email} ·{" "}
                      {duplicate.contact.contactedBy || "sin responsable"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay choques entre contactos locales y el Sheets leído.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-4" />
              Donación y certificado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
              <InfoLine label="Banco" value={pastoralBankAccount.bank} />
              <InfoLine label="Nombre" value={pastoralBankAccount.name} />
              <InfoLine label="RUT" value={pastoralBankAccount.rut} />
              <InfoLine label="Cuenta" value={pastoralBankAccount.type} />
              <InfoLine label="N°" value={pastoralBankAccount.number} />
              <InfoLine label="Correo" value={pastoralBankAccount.email} />
            </div>
            <Checklist
              title="Sin certificado"
              items={pastoralDonationSteps.withoutCertificate}
            />
            <Checklist
              title="Con certificado"
              items={pastoralDonationSteps.withCertificate}
            />
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Plantillas operativas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm leading-6">
                  {template.body}
                </pre>
              </details>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {pastoralImpactStats.map((stat) => (
          <Metric key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[6rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
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
