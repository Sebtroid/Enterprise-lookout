import { MailWorkspace } from "@/components/v2/mail-workspace";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function MailPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) { const [snapshot, query] = await Promise.all([getV2WorkspaceSnapshot(), searchParams]); return <MailWorkspace threads={snapshot.threads} initialThreadId={query.thread} />; }
