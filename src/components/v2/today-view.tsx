"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, FlaskConical, Inbox, ListChecks, MailCheck, Users } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/v2/empty-state";
import { SegmentedControl } from "@/components/v2/segmented-control";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { V2AttentionItem, V2WorkspaceSnapshot } from "@/lib/v2/types";

const itemIcons = { approval: MailCheck, reply: Inbox, research: FlaskConical, followup: Clock3, task: ListChecks };
const kindLabels = { approval: "Aprobación", reply: "Respuesta", research: "Investigación", followup: "Follow-up", task: "Tarea" };

export function TodayView({ snapshot }: { snapshot: V2WorkspaceSnapshot }) {
  const [scope, setScope] = useState("mine");
  const attention = snapshot.attention.filter((item) => {
    if (scope === "mine") return item.owner === snapshot.currentUser;
    if (scope === "shared") return snapshot.projects.some((project) => project.name === item.project && project.accessMode === "shared");
    return item.owner === scope;
  });
  const replyCount = attention.filter((item) => item.kind === "reply").length;
  const approvalCount = attention.filter((item) => item.kind === "approval").length;
  const researchCount = attention.filter((item) => item.kind === "research").length;
  const today = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeZone: "America/Santiago",
  }).format(new Date());
  const budgetPercent = snapshot.aiBudget.limitUsd > 0
    ? Math.min(100, (snapshot.aiBudget.spentUsd / snapshot.aiBudget.limitUsd) * 100)
    : 100;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={`${snapshot.workspaceName} · ${today}`} title={`Hola, ${snapshot.currentUser}`}>
        <Link href="/projects/new" className={buttonVariants()}>Nuevo proyecto</Link>
      </PageHeader>

      <section aria-label="Resumen de atención" className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Inbox} label="Respuestas nuevas" value={replyCount} detail="requieren contexto" />
        <Metric icon={MailCheck} label="Primeros correos" value={approvalCount} detail="esperan aprobación" />
        <Metric icon={FlaskConical} label="Investigaciones" value={researchCount} detail="listas para revisar" />
        <Metric icon={Users} label="Empresas activas" value={snapshot.companies.length} detail="en el workspace" />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.7fr)]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Lo que requiere atención</h2>
              <p className="mt-1 text-sm text-muted-foreground">Ordenado por urgencia y contexto disponible.</p>
            </div>
            <SegmentedControl
              label="Filtrar atención"
              value={scope}
              options={[
                { value: "mine", label: "Lo mío" },
                { value: "shared", label: "Compartidos" },
                ...snapshot.teammates.map((teammate) => ({ value: teammate, label: teammate })),
              ]}
              onChange={setScope}
            />
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {attention.length > 0 ? attention.map((item) => <AttentionRow key={item.id} item={item} />) : <EmptyState title="No hay pendientes en este filtro" description="Cambia de vista para revisar la atención del resto del equipo." />}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-base font-semibold">Estado del equipo</h2>
            <div className="mt-4 space-y-4">
              <TeamRow initials={initials(snapshot.currentUser)} name={snapshot.currentUser} detail="Tu actividad y pendientes" active />
              {snapshot.teammates.map((teammate) => <TeamRow key={teammate} initials={initials(teammate)} name={teammate} detail="Actividad compartida" />)}
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Bibliotecario IA</h2>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Disponible</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">USD {snapshot.aiBudget.spentUsd.toFixed(2)} de USD {snapshot.aiBudget.limitUsd.toFixed(2)} este mes.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${budgetPercent}%` }} /></div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-600" />No hay jobs fallidos.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "EL";
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Inbox; label: string; value: number; detail: string }) {
  return <div className="bg-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" />{label}</div><div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function AttentionRow({ item }: { item: V2AttentionItem }) {
  const Icon = itemIcons[item.kind];
  return (
    <Link href={item.href} className="group grid gap-3 p-4 transition-colors hover:bg-muted/60 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="size-4" /></span>
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.title}</strong><Badge variant="outline" className="text-[11px]">{kindLabels[item.kind]}</Badge></span><span className="mt-1 block text-sm text-muted-foreground">{item.detail}</span><span className="mt-1 block text-xs text-muted-foreground">{item.project} · {item.owner} · {item.due}</span></span>
      <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}

function TeamRow({ initials, name, detail, active = false }: { initials: string; name: string; detail: string; active?: boolean }) {
  return <div className="flex items-center gap-3"><span className={cn("flex size-9 items-center justify-center rounded-full text-xs font-semibold", active ? "bg-primary text-primary-foreground" : "bg-muted")}>{initials}</span><div><div className="text-sm font-medium">{name}</div><div className="text-xs text-muted-foreground">{detail}</div></div></div>;
}
