import { notFound } from "next/navigation";
import { ProjectRoom } from "@/components/v2/project-room";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ projectId }, query, snapshot] = await Promise.all([params, searchParams, getV2WorkspaceSnapshot()]);
  const project = snapshot.projects.find((item) => item.id === projectId);
  if (!project) notFound();
  const companies = snapshot.companies.filter((company) => company.projectNames.includes(project.name));
  return <ProjectRoom project={project} companies={companies} activeTab={query.tab ?? "summary"} />;
}
