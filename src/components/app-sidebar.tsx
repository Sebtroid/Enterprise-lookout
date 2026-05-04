"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ContactRound,
  FileDown,
  Inbox,
  LayoutDashboard,
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
  { path: "/settings/senders", label: "Remitentes", icon: MailCheck },
];

export function AppSidebar() {
  const pathname = usePathname();
  const scope = getScopeFromPath(pathname);
  const baseHref = `/campaigns/${scope}`;

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-border bg-sidebar px-4 py-5 lg:block">
      <div className="flex h-full flex-col">
        <Link href="/campaigns" className="flex items-center gap-3 px-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Settings className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Prospección</div>
            <div className="text-xs text-muted-foreground">Auspicios</div>
          </div>
        </Link>

        <Link
          href="/campaigns"
          className="mt-6 block rounded-md border border-sidebar-border bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Cambiar campaña
        </Link>

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
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-md border border-sidebar-border bg-background/60 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Workspace privado</div>
          <div className="mt-1">Campañas, contactos y aprobaciones.</div>
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
