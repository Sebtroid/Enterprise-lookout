import {
  Building2,
  ExternalLink,
  MapPin,
  NotebookText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AppCampaign, AppCompany } from "@/lib/prospecting/demo-data";

const COLUMNS = [
  "qualified",
  "ready_to_draft",
  "draft_ready",
  "approved_to_send",
  "sent",
  "replied",
  "followup_due",
] as const;

type PipelineBoardProps = {
  campaigns: AppCampaign[];
  companies: AppCompany[];
  scopeLabel: string;
};

export function PipelineBoard({
  campaigns,
  companies,
  scopeLabel,
}: PipelineBoardProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-sm">
      <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
        <div className="grid min-w-[106rem] grid-cols-7 gap-4">
          {COLUMNS.map((status) => {
            const items = companies.filter((company) => company.status === status);

            return (
              <section
                key={status}
                className="min-h-[28rem] rounded-xl border border-border/80 bg-background/80 p-3 transition-colors duration-200 hover:bg-background"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <StatusBadge status={status} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((company, index) => (
                    <PipelineCompanyCard
                      key={company.id}
                      campaigns={campaigns}
                      company={company}
                      index={index}
                      scopeLabel={scopeLabel}
                    />
                  ))}
                  {!items.length ? (
                    <div className="rounded-lg border border-dashed border-border/80 px-3 py-8 text-center text-xs leading-5 text-muted-foreground">
                      Sin empresas en esta etapa.
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PipelineCompanyCard({
  campaigns,
  company,
  index,
  scopeLabel,
}: {
  campaigns: AppCampaign[];
  company: AppCompany;
  index: number;
  scopeLabel: string;
}) {
  const tooltipId = `pipeline-company-${company.id}`;
  const projectLabels = getCompanyProjectLabels(company, campaigns);
  const primaryNote =
    company.selectedContactReason || company.campaignNotes || company.notes;

  return (
    <article
      aria-describedby={tooltipId}
      className="group/card relative rounded-xl border border-border/90 bg-card p-3.5 shadow-sm outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
      tabIndex={0}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-5 text-foreground break-words [overflow-wrap:anywhere]">
            {company.name}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground break-words [overflow-wrap:anywhere]">
            {company.industry}
          </p>
        </div>
      </div>

      {primaryNote ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {primaryNote}
        </p>
      ) : null}

      <div className="mt-3 grid gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Fit</span>
          <span className="tabular-nums text-muted-foreground">
            {company.fitScore}/100
          </span>
        </div>
        <Progress
          value={company.fitScore}
          className="[&_[data-slot=progress-track]]:h-1.5"
        />
      </div>

      <CompanyHoverDetail
        company={company}
        projectLabels={projectLabels}
        scopeLabel={scopeLabel}
        tooltipId={tooltipId}
      />
    </article>
  );
}

function CompanyHoverDetail({
  company,
  projectLabels,
  scopeLabel,
  tooltipId,
}: {
  company: AppCompany;
  projectLabels: string[];
  scopeLabel: string;
  tooltipId: string;
}) {
  return (
    <aside
      className="pointer-events-none absolute left-3 top-[calc(100%+0.5rem)] z-30 grid w-[22rem] max-w-[calc(100vw-3rem)] translate-y-1 gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground opacity-0 shadow-xl shadow-foreground/10 ring-1 ring-foreground/5 transition-all duration-150 ease-out invisible group-hover/card:visible group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-visible/card:visible group-focus-visible/card:translate-y-0 group-focus-visible/card:opacity-100"
      id={tooltipId}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 break-words [overflow-wrap:anywhere]">
            {company.name}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {company.industry} · {company.region || "Sin región"}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          Fit {company.fitScore}
        </Badge>
      </div>

      <DetailBlock icon={Sparkles} label="Por qué puede servir">
        {company.selectedContactReason ||
          company.campaignNotes ||
          company.notes ||
          "Aún falta registrar el motivo de fit para esta empresa."}
      </DetailBlock>

      <DetailBlock icon={NotebookText} label="Empresa">
        {company.description || "Sin descripción guardada todavía."}
      </DetailBlock>

      <div className="grid gap-2 rounded-lg bg-muted/45 p-3 text-xs leading-5">
        <div>
          <span className="font-medium text-foreground">Vista actual:</span>{" "}
          <span className="text-muted-foreground">{scopeLabel}</span>
        </div>
        <div>
          <span className="font-medium text-foreground">Proyectos:</span>{" "}
          <span className="text-muted-foreground">
            {projectLabels.length ? projectLabels.join(", ") : "Sin proyecto"}
          </span>
        </div>
      </div>

      {company.futureNotes ? (
        <DetailBlock icon={MapPin} label="Nota futura">
          {company.futureNotes}
        </DetailBlock>
      ) : null}

      {company.website || company.domain ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ExternalLink className="size-3.5" />
          <span className="truncate">{company.website ?? company.domain}</span>
        </div>
      ) : null}
    </aside>
  );
}

function DetailBlock({
  children,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="text-xs leading-5 text-foreground/85 break-words [overflow-wrap:anywhere]">
        {children}
      </p>
    </div>
  );
}

export function getCompanyProjectLabels(
  company: Pick<AppCompany, "campaignIds">,
  campaigns: Pick<AppCampaign, "id" | "name">[],
) {
  return company.campaignIds.map((campaignId) => {
    const campaign = campaigns.find((item) => item.id === campaignId);
    return campaign?.name ?? campaignId;
  });
}
