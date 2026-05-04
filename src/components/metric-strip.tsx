import { cn } from "@/lib/utils";

export function MetricStrip({
  metrics,
}: {
  metrics: { label: string; value: string | number; tone?: string }[];
}) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-border bg-background sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="border-b border-r border-border p-4 last:border-r-0 sm:even:border-r-0 lg:even:border-r lg:last:border-r-0"
        >
          <div className="text-xs font-medium text-muted-foreground">
            {metric.label}
          </div>
          <div
            className={cn(
              "mt-2 text-2xl font-semibold tracking-tight",
              metric.tone,
            )}
          >
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}
