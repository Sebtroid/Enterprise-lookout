import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAllowedUser } from "@/lib/auth/request";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function createProject(formData: FormData) {
  "use server";
  const user = await getAllowedUser();
  if (!user) redirect("/login");
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no está configurado");
  const name = String(formData.get("name") ?? "").trim();
  const institutionName = String(formData.get("institution") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  const accessMode = formData.get("mode") === "personal" ? "personal" : "shared";
  const brief = String(formData.get("brief") ?? "").trim();
  if (name.length < 3 || brief.length < 10) throw new Error("Completa el nombre y el objetivo del proyecto");
  const { data: membership } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("status", "active").order("joined_at", { ascending: true }).order("workspace_id", { ascending: true }).limit(1).maybeSingle();
  if (!membership) throw new Error("No perteneces a un workspace activo");
  let institutionId: string | null = null;
  if (institutionName) {
    const { data: institution, error } = await supabase.from("institutions").upsert({ workspace_id: membership.workspace_id, name: institutionName, created_by: user.id }, { onConflict: "workspace_id,name" }).select("id").single();
    if (error) throw new Error(error.message);
    institutionId = institution.id;
  }
  const baseSlug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "proyecto";
  const { data: project, error } = await supabase.from("projects").insert({ workspace_id: membership.workspace_id, owner_user_id: user.id, institution_id: institutionId, name, slug: `${baseSlug}-${randomUUID().slice(0, 8)}`, access_mode: accessMode, status: "draft", ends_on: eventDate || null, brief: { objective: brief, next_action: "Completar brief de investigación" } }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/projects/${project.id}`);
}

export default function NewProjectPage() { return <div className="mx-auto max-w-3xl space-y-8"><PageHeader eyebrow="Creación guiada" title="Nuevo proyecto" /><form action={createProject} className="space-y-6 rounded-lg border border-border bg-card p-6"><Field label="Nombre del proyecto"><Input name="name" required minLength={3} placeholder="Ej. Asado 18 de septiembre" /></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Institución"><Input name="institution" placeholder="Universidad o equipo" /></Field><Field label="Fecha tentativa"><Input name="eventDate" type="date" /></Field></div><fieldset><legend className="text-sm font-medium">Modo de colaboración</legend><div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="rounded-lg border border-primary bg-secondary/60 p-4 text-sm"><input type="radio" name="mode" value="shared" defaultChecked className="mr-2 accent-[var(--primary)]" /><strong>Compartido</strong><span className="mt-1 block text-muted-foreground">Ambos pueden editar y aprobar.</span></label><label className="rounded-lg border border-border p-4 text-sm"><input type="radio" name="mode" value="personal" className="mr-2 accent-[var(--primary)]" /><strong>Personal</strong><span className="mt-1 block text-muted-foreground">El otro miembro puede consultar.</span></label></div></fieldset><Field label="¿Qué necesitas lograr?"><textarea name="brief" required minLength={10} className="min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Describe el evento, la necesidad y qué puedes ofrecer a las marcas." /></Field><div className="flex justify-end"><Button type="submit">Crear y completar brief</Button></div></form></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium">{label}<span className="mt-2 block">{children}</span></label>; }
