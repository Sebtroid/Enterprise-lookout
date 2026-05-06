import { notFound } from "next/navigation";

import { TasksView } from "@/features/prospecting/views";
import { hasCampaignScope } from "@/lib/prospecting/repository";

export const dynamic = "force-dynamic";

export default async function CampaignTasksPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  if (!(await hasCampaignScope(campaignId))) {
    notFound();
  }

  return <TasksView scope={campaignId} />;
}
