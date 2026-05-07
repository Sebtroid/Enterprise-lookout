"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const ITEMS = [
  ["Resumen", ""],
  ["Pipeline", "/pipeline"],
  ["Empresas", "/companies"],
  ["Contactos", "/contacts"],
  ["Imports", "/imports"],
  ["Mails", "/review/outbound"],
  ["Respuestas", "/review/replies"],
  ["Dom", "/tasks"],
  ["Remitentes", "/settings/senders"],
];

export function MobileNav() {
  const pathname = usePathname();
  const scope = getScopeFromPath(pathname);
  const baseHref = `/campaigns/${scope}`;

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between">
        <Link href="/campaigns" className="text-sm font-semibold">
          Prospección
        </Link>
        <details className="relative">
          <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background">
            <Menu className="size-4" />
            <span className="sr-only">Abrir navegación</span>
          </summary>
          <nav className="absolute right-0 mt-2 grid w-56 gap-1 rounded-md border border-border bg-popover p-2 text-sm shadow-lg">
            <Link
              href="/campaigns"
              className="rounded-md px-3 py-2 font-medium hover:bg-muted"
            >
              Cambiar proyecto
            </Link>
            <Link
              href="/campaigns/all"
              className="rounded-md px-3 py-2 font-medium hover:bg-muted"
            >
              Ver todo
            </Link>
            {ITEMS.map(([label, path]) => {
              const href = `${baseHref}${path}`;
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  className="rounded-md px-3 py-2 font-medium hover:bg-muted"
                >
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

function getScopeFromPath(pathname: string) {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (first === "campaigns" && second) return second;
  return "all";
}
