import { PageHeader } from "@/components/page-header";
import { SettingsWorkspace } from "@/components/v2/settings-workspace";
import { getV2SettingsSnapshot, getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [snapshot, settings] = await Promise.all([getV2WorkspaceSnapshot(), getV2SettingsSnapshot()]);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Workspace privado" title="Configuración" />
      <SettingsWorkspace settings={settings} budget={snapshot.aiBudget} isDemo={settings.isDemo} />
    </div>
  );
}
