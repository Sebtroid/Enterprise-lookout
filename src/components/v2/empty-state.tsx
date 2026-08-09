import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-border bg-muted/40 px-5 py-8 text-center">
      {icon ? <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-background text-primary">{icon}</div> : null}
      <h2 className={icon ? "mt-4 font-semibold" : "font-semibold"}>{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
