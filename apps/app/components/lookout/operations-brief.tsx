"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	LookoutCard,
	LookoutGrid,
	LookoutRow,
} from "@crm/ui/components/lookout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function OperationsBrief({
	ownerId,
	workAreaId,
	eventId,
	onPrompt,
}: {
	ownerId?: string;
	workAreaId?: string;
	eventId?: string;
	onPrompt: (prompt: string) => void;
}) {
	const trpc = useTRPC();
	const url = useWorkspaceUrl();
	const queryClient = useQueryClient();
	const query = useQuery({
		...trpc.lookout.operations.queryOptions({ ownerId, workAreaId, eventId }),
		refetchInterval: 60_000,
	});
	const sync = useMutation(
		trpc.google.syncNow.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.lookout.operations.pathKey(),
				});
				toast.success("Sincronización revisada");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	if (query.isError)
		return (
			<Alert>
				<AlertTitle>No se pudo cargar tu agenda</AlertTitle>
				<AlertDescription>
					{query.error.message}
					<Button variant="ghost" onClick={() => query.refetch()}>
						Reintentar
					</Button>
				</AlertDescription>
			</Alert>
		);
	if (!query.data)
		return (
			<p role="status" className="py-4 text-muted-foreground text-sm">
				Revisando pendientes y correos…
			</p>
		);
	const { counts, tasks, inbox } = query.data;
	const pending = tasks.filter(
		(t) => t.kind === "followup" || t.kind === "benefit",
	);
	const outreach = tasks.filter(
		(t) => t.kind === "draft" || t.kind === "ready",
	);
	const eventUrl = (id: string) =>
		url(
			`/events?${new URLSearchParams({ ...(ownerId ? { person: ownerId } : {}), ...(workAreaId ? { work: workAreaId } : {}), event: id })}`,
		);
	return (
		<div className="py-5">
			<LookoutGrid>
				<LookoutCard>
					<h2 className="font-medium">Para avanzar hoy</h2>
					<p className="text-muted-foreground text-sm">
						{counts.followups} seguimientos próximos · {counts.benefits}{" "}
						compromisos
					</p>
					{pending.slice(0, 3).map((task) => (
						<LookoutRow key={`${task.kind}:${task.id}`}>
							<Link
								className="text-sm hover:underline"
								href={eventUrl(task.eventId)}
							>
								{task.title}
								<span className="block text-muted-foreground text-xs">
									{task.eventName}
								</span>
							</Link>
						</LookoutRow>
					))}
					{pending.length === 0 && (
						<p className="text-muted-foreground text-sm">
							No hay seguimientos ni compromisos vencidos o próximos en 24
							horas.
						</p>
					)}
					<Button
						variant="outline"
						onClick={() =>
							onPrompt("Dime mis tres prioridades y qué podemos hacer hoy")
						}
					>
						Organizar mi día
					</Button>
				</LookoutCard>
				<LookoutCard>
					<h2 className="font-medium">Correos y marcas</h2>
					<p className="text-muted-foreground text-sm">
						{counts.drafts} borradores por revisar o enviar · {counts.ready}{" "}
						marcas por contactar
					</p>
					{outreach.slice(0, 3).map((task) => (
						<LookoutRow key={`${task.kind}:${task.id}`}>
							<Link
								className="text-sm hover:underline"
								href={eventUrl(task.eventId)}
							>
								{task.title}
								<span className="block text-muted-foreground text-xs">
									{task.eventName}
								</span>
							</Link>
						</LookoutRow>
					))}
					{outreach.length === 0 && (
						<p className="text-muted-foreground text-sm">
							Podemos empezar buscando marcas para tu evento.
						</p>
					)}
					<Button
						variant="outline"
						onClick={() =>
							onPrompt("Busquemos marcas de bebidas para mi evento")
						}
					>
						Buscar marcas
					</Button>
				</LookoutCard>
				<LookoutCard>
					<h2 className="font-medium">Respuestas recibidas</h2>
					{!inbox.visible ? (
						<p className="text-muted-foreground text-sm">
							El correo personal aparece en tu sección. Aquí puedes consultar
							los eventos de esta persona.
						</p>
					) : !inbox.connected ? (
						<>
							<p className="text-muted-foreground text-sm">
								Conecta la casilla desde la que contactas a las marcas para
								revisar sus respuestas aquí.
							</p>
							<Button asChild variant="outline">
								<Link href={url("/settings/connections/google")}>
									Conectar Gmail
								</Link>
							</Button>
						</>
					) : (
						<>
							<p className="text-muted-foreground text-xs">
								{inbox.email}
								{inbox.lastSyncedAt
									? ` · actualizado ${new Date(inbox.lastSyncedAt).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })}`
									: " · esperando primera sincronización"}
							</p>
							{inbox.status === "NEEDS_RECONNECT" && (
								<p role="alert" className="text-sm">
									Gmail requiere reconectar tu cuenta.
								</p>
							)}
							{inbox.status === "FAILED" && (
								<p role="alert" className="text-sm">
									La última sincronización falló. Actualiza o revisa la
									conexión.
								</p>
							)}
							{inbox.messages.slice(0, 3).map((message) => (
								<LookoutRow key={message.id}>
									<button
										type="button"
										className="text-left text-sm hover:underline"
										onClick={() =>
											onPrompt(
												`Revisa los correos recibidos de ${message.from}, especialmente «${message.subject}», y propón cómo responder.`,
											)
										}
									>
										{message.subject}
										<span className="block text-muted-foreground text-xs">
											{message.companyName ?? message.from}
										</span>
									</button>
								</LookoutRow>
							))}
							{inbox.messages.length === 0 && (
								<p className="text-muted-foreground text-sm">
									No hay respuestas sincronizadas de las empresas de este
									contexto.
								</p>
							)}
							<p className="text-muted-foreground text-xs">
								Conversaciones relacionadas con estas empresas; pueden
								corresponder a varios eventos.
							</p>
							<Button
								variant="outline"
								disabled={sync.isPending}
								onClick={() => sync.mutate()}
							>
								{sync.isPending ? "Actualizando…" : "Actualizar correos"}
							</Button>
						</>
					)}
				</LookoutCard>
			</LookoutGrid>
		</div>
	);
}
