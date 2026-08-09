"use client";

import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { normalizeSearchText } from "@/components/v2/search";
import type { V2Contact } from "@/lib/v2/types";

export function ContactsDirectory({ contacts }: { contacts: V2Contact[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearchText(query);
  const filteredContacts = contacts.filter((contact) => [contact.name, contact.company, contact.role, contact.email]
    .some((value) => normalizeSearchText(value).includes(normalizedQuery)));

  return <div className="space-y-4">
    <div className="relative max-w-xl"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input type="search" aria-label="Buscar contactos" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar persona, empresa, cargo o email" /></div>
    {filteredContacts.length === 0 ? <section className="rounded-lg border border-border bg-muted/40 px-5 py-8 text-center"><h2 className="font-semibold">No encontramos contactos</h2><p className="mt-1 text-sm text-muted-foreground">Prueba con otro nombre, empresa, cargo o correo.</p></section> : <section className="divide-y divide-border rounded-lg border border-border bg-card">{filteredContacts.map((contact) => <Link href={`/contacts/${contact.id}`} key={contact.id} className="grid min-w-0 gap-3 p-4 transition-colors hover:bg-muted/50 md:grid-cols-[1fr_1fr_.8fr_.9fr] md:items-center"><div className="min-w-0"><strong className="break-words [overflow-wrap:anywhere] text-sm">{contact.name}</strong><p className="mt-1 break-words [overflow-wrap:anywhere] text-xs text-muted-foreground"><span className="md:hidden">Cargo: </span>{contact.role}</p></div><div className="min-w-0"><div className="break-words [overflow-wrap:anywhere] text-sm"><span className="md:hidden text-muted-foreground">Empresa: </span>{contact.company}</div><div className="mt-1 break-words [overflow-wrap:anywhere] text-xs text-muted-foreground"><span className="md:hidden">Correo: </span>{contact.email}</div></div><div className="min-w-0"><Badge variant="outline" className="w-fit gap-1"><ShieldCheck className="size-3" />{contact.quality}</Badge><p className="mt-1 break-words [overflow-wrap:anywhere] text-[11px] text-muted-foreground"><span className="md:hidden">Evidencia: </span>{contact.evidence}</p></div><div className="min-w-0 break-words [overflow-wrap:anywhere] text-sm"><span className="text-xs text-muted-foreground">{"\u00daltima interacci\u00f3n"}</span><p className="mt-1">{contact.lastInteraction}</p></div></Link>)}</section>}
  </div>;
}
