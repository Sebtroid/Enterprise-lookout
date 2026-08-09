import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function assertProjectWriteAccessForUser(projectId: string, userId: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase no está configurado");
  const { data: project } = await admin.from("projects").select("id,workspace_id,owner_user_id,access_mode").eq("id", projectId).maybeSingle();
  if (!project) throw new Error("Proyecto no encontrado");
  const { data: workspaceMember } = await admin.from("workspace_members").select("status").eq("workspace_id", project.workspace_id).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!workspaceMember) throw new Error("Usuario fuera del workspace");
  if (project.owner_user_id === userId || project.access_mode === "shared") return project;
  const { data: projectMember } = await admin.from("project_members").select("can_edit").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (!projectMember?.can_edit) throw new Error("El usuario no puede modificar este proyecto personal");
  return project;
}

export async function assertWorkspaceRow(table: string, id: string, workspaceId: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase no está configurado");
  const { data } = await admin.from(table).select("id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) throw new Error("Referencia fuera del workspace");
}
