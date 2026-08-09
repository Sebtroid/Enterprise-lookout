"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { V2_NAV_ITEMS } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between">
        <Link href="/today" className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          Enterprise Lookout
        </Link>
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            aria-controls="mobile-navigation"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Cerrar navegación" : "Abrir navegación"}
            onClick={() => setIsOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-background shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
          {isOpen ? <nav id="mobile-navigation" aria-label="Navegación móvil" className="absolute right-0 mt-2 grid w-64 gap-1 rounded-lg border border-border bg-popover p-2 text-sm shadow-xl">
            {V2_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setIsOpen(false)}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-muted text-foreground")}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav> : null}
        </div>
      </div>
    </div>
  );
}
