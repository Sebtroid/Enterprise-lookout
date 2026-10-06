"use client";
import type { Command } from "@crm/validation/lookout";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
export function useLookout() {
	const params = useSearchParams();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const input = {
		ownerId: params.get("person") || undefined,
		workAreaId: params.get("work") || undefined,
	};
	const query = useQuery(trpc.lookout.snapshot.queryOptions(input));
	const mutation = useMutation(
		trpc.lookout.command.mutationOptions({ onSuccess: () => cache.lookout() }),
	);
	return {
		...query,
		execute: (command: Command) => mutation.mutateAsync({ command }),
		busy: mutation.isPending,
	};
}
