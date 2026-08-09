"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";

import { V2_NAV_ITEMS } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between">
        <Link href="/today" className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          Enterprise Lookout
        </Link>
        <details className="relative">
          <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-background shadow-sm hover:bg-muted">
            <Menu className="size-4" aria-hidden="true" />
            <span className="sr-only">Abrir navegación</span>
          </summary>
          <nav aria-label="Navegación móvil" className="absolute right-0 mt-2 grid w-64 gap-1 rounded-lg border border-border bg-popover p-2 text-sm shadow-xl">
            {V2_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground")}>
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </details>
      </div>
    </div>
  );
}
