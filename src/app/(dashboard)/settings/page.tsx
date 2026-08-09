import Link from "next/link";
import { Bot, DatabaseBackup, KeyRound, Mail, ShieldCheck, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getV2SettingsSnapshot, getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [snapshot, settings] = await Promise.all([getV2WorkspaceSnapshot(), getV2SettingsSnapshot()]);
  return <div className="space-y-8">
    <PageHeader eyebrow="Workspace privado" title="Configuración" />
    <div className="grid gap-6 xl:grid-cols-2">
      <SettingsSection icon={Users} title="Equipo e instituciones">
        {settings.team.length ? settings.team.map((member) => <SettingRow key={member.id} title={member.name} detail={member.role} badge={member.status} />) : <EmptyRow text="Aún no hay miembros activos." />}
        <button disabled className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>Invitar miembro</button>
      </SettingsSection>
      <SettingsSection icon={Mail} title="Cuentas Gmail">
        {settings.gmailAccounts.length ? settings.gmailAccounts.map((account) => <SettingRow key={account.id} title={account.email} detail={account.permissions.length ? account.permissions.join(" · ") : "Sin permisos para este perfil"} badge={account.status} />) : <EmptyRow text="No hay cuentas Gmail conectadas." />}
        <Link href="/api/gmail?action=connect" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>Conectar cuenta Gmail</Link>
      </SettingsSection>
      <SettingsSection icon={Bot} title="IA y presupuesto">
        <SettingRow title="ChatGPT" detail="Investigación y redacción bajo aprobación" badge="Herramientas listas" />
        <SettingRow title="Bibliotecario" detail={`USD ${snapshot.aiBudget.spentUsd.toFixed(2)} de USD ${snapshot.aiBudget.limitUsd.toFixed(2)} mensuales`} badge="Disponible" />
      </SettingsSection>
      <SettingsSection icon={ShieldCheck} title="Seguridad y automatizaciones">
        <SettingRow title="Primeros correos" detail="Aprobación obligatoria, también en bulk" badge="Protegido" />
        <SettingRow title="Follow-ups" detail="Modo borrador · máximo 3 · cadencia 7/10/14" badge="Manual" />
        <SettingRow title="API privada" detail="Scopes, actor e idempotency key obligatorios" badge="Protegida" />
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled className={buttonVariants({ variant: "outline", size: "sm" })}><KeyRound className="size-3.5" />Conexiones vía ChatGPT</button>
          <Link href="/settings/migration" className={buttonVariants({ variant: "outline", size: "sm" })}><DatabaseBackup className="size-3.5" />Migración V1</Link>
        </div>
      </SettingsSection>
    </div>
  </div>;
}

function SettingsSection({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-border bg-card p-5"><div className="flex items-center gap-2"><Icon className="size-4 text-primary" /><h2 className="font-semibold">{title}</h2></div><div className="mt-4 divide-y divide-border">{children}</div></section>;
}

function SettingRow({ title, detail, badge }: { title: string; detail: string; badge: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 py-3"><div><div className="text-sm font-medium">{title}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><Badge variant="outline">{badge}</Badge></div>;
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-4 text-sm text-muted-foreground">{text}</p>;
}
