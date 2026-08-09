import { TodayView } from "@/components/v2/today-view";
import { getV2WorkspaceSnapshot } from "@/lib/v2/repository";

export const dynamic = "force-dynamic";
export default async function TodayPage() { return <TodayView snapshot={await getV2WorkspaceSnapshot()} />; }
