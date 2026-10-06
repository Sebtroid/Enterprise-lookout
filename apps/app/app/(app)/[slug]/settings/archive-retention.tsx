"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ArchiveRetention() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const daysId = useId();
	const [draft, setDraft] = useState("");

	const retention = useQuery(trpc.settings.archiveRetention.queryOptions());

	useEffect(() => {
		if (retention.data) setDraft(String(retention.data.days));
	}, [retention.data]);

	const save = useMutation(
		trpc.settings.setArchiveRetention.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success("Plazo de conservación guardado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!retention.data) return null;

	const days = Number.parseInt(draft, 10);
	const unchanged = days === retention.data.days;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Registros archivados</CardTitle>
				<CardDescription>
					Los registros archivados se ocultan y se eliminan definitivamente al
					cumplir este plazo.
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						form="archive-retention"
						disabled={
							save.isPending ||
							unchanged ||
							draft.trim() === "" ||
							!Number.isFinite(days)
						}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Guardar
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="archive-retention"
					onSubmit={(event) => {
						event.preventDefault();
						if (!Number.isFinite(days)) {
							toast.error("Ingresa una cantidad de días.");
							return;
						}
						save.mutate({ days });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={daysId}>
								Eliminar registros archivados después de
							</FieldLabel>
							<Input
								id={daysId}
								inputMode="numeric"
								value={draft}
								disabled={save.isPending}
								onChange={(event) => setDraft(event.target.value)}
							/>
							<FieldDescription>
								Días. El plazo predeterminado es 180.
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
