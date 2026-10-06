import { Suspense } from "react";
import { AgentBuilderHome } from "@/components/agent-builder/agent-builder-home";
import { AgentBuilderHomeFallback } from "@/components/agent-builder/agent-builder-route-fallback";
import { requireSession } from "@/lib/session";

export default function OperationsPage() {
	return (
		<Suspense fallback={<AgentBuilderHomeFallback />}>
			<OperationsHome />
		</Suspense>
	);
}

async function OperationsHome() {
	const session = await requireSession();
	return <AgentBuilderHome name={session.user.name} />;
}
