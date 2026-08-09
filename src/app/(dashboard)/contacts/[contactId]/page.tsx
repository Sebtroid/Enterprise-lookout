import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const [{ contactId }, snapshot] = await Promise.all([params, getV2WorkspaceSnapshot()]);
  const contact = snapshot.contacts.find((item) => item.id === contactId);
  if (!contact) notFound();
  const threads = snapshot.threads.filter((item) => item.contact === contact.name);
  return <div className="space-y-6"><Link href="/contacts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Contactos</Link><header className="border-b border-border pb-5"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold">{contact.name}</h1><Badge variant="outline"><ShieldCheck className="size-3" />{contact.quality}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{contact.role} · {contact.company}</p></header><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Datos de contacto</h2><dl className="mt-4 space-y-4"><div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 flex items-center gap-2 text-sm"><Mail className="size-4" />{contact.email}</dd></div><div><dt className="text-xs text-muted-foreground">Teléfono</dt><dd className="mt-1 flex items-center gap-2 text-sm"><Phone className="size-4" />{contact.phone ?? "No disponible"}</dd></div><div><dt className="text-xs text-muted-foreground">Evidencia</dt><dd className="mt-1 text-sm">{contact.evidence}</dd></div></dl></section><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Calidad como decisor</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Estado actual: {contact.quality}. Las respuestas, derivaciones, rebotes y confirmaciones actualizan esta evaluación sin borrar su historial.</p></section></div><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Conversaciones</h2><div className="mt-3 divide-y divide-border">{threads.length ? threads.map((thread) => <Link href={`/mail?thread=${thread.id}`} key={thread.id} className="block py-3"><div className="text-sm font-medium">{thread.subject}</div><div className="mt-1 text-xs text-muted-foreground">{thread.project} · {thread.receivedAt}</div></Link>) : <p className="py-4 text-sm text-muted-foreground">No hay conversaciones vinculadas.</p>}</div></section></div>;
}
