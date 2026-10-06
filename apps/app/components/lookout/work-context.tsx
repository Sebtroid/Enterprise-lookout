"use client";

import { Badge } from "@crm/ui/components/badge";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { LookoutContext } from "@crm/ui/components/lookout";
import {
	NativeSelect,
	NativeSelectOption,
} from "@crm/ui/components/native-select";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { Editor, value } from "./editor";
import { useLookout } from "./use-lookout";

export function WorkContext() {
	const { data, execute, error } = useLookout();
	const router = useRouter();
	const url = useWorkspaceUrl();
	const params = useSearchParams();

	if (error) {
		return (
			<LookoutContext>
				<p role="alert">No se pudo cargar el trabajo: {error.message}</p>
			</LookoutContext>
		);
	}

	if (!data) {
		return (
			<LookoutContext>
				<p role="status">Cargando tus trabajos…</p>
			</LookoutContext>
		);
	}

	const owner = params.get("person") || data.userId;
	const ownSection = owner === data.userId;
	const selectedWork = data.selectedWork;

	const change = (person: string, work?: string) => {
		const next = new URLSearchParams({ person });
		if (work) next.set("work", work);
		router.push(`${url("/")}?${next.toString()}`);
	};

	return (
		<LookoutContext>
			<div>
				<Field>
					<FieldLabel htmlFor="lookout-person">Sección</FieldLabel>
					<NativeSelect
						id="lookout-person"
						value={owner}
						onChange={(event) => change(event.target.value)}
					>
						{data.users.map((user) => (
							<NativeSelectOption key={user.id} value={user.id}>
								{user.id === data.userId
									? "Mi sección"
									: `Sección de ${user.name}`}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
			</div>
			<div>
				<Field>
					<FieldLabel htmlFor="lookout-work">Trabajo actual</FieldLabel>
					<NativeSelect
						id="lookout-work"
						value={selectedWork?.id ?? ""}
						disabled={data.workAreas.length === 0}
						onChange={(event) => change(owner, event.target.value)}
					>
						{data.workAreas.length === 0 && (
							<NativeSelectOption value="">
								Sin trabajos todavía
							</NativeSelectOption>
						)}
						{data.workAreas.map((work) => (
							<NativeSelectOption key={work.id} value={work.id}>
								{`${work.name} · ${work.organization}`}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
			</div>
			{ownSection ? (
				<>
					<Editor
						title="Nuevo trabajo"
						fields={[
							{ name: "name", label: "Nombre del trabajo", required: true },
							{ name: "organization", label: "Organización", required: true },
							{ name: "description", label: "Descripción", type: "textarea" },
						]}
						onSave={async (form) => {
							const result = await execute({
								action: "createWork",
								data: {
									name: value(form, "name"),
									organization: value(form, "organization"),
									description: value(form, "description"),
								},
							});
							change(data.userId, result.id);
						}}
					/>
					{selectedWork && (
						<Editor
							title="Editar trabajo"
							fields={[
								{
									name: "name",
									label: "Nombre del trabajo",
									required: true,
									value: selectedWork.name,
								},
								{
									name: "organization",
									label: "Organización",
									required: true,
									value: selectedWork.organization,
								},
								{
									name: "description",
									label: "Descripción",
									type: "textarea",
									value: selectedWork.description ?? "",
								},
							]}
							onSave={async (form) => {
								await execute({
									action: "updateWork",
									id: selectedWork.id,
									data: {
										name: value(form, "name"),
										organization: value(form, "organization"),
										description: value(form, "description"),
									},
								});
							}}
						/>
					)}
				</>
			) : (
				<p className="text-sm text-muted-foreground">
					Vista de consulta · solo la persona responsable puede editar
				</p>
			)}
			<Badge
				variant="outline"
				title={
					data.storage === "supabase"
						? "La información está conectada a Supabase."
						: "Esta versión usa una base de prueba local."
				}
			>
				{data.storage === "supabase"
					? "Datos conectados"
					: "Base local de prueba"}
			</Badge>
		</LookoutContext>
	);
}
