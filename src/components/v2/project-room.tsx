import Link from "next/link";
import { ArrowLeft, CalendarDays, ExternalLink, LockKeyhole, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { V2Company, V2Project } from "@/lib/v2/types";
import { FinancePanel } from "@/components/v2/finance-panel";
import { ResearchPanel } from "@/components/v2/research-panel";
import { EmptyState } from "@/components/v2/empty-state";

const tabs = ["summary", "research", "companies", "mail", "finance", "files", "activity"] as const;
type ProjectTab = (typeof tabs)[number];
const labels = { summary: "Resumen", research: "Investigación", companies: "Empresas", mail: "Correo", finance: "Finanzas", files: "Archivos / Enlaces", activity: "Actividad" };

export function ProjectRoom({ project, companies, activeTab }: { project: V2Project; companies: V2Company[]; activeTab: string }) {
  const tab: ProjectTab = tabs.includes(activeTab as ProjectTab) ? activeTab as ProjectTab : "summary";
  const finance = { goal: project.goal, committed: project.committed, received: project.received, inKind: 0, expenses: 0, netReceived: project.received, remaining: Math.max(0, project.goal - project.committed) };
  return <div className="space-y-6">
    <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Volver a proyectos</Link>
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{project.status === "active" ? "Activo" : project.status === "paused" ? "Pausado" : "Borrador"}</Badge></div><p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"><span>{project.institution}</span><span className="flex items-center gap-1.5">{project.accessMode === "shared" ? <Users className="size-3.5" /> : <LockKeyhole className="size-3.5" />}{project.accessMode === "shared" ? "Compartido" : `Personal · ${project.ownerName}`}</span>{project.eventDate ? <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(`${project.eventDate}T12:00:00-04:00`))}</span> : null}</p></div>
      <Link href="/mail" className={buttonVariants({ variant: "outline" })}>Abrir correo <ExternalLink className="size-4" /></Link>
    </header>
    <nav aria-label="Secciones del proyecto" className="project-tab-strip flex gap-1 overflow-x-auto border-b border-border pb-2">{tabs.map((item) => <Link key={item} href={`/projects/${project.id}?tab=${item}`} aria-current={tab === item ? "page" : undefined} className={`shrink-0 rounded-sm border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{labels[item]}</Link>)}</nav>
    <div className="min-w-0">
      <ProjectTabContent tab={tab} project={project} companies={companies} finance={finance} />
    </div>
  </div>;
}

function ProjectTabContent({ tab, project, companies, finance }: { tab: ProjectTab; project: V2Project; companies: V2Company[]; finance: { goal: number; committed: number; received: number; inKind: number; expenses: number; netReceived: number; remaining: number } }) {
  switch (tab) {
    case "summary":
      return <SummaryPanel project={project} companies={companies} />;
    case "research":
      return <ResearchPanel projectId={project.id} />;
    case "companies":
      return <CompaniesPanel companies={companies} />;
    case "mail":
      return <EmptyState title="El correo del proyecto aparecerá aquí" description="La bandeja unificada aún no ofrece una vista filtrada por proyecto." action={<Link href="/mail" className={buttonVariants({ variant: "outline" })}>Abrir correo</Link>} />;
    case "finance":
      return <FinancePanel projectId={project.id} initial={finance} />;
    case "files":
      return <EmptyState title="Los archivos y enlaces aparecerán aquí" description="Todavía no hay archivos ni enlaces asociados a este proyecto." />;
    case "activity":
      return <EmptyState title="La actividad aparecerá aquí" description="Cuando existan eventos del proyecto, podrás revisarlos en orden cronológico." />;
  }
}

function SummaryPanel({ project, companies }: { project: V2Project; companies: V2Company[] }) { return <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]"><section className="rounded-lg border border-border bg-card p-5"><h2 className="text-lg font-semibold">Siguiente mejor acción</h2><p className="mt-2 text-sm text-muted-foreground">{project.nextAction}. La investigación profunda solo se ejecutará después de una aprobación explícita.</p><Link href={`/projects/${project.id}?tab=research`} className={buttonVariants({ className: "mt-5" })}>Revisar investigación</Link><div className="mt-7 border-t border-border pt-5"><h3 className="text-sm font-semibold">Pipeline de empresas</h3><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><SmallMetric label="Identificadas" value={String(companies.length)} /><SmallMetric label="Verificadas" value={String(companies.filter((item) => ["verified", "confirmed"].includes(item.factStatus)).length)} /><SmallMetric label="Con contacto" value={String(companies.filter((item) => item.contactName).length)} /><SmallMetric label="Respondieron" value={String(companies.filter((item) => ["respondió", "decisor"].includes(item.contactQuality)).length)} /></div></div></section><aside className="rounded-lg border border-border bg-card p-5"><h2 className="text-base font-semibold">Contexto del proyecto</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-muted-foreground">Institución</dt><dd className="mt-1 font-medium">{project.institution}</dd></div><div><dt className="text-muted-foreground">Fecha</dt><dd className="mt-1 font-medium">{project.eventDate ?? "Por confirmar"}</dd></div><div><dt className="text-muted-foreground">Siguiente acción</dt><dd className="mt-1 font-medium">{project.nextAction}</dd></div><div><dt className="text-muted-foreground">Acceso</dt><dd className="mt-1 font-medium">{project.accessMode === "shared" ? "Trabajo compartido" : `Personal de ${project.ownerName}`}</dd></div></dl></aside></div>; }
function CompaniesPanel({ companies }: { companies: V2Company[] }) { return <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{companies.map((company) => <div key={company.id} className="grid min-w-0 gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><strong className="break-words text-sm [overflow-wrap:anywhere]">{company.name}</strong><p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{company.nextAction}</p></div><span className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{company.contactName ?? "Sin contacto"}</span><Badge variant="outline">Fit {company.fitScore}</Badge></div>)}</div>; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>; }
