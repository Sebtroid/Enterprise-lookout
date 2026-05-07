import type { ReactNode } from "react";

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-full bg-muted/80 shadow-sm shadow-background/40 ${className}`}
    />
  );
}

function SkeletonPanel({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/80 bg-card/70 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function DashboardLoading({
  title = "Cargando workspace",
}: {
  title?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={title}
      className="space-y-6 motion-safe:animate-pulse"
    >
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <SkeletonLine className="h-3 w-36" />
          <SkeletonLine className="h-8 w-64 rounded-lg" />
        </div>
        <SkeletonLine className="h-10 w-36 rounded-md" />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonPanel key={index} className="h-24 p-4">
            <SkeletonLine className="h-3 w-28" />
            <SkeletonLine className="mt-4 h-7 w-12 rounded-md" />
          </SkeletonPanel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SkeletonPanel className="h-64 xl:col-span-2" />
        <SkeletonPanel className="h-64" />
      </div>
    </div>
  );
}
