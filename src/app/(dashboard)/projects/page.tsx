import { ProjectsView } from "@/components/v2/projects-view";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function ProjectsPage() { const snapshot = await getV2WorkspaceSnapshot(); return <ProjectsView projects={snapshot.projects} currentUser={snapshot.currentUser} teammates={snapshot.teammates} />; }
