import { Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function ContactsPage() { const { contacts } = await getV2WorkspaceSnapshot(); return <div className="space-y-8"><PageHeader eyebrow="Base compartida" title="Contactos" /><div className="relative max-w-xl"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar persona, empresa, cargo o email" /></div><section className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{contacts.map((contact) => <Link href={`/contacts/${contact.id}`} key={contact.id} className="grid gap-3 p-4 transition-colors hover:bg-muted/50 md:grid-cols-[1fr_1fr_.8fr_.9fr] md:items-center"><div><strong className="text-sm">{contact.name}</strong><p className="mt-1 text-xs text-muted-foreground">{contact.role}</p></div><div><div className="text-sm">{contact.company}</div><div className="mt-1 text-xs text-muted-foreground">{contact.email}</div></div><div><Badge variant="outline" className="gap-1"><ShieldCheck className="size-3" />{contact.quality}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{contact.evidence}</p></div><div className="text-sm"><span className="text-xs text-muted-foreground">Última interacción</span><p className="mt-1">{contact.lastInteraction}</p></div></Link>)}</section></div>; }
import Link from "next/link";
