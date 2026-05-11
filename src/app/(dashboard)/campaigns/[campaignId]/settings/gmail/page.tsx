import { notFound } from "next/navigation";

import { GmailSettingsView } from "@/features/prospecting/views";
import { hasCampaignScope } from "@/lib/prospecting/repository";

export const dynamic = "force-dynamic";

export default async function CampaignGmailSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaignId } = await params;
  const query = await searchParams;
  if (!(await hasCampaignScope(campaignId))) {
    notFound();
  }

  return (
    <GmailSettingsView
      status={{
        connected: firstQueryValue(query.gmail_connected),
        email: firstQueryValue(query.gmail_email),
        error: firstQueryValue(query.gmail_error),
      }}
    />
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
