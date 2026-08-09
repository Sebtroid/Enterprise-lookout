"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ContactRound, FolderKanban, Inbox, Radar, Settings, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export const V2_NAV_ITEMS = [
  { href: "/today", label: "Hoy", icon: Radar },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/companies", label: "Empresas", icon: Building2 },
  { href: "/contacts", label: "Contactos", icon: ContactRound },
  { href: "/mail", label: "Correo", icon: Inbox },
  { href: "/settings", label: "Configuración", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar px-4 py-5 lg:block">
      <div className="flex h-full flex-col">
        <Link href="/today" className="flex items-center gap-3 rounded-lg px-2 py-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Enterprise Lookout</div>
            <div className="text-xs text-muted-foreground">Workspace privado</div>
          </div>
        </Link>

        <nav aria-label="Navegación principal" className="mt-8 space-y-1">
          {V2_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-sidebar-border pt-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">SB</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Sebastián</div>
              <div className="truncate text-xs text-muted-foreground">Cuenta personal</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
