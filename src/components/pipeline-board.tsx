import { Building2 } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { AppCompany } from "@/lib/prospecting/demo-data";

const COLUMNS = [
  "qualified",
  "ready_to_draft",
  "draft_ready",
  "approved_to_send",
  "sent",
  "replied",
  "followup_due",
] as const;

export function PipelineBoard({ companies }: { companies: AppCompany[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-7">
      {COLUMNS.map((status) => {
        const items = companies.filter((company) => company.status === status);

        return (
          <section
            key={status}
            className="min-h-64 rounded-lg border border-border bg-background p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <StatusBadge status={status} />
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-3">
              {items.map((company) => (
                <article
                  key={company.id}
                  className="rounded-md border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {company.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {company.industry}
                      </div>
                    </div>
                  </div>
                  <Progress value={company.fitScore} className="mt-3 h-1.5" />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Fit {company.fitScore}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
