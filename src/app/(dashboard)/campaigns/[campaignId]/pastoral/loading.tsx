export default function PastoralLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-3 w-48 rounded bg-muted" />
          <div className="h-10 w-80 max-w-full rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded bg-muted" />
          <div className="h-8 w-32 rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="h-28 rounded-lg border border-border bg-card p-4" key={index}>
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="mt-4 h-7 w-16 rounded bg-muted" />
            <div className="mt-3 h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="h-96 rounded-lg border border-border bg-card" />
        <div className="h-96 rounded-lg border border-border bg-card" />
      </div>
    </div>
  );
}
