"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Bot,
  ContactRound,
  FileDown,
  Inbox,
  LayoutDashboard,
  Mail,
  MailCheck,
  Send,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "", label: "Resumen", icon: LayoutDashboard },
  { path: "/pipeline", label: "Pipeline", icon: LayoutDashboard },
  { path: "/companies", label: "Empresas", icon: Building2 },
  { path: "/contacts", label: "Contactos", icon: ContactRound },
  { path: "/imports", label: "Imports", icon: FileDown },
  { path: "/review/outbound", label: "Mails", icon: Send },
  { path: "/review/replies", label: "Respuestas", icon: Inbox },
  { path: "/tasks", label: "Dom", icon: Bot },
  { path: "/settings/senders", label: "Remitentes", icon: MailCheck },
  { path: "/settings/gmail", label: "Gmail", icon: Mail },
];

export function AppSidebar() {
  const pathname = usePathname();
  const scope = getScopeFromPath(pathname);
  const baseHref = `/campaigns/${scope}`;

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-border/80 bg-sidebar/95 px-4 py-5 lg:block">
      <div className="flex h-full flex-col">
        <Link href="/campaigns" className="flex items-center gap-3 px-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Settings className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Prospección</div>
            <div className="text-xs text-muted-foreground">Auspicios</div>
          </div>
        </Link>

        <div className="mt-6 grid gap-2">
          {/* Use a plain document navigation here so the project picker remains reachable even during RSC route transitions. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/campaigns"
            className="block rounded-lg border border-sidebar-border bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/25 hover:bg-background hover:text-foreground active:scale-[0.99]"
          >
            Cambiar proyecto
          </a>
          <Link
            href="/campaigns/all"
            className="block rounded-lg border border-sidebar-border bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/25 hover:bg-background hover:text-foreground active:scale-[0.99]"
          >
            Ver todo
          </Link>
        </div>

        <nav className="mt-8 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const href = `${baseHref}${item.path}`;
            const active = item.path
              ? pathname.startsWith(href)
              : pathname === href;

            return (
              <Link
                key={item.path || "summary"}
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-[0.99]",
                  active &&
                    "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-sidebar-border",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-sidebar-border bg-background/70 p-3 text-xs leading-5 text-muted-foreground shadow-sm">
          <div className="font-medium text-foreground">Workspace privado</div>
          <div className="mt-1">Proyectos, contactos y aprobaciones.</div>
        </div>
      </div>
    </aside>
  );
}

function getScopeFromPath(pathname: string) {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (first === "campaigns" && second) return second;
  return "all";
}
