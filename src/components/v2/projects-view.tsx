"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, LockKeyhole, Plus, Users } from "lucide-react";
import { useState } from "react";

import { SegmentedControl } from "@/components/v2/segmented-control";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { V2Project } from "@/lib/v2/types";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const teammateScopePrefix = "teammate:";

export function ProjectsView({ projects, currentUser, teammates }: { projects: V2Project[]; currentUser: string; teammates: string[] }) {
  const [scope, setScope] = useState("all");
  const filteredProjects = projects.filter((project) => {
    if (scope === "all") return true;
    if (scope === "mine") return project.ownerName === currentUser;
    if (scope === "shared") return project.accessMode === "shared";
    return scope.startsWith(teammateScopePrefix) && project.ownerName === scope.slice(teammateScopePrefix.length);
  });

  return <div className="space-y-8">
    <PageHeader eyebrow="Workspace" title="Proyectos"><Link href="/projects/new" className={buttonVariants()}><Plus className="size-4" />Nuevo proyecto</Link></PageHeader>
    <SegmentedControl
      label="Filtrar proyectos"
      value={scope}
      options={[
        { value: "all", label: "Todos" },
        { value: "mine", label: "Propios" },
        { value: "shared", label: "Compartidos" },
        ...teammates.map((teammate) => ({ value: `${teammateScopePrefix}${teammate}`, label: teammate })),
      ]}
      onChange={setScope}
    />
    <section className="grid gap-4 xl:grid-cols-2">
      {filteredProjects.map((project) => <Link href={`/projects/${project.id}`} key={project.id} className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/35">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{project.name}</h2><Badge variant="outline">{project.status === "active" ? "Activo" : "Borrador"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{project.institution}</p></div><span className="flex items-center gap-1.5 text-xs text-muted-foreground">{project.accessMode === "shared" ? <Users className="size-3.5" /> : <LockKeyhole className="size-3.5" />}{project.accessMode === "shared" ? "Compartido" : `Personal · ${project.ownerName}`}</span></div>
        <div className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-4"><ProjectMetric label="Empresas" value={String(project.companies)} /><ProjectMetric label="Comprometido" value={money.format(project.committed)} /><ProjectMetric label="Recibido" value={money.format(project.received)} /></div>
        <div className="mt-4 flex items-center justify-between gap-4"><span className="min-w-0 text-sm"><span className="text-muted-foreground">Siguiente: </span>{project.nextAction}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
        {project.eventDate ? <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(`${project.eventDate}T12:00:00-04:00`))}</p> : null}
      </Link>)}
    </section>
  </div>;
}

function ProjectMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><div className="truncate text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</div></div>; }
