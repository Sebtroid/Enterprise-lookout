import { Suspense } from "react";
import { LookoutBoard } from "@/components/lookout/board";

export default function EventsPage() {
	return (
		<Suspense fallback={<p>Cargando eventos…</p>}>
			<LookoutBoard />
		</Suspense>
	);
}
