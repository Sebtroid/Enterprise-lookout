"use client";

import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { normalizeSearchText } from "@/components/v2/search";
import type { V2Company } from "@/lib/v2/types";

export function CompaniesDirectory({ companies }: { companies: V2Company[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearchText(query);
  const filteredCompanies = companies.filter((company) => [company.name, company.domain, company.industry, company.contactName ?? "", ...company.projectNames]
    .some((value) => normalizeSearchText(value).includes(normalizedQuery)));

  return <div className="space-y-4">
    <div className="relative max-w-xl"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input type="search" aria-label="Buscar empresas" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar por empresa, dominio o industria" /></div>
    {filteredCompanies.length === 0 ? <section className="rounded-lg border border-border bg-muted/40 px-5 py-8 text-center"><h2 className="font-semibold">No encontramos empresas</h2><p className="mt-1 text-sm text-muted-foreground">Prueba con otro nombre, dominio, industria, contacto o proyecto.</p></section> : <section className="overflow-hidden rounded-lg border border-border bg-card"><div className="hidden grid-cols-[1.2fr_.8fr_.6fr_.8fr_1fr_auto] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground md:grid"><span>Empresa</span><span>Contacto clave</span><span>Calidad</span><span>Proyectos</span><span>{"Siguiente acci\u00f3n"}</span><span>Fit</span></div>{filteredCompanies.map((company) => <Link href={`/companies/${company.id}`} key={company.id} className="grid gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/50 md:grid-cols-[1.2fr_.8fr_.6fr_.8fr_1fr_auto] md:items-center md:gap-4"><div className="min-w-0"><strong className="text-sm">{company.name}</strong><p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">{company.domain}<ExternalLink className="size-3" /></p></div><div className="text-sm"><span className="md:hidden text-muted-foreground">Contacto: </span>{company.contactName ?? "Sin contacto"}</div><Badge variant="outline" className="w-fit">{company.contactQuality}</Badge><div className="text-xs text-muted-foreground"><span className="md:hidden">Proyectos: </span>{company.projectNames.join(" \u00b7 ")}</div><div className="text-sm"><span className="md:hidden text-muted-foreground">{"Siguiente acci\u00f3n: "}</span>{company.nextAction}</div><Badge variant="outline" className="w-fit border-primary/30 text-primary">{company.fitScore}</Badge></Link>)}</section>}
  </div>;
}
