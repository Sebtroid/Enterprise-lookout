import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Archive, ArrowLeft, DatabaseBackup } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getV2MigrationReview } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";

async function updateAssignment(formData: FormData) {
  "use server";
  const user = await getAllowedUser();
  if (!user) throw new Error("No autorizado");
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no está configurado");
  const projectId = String(formData.get("project_id") ?? "");
  const ownerUserId = String(formData.get("owner_user_id") ?? "");
  const institutionId = String(formData.get("institution_id") ?? "");
  if (!projectId || !ownerUserId) throw new Error("Asignación incompleta");
  const { error } = await supabase.from("projects").update({ owner_user_id: ownerUserId, institution_id: institutionId || null }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/migration");
}

export default async function MigrationReviewPage() {
  const review = await getV2MigrationReview();
  return <div className="space-y-8">
    <PageHeader eyebrow="Corte controlado" title="Revisión de migración V1">
      <Link href="/settings" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="size-4" />Configuración</Link>
    </PageHeader>
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3"><DatabaseBackup className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Proyectos recuperados</h2><p className="mt-1 text-sm text-muted-foreground">Confirma propietario e institución antes del corte. RLS impedirá modificar proyectos personales ajenos.</p></div></div>
      {review.projects.length ? <div className="mt-5 space-y-3">{review.projects.map((project) => <form action={updateAssignment} key={project.id} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[minmax(12rem,1fr)_13rem_13rem_auto] md:items-end">
        <input type="hidden" name="project_id" value={project.id} />
        <div><div className="text-sm font-medium">{project.name}</div><div className="mt-1 text-xs text-muted-foreground">Estado: {project.status}</div></div>
        <label className="text-xs text-muted-foreground">Propietario<select name="owner_user_id" defaultValue={project.ownerUserId} className="mt-1 block h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground">{review.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Institución<select name="institution_id" defaultValue={project.institutionId} className="mt-1 block h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"><option value="">Sin institución</option>{review.institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
        <button className={buttonVariants({ size: "sm" })}>Guardar</button>
      </form>)}</div> : <p className="mt-5 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hay proyectos V1 pendientes de revisar.</p>}
    </section>
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2"><Archive className="size-4 text-primary" /><h2 className="font-semibold">Cuarentena consultable</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Los registros dudosos se preservan fuera de las vistas operativas; no se borran.</p>
      <div className="mt-4 flex flex-wrap gap-2">{review.quarantine.length ? review.quarantine.map((item) => <Badge key={item.reason} variant="outline">{item.reason}: {item.count}</Badge>) : <Badge variant="outline">Sin registros pendientes</Badge>}</div>
    </section>
  </div>;
}
