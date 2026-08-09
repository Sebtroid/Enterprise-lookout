import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function CompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const [{ companyId }, snapshot] = await Promise.all([params, getV2WorkspaceSnapshot()]);
  const company = snapshot.companies.find((item) => item.id === companyId);
  if (!company) notFound();
  const contacts = snapshot.contacts.filter((item) => item.company === company.name);
  return <div className="space-y-6"><Link href="/companies" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Empresas</Link><header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold">{company.name}</h1><Badge variant="outline">{company.factStatus}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{company.industry} · {company.domain}</p></div><a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>Sitio oficial<ExternalLink className="size-4" /></a></header><div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Hechos y evidencia</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><Fact label="Dominio" value={company.domain} status={company.factStatus} /><Fact label="Industria" value={company.industry} status={company.factStatus} /><Fact label="Fit actual" value={String(company.fitScore)} status="calculado" /><Fact label="Siguiente acción" value={company.nextAction} status="operativo" /></dl><p className="mt-5 text-xs text-muted-foreground">Los cambios investigados se guardan como revisiones; un valor verificado no se reemplaza silenciosamente.</p></section><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Contactos</h2><div className="mt-3 divide-y divide-border">{contacts.length ? contacts.map((contact) => <Link href={`/contacts/${contact.id}`} key={contact.id} className="block py-3"><div className="text-sm font-medium">{contact.name}</div><div className="mt-1 text-xs text-muted-foreground">{contact.role} · {contact.quality}</div></Link>) : <p className="py-4 text-sm text-muted-foreground">Aún no hay un contacto confiable.</p>}</div></section></div><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Historial transversal</h2><p className="mt-2 text-sm text-muted-foreground">Proyectos relacionados: {company.projectNames.join(" · ") || "ninguno"}.</p></section></div>;
}
function Fact({ label, value, status }: { label: string; value: string; status: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd><dd className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="size-3" />{status}</dd></div>; }
