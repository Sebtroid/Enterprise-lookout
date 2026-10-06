"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { categories, stages } from "@crm/validation/lookout";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DetailSheetSection } from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { dateValue, Editor, type EditorField, number, value } from "./editor";

type Entity = "company" | "contact";

const verificationLabels = {
	unverified: "Sin verificar",
	verified: "Verificado",
	risky: "Requiere revisión",
	invalid: "Inválido",
} as const;

const dateInput = (date: string | null) => date?.slice(0, 10) ?? "";

export function SponsorProfile({ entity, id }: { entity: Entity; id: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { data: profile, error } = useQuery(
		trpc.lookout.profile.queryOptions({ entity, id }),
	);
	const save = useMutation(
		trpc.lookout.command.mutationOptions({
			onSuccess: () => cache.lookout(),
		}),
	);

	if (error) {
		return (
			<p role="alert">No se cargaron los datos de auspicios: {error.message}</p>
		);
	}

	if (!profile) {
		return <p role="status">Cargando datos de auspicios…</p>;
	}

	const fields: EditorField[] = [
		{
			name: "categories",
			label: "Categorías de auspicio",
			type: "multi",
			value: profile.categories,
			options: categories.map((category) => ({
				value: category,
				label: category,
			})),
		},
		{
			name: "region",
			label: "Región o cobertura",
			value: profile.region,
		},
		{
			name: "qualityRating",
			label:
				entity === "company"
					? "Calidad de la empresa (1–5)"
					: "Calidad del contacto (1–5)",
			type: "number",
			min: 1,
			max: 5,
			value: profile.qualityRating,
		},
		{
			name: "qualityNotes",
			label: "Notas sobre calidad",
			type: "textarea",
			value: profile.qualityNotes,
		},
		{
			name: "globalNotes",
			label: "Notas compartidas",
			type: "textarea",
			value: profile.globalNotes,
		},
		{
			name: "doNotContact",
			label: "Estado de contacto",
			type: "select",
			value: profile.doNotContact ? "blocked" : "allowed",
			options: [
				{ value: "allowed", label: "Se puede contactar" },
				{ value: "blocked", label: "No contactar" },
			],
		},
	];

	if (entity === "contact") {
		fields.push(
			{
				name: "contactCategory",
				label: "Categoría del contacto",
				value: profile.contactCategory,
			},
			{
				name: "isDecisionMaker",
				label: "¿Decide sobre auspicios?",
				type: "select",
				value: profile.isDecisionMaker ? "yes" : "no",
				options: [
					{ value: "no", label: "No confirmado" },
					{ value: "yes", label: "Sí" },
				],
			},
			{
				name: "source",
				label: "Fuente o enlace de verificación",
				value: profile.source,
			},
			{
				name: "verificationStatus",
				label: "Estado del correo",
				type: "select",
				value: profile.verificationStatus,
				options: Object.entries(verificationLabels).map(([value, label]) => ({
					value,
					label,
				})),
			},
			{
				name: "confidence",
				label: "Confianza en los datos (0–100 %)",
				type: "number",
				min: 0,
				max: 100,
				value: Math.round(profile.confidence * 100),
			},
			{
				name: "verifiedAt",
				label: "Última verificación",
				type: "date",
				value: dateInput(profile.verifiedAt),
			},
			{
				name: "bounceCount",
				label: "Rebotes registrados",
				type: "number",
				min: 0,
				value: profile.bounceCount,
			},
			{
				name: "lastBouncedAt",
				label: "Último rebote",
				type: "date",
				value: dateInput(profile.lastBouncedAt),
			},
		);
	}

	return (
		<>
			<DetailSheetSection
				title="Datos para auspicios"
				action={
					<Editor
						title="Editar datos de auspicios"
						description="Estos datos se comparten entre todos los trabajos y eventos."
						fields={fields}
						onSave={async (form) => {
							const selected = form.getAll("categories").map(String);
							if (
								selected.some(
									(name) => !categories.some((category) => category === name),
								)
							) {
								throw new Error("Selecciona categorías de la lista.");
							}

							const verification = value(form, "verificationStatus");
							await save.mutateAsync({
								command: {
									action: "saveProfile",
									entity,
									id,
									data: {
										...profile,
										categories: categories.filter((category) =>
											selected.includes(category),
										),
										region: value(form, "region"),
										qualityRating: number(form, "qualityRating"),
										qualityNotes: value(form, "qualityNotes"),
										globalNotes: value(form, "globalNotes"),
										doNotContact: value(form, "doNotContact") === "blocked",
										...(entity === "contact"
											? {
													source: value(form, "source"),
													contactCategory: value(form, "contactCategory"),
													bounceCount: number(form, "bounceCount"),
													confidence: number(form, "confidence") / 100,
													verifiedAt: dateValue(form, "verifiedAt"),
													lastBouncedAt: dateValue(form, "lastBouncedAt"),
													isDecisionMaker:
														value(form, "isDecisionMaker") === "yes",
													verificationStatus:
														verification === "verified" ||
														verification === "risky" ||
														verification === "invalid"
															? verification
															: "unverified",
												}
											: {}),
									},
								},
							});
							toast.success("Datos de auspicios guardados");
						}}
					/>
				}
			>
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap gap-2">
						{profile.categories.length > 0 ? (
							profile.categories.map((category) => (
								<Badge key={category} variant="secondary">
									{category}
								</Badge>
							))
						) : (
							<Badge variant="outline">Sin categoría</Badge>
						)}
						{profile.doNotContact && (
							<Badge variant="destructive">No contactar</Badge>
						)}
					</div>
					<p>
						{profile.region || "Sin región"} · Calidad {profile.qualityRating}/5
					</p>
					{profile.qualityNotes && <p>{profile.qualityNotes}</p>}
					{profile.globalNotes && (
						<p className="whitespace-pre-wrap">{profile.globalNotes}</p>
					)}
					{entity === "contact" && (
						<>
							<p>
								Correo: {verificationLabels[profile.verificationStatus]} ·
								Rebotes: {profile.bounceCount}
							</p>
							<p>
								{profile.isDecisionMaker
									? "Decide sobre auspicios"
									: "No está confirmado si decide sobre auspicios"}
							</p>
							<p>Fuente: {profile.source || "Pendiente"}</p>
							<p>
								Confianza en los datos: {Math.round(profile.confidence * 100)} %
								· {profile.contactCategory || "Sin categoría de contacto"}
							</p>
							<p>
								Última verificación:{" "}
								{profile.verifiedAt
									? new Date(profile.verifiedAt).toLocaleDateString("es-CL")
									: "Sin fecha"}
								{" · "}Último rebote:{" "}
								{profile.lastBouncedAt
									? new Date(profile.lastBouncedAt).toLocaleDateString("es-CL")
									: "Sin rebotes registrados"}
							</p>
						</>
					)}
				</div>
			</DetailSheetSection>
			<RecordUsage entity={entity} id={id} />
		</>
	);
}

function RecordUsage({ entity, id }: { entity: Entity; id: string }) {
	const [page, setPage] = useState(1);
	const trpc = useTRPC();
	const url = useWorkspaceUrl();
	const { data, error, isPending } = useQuery(
		trpc.lookout.usage.queryOptions({ entity, id, page }),
	);

	return (
		<DetailSheetSection title="Eventos y trabajos">
			<div className="flex flex-col gap-3">
				{isPending && <p role="status">Cargando historial de auspicios…</p>}
				{error && (
					<p role="alert">No se pudo cargar el historial: {error.message}</p>
				)}
				{data?.rows.map((row) => (
					<div key={row.id}>
						<Link
							href={
								url("/events") +
								"?" +
								new URLSearchParams({
									person: row.ownerId,
									work: row.workId,
									event: row.eventId,
								}).toString()
							}
						>
							{row.eventName}
						</Link>
						<p>{`${row.workName} · ${row.ownerName}`}</p>
						<Badge variant="outline">
							{stages[row.stage]}
							{row.eventStatus === "archived" ? " · Evento archivado" : ""}
						</Badge>
					</div>
				))}
				{data?.total === 0 && <p>Todavía no participa en eventos.</p>}
				{data && data.total > 20 && (
					<div className="flex gap-2">
						<Button
							variant="outline"
							disabled={page === 1}
							onClick={() => setPage(page - 1)}
						>
							Anterior
						</Button>
						<span>
							Página {page} de {Math.ceil(data.total / 20)}
						</span>
						<Button
							variant="outline"
							disabled={page * 20 >= data.total}
							onClick={() => setPage(page + 1)}
						>
							Siguiente
						</Button>
					</div>
				)}
			</div>
		</DetailSheetSection>
	);
}
