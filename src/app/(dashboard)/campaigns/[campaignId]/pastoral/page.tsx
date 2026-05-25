import { notFound } from "next/navigation";

import { PastoralFundraisingView } from "@/features/pastoral/view";
import { PASTORAL_CAMPAIGN_SLUG } from "@/lib/pastoral/config";
import { hasCampaignScope } from "@/lib/prospecting/repository";

export const dynamic = "force-dynamic";

export default async function CampaignPastoralPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  if (campaignId !== PASTORAL_CAMPAIGN_SLUG || !(await hasCampaignScope(campaignId))) {
    notFound();
  }

  return <PastoralFundraisingView scope={campaignId} />;
}
