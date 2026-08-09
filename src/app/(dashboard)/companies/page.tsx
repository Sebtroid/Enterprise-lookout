import { PageHeader } from "@/components/page-header";
import { CompaniesDirectory } from "@/components/v2/companies-directory";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const { companies } = await getV2WorkspaceSnapshot();
  return <div className="space-y-8"><PageHeader eyebrow="Conocimiento maestro" title="Empresas" /><CompaniesDirectory companies={companies} /></div>;
}
