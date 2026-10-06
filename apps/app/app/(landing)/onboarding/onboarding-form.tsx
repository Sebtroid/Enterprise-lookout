"use client";

import { workspaceSlug } from "@crm/db/workspace";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function OnboardingForm({ placeholder }: { placeholder: string }) {
	const trpc = useTRPC();
	const router = useRouter();

	const nameId = useId();
	const websiteId = useId();
	const [name, setName] = useState(placeholder);

	const save = useMutation(
		trpc.workspace.update.mutationOptions({
			onSuccess: () => {
				router.refresh();
				router.replace("/");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();

				const form = new FormData(event.currentTarget);

				save.mutate({
					name: String(form.get("name") ?? "").trim(),
					slug: workspaceSlug(String(form.get("name") ?? "")),
					website: String(form.get("website") ?? "").trim(),
				});
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={nameId}>Nombre del espacio</FieldLabel>
					<Input
						id={nameId}
						name="name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={placeholder}
						autoComplete="organization"
						autoFocus
						required
					/>
					<FieldDescription>
						Cada trabajo tendrá sus propios eventos y presupuesto.
					</FieldDescription>
				</Field>

				<details>
					<summary className="cursor-pointer text-muted-foreground text-sm">
						Agregar un sitio web (opcional)
					</summary>
					<Field>
						<FieldLabel htmlFor={websiteId}>Sitio web</FieldLabel>
						<InputGroup>
							<InputGroupAddon>
								<InputGroupText>https://</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput
								id={websiteId}
								name="website"
								placeholder="tu-organizacion.cl"
								autoComplete="off"
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								inputMode="url"
							/>
						</InputGroup>
						<FieldDescription>
							También puedes agregarlo después en Configuración.
						</FieldDescription>
					</Field>
				</details>
			</FieldGroup>

			<Button type="submit" disabled={save.isPending}>
				{save.isPending ? <Spinner data-icon="inline-start" /> : null}
				Abrir Lookout
			</Button>
		</form>
	);
}
