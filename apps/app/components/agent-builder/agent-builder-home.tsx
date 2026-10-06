"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import { Icon } from "@crm/ui/components/icon";
import {
	NativeSelect,
	NativeSelectOption,
} from "@crm/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { OperationsBrief } from "@/components/lookout/operations-brief";
import { useLookout } from "@/components/lookout/use-lookout";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { AgentComposer, type BuilderComposerPrompt } from "./agent-composer";

const SUGGESTIONS = [
	"Dime mis tres prioridades y qué podemos hacer hoy",
	"Busquemos marcas de bebidas para mi evento",
	"Resume los correos recibidos y propón los siguientes pasos",
	"Prepara los correos de las empresas por contactar",
];

export function AgentBuilderHome({ name }: { name: string }) {
	const givenName = firstName(name);
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const { data: lookout } = useLookout();
	const params = useSearchParams();
	const [eventId, setEventId] = useState(params.get("event") ?? "");
	const runtime = useQuery({
		...trpc.lookout.runtimeStatus.queryOptions(),
		refetchInterval: 60_000,
	});
	const work = lookout?.selectedWork;
	const selectedEvent = lookout?.events.find((event) => event.id === eventId);
	const queryClient = useQueryClient();
	const [initialPrompt, setInitialPrompt] = useState("");
	const create = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: async ({ id }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				});
				const scopeParams = new URLSearchParams();
				if (work) {
					scopeParams.set("person", work.ownerId);
					scopeParams.set("work", work.id);
				}
				if (selectedEvent) scopeParams.set("event", selectedEvent.id);
				router.push(
					workspaceUrl(
						`/chat/${id}${scopeParams.size ? `?${scopeParams}` : ""}`,
					),
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = async (
		prompt: BuilderComposerPrompt,
		clientRequestId: string,
	) => {
		await create.mutateAsync({
			...prompt,
			...(work
				? {
						lookoutScope: {
							ownerId: work.ownerId,
							workAreaId: work.id,
							...(selectedEvent ? { eventId: selectedEvent.id } : {}),
						},
					}
				: {}),
			clientRequestId,
		});
	};

	return (
		<main className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
			<div className="flex w-full max-w-4xl flex-col gap-3 pb-6">
				<p className="font-medium text-primary text-sm">
					Dom · tu centro de auspicios
				</p>
				<h1 className="text-balance font-medium text-2xl tracking-tight sm:text-3xl">
					{givenName ? `¿Qué hacemos hoy, ${givenName}?` : "¿Qué hacemos hoy?"}
				</h1>
				<p className="max-w-xl text-balance text-muted-foreground text-sm">
					Revisemos lo pendiente y avancemos con las marcas de tu próximo
					evento. Escribe lo que necesitas; Dom usa el contexto de este trabajo.
				</p>
			</div>

			<div className="w-full max-w-4xl">
				<div className="flex flex-wrap items-center gap-2 pb-3">
					<Badge variant="outline">
						{work ? `Trabajo: ${work.name}` : "Base compartida de contactos"}
					</Badge>
					{work && (
						<NativeSelect
							aria-label="Evento para Dom"
							value={selectedEvent?.id ?? ""}
							onChange={(event) => setEventId(event.target.value)}
						>
							<NativeSelectOption value="">
								Todos los eventos del trabajo
							</NativeSelectOption>
							{lookout?.events
								.filter((event) => event.status !== "archived")
								.map((event) => (
									<NativeSelectOption key={event.id} value={event.id}>
										{event.name}
									</NativeSelectOption>
								))}
						</NativeSelect>
					)}
				</div>
				{runtime.data && !runtime.data.configured && (
					<Alert>
						<AlertTitle>Falta activar Dom</AlertTitle>
						<AlertDescription>
							Completa lookout_v2_glm_api_key en Supabase Vault. El chat se
							habilita automáticamente al guardar la clave.
						</AlertDescription>
					</Alert>
				)}
				{runtime.data?.configured && !runtime.data.agentAvailable && (
					<Alert>
						<AlertTitle>Dom está desconectado</AlertTitle>
						<AlertDescription>
							Inicia el servidor de Dom para continuar. Tus conversaciones
							siguen guardadas.
						</AlertDescription>
					</Alert>
				)}
				{runtime.isError && (
					<Alert>
						<AlertTitle>No se pudo comprobar Dom</AlertTitle>
						<AlertDescription>
							Comprueba la conexión con el servidor y vuelve a intentarlo.
						</AlertDescription>
					</Alert>
				)}
				<AgentComposer
					key={initialPrompt}
					mode="home"
					initialPrompt={initialPrompt}
					onSubmit={submit}
					disabled={!runtime.data?.configured || !runtime.data.agentAvailable}
				/>
				<p className="flex min-h-8 items-center px-px py-2 text-muted-foreground text-xs">
					Dom investiga y prepara. Tú revisas y apruebas cada correo antes de
					enviarlo.
				</p>
				{lookout && (
					<OperationsBrief
						ownerId={work?.ownerId ?? params.get("person") ?? lookout.userId}
						workAreaId={work?.id}
						eventId={selectedEvent?.id}
						onPrompt={setInitialPrompt}
					/>
				)}
				{lookout && !work && (
					<Alert>
						<AlertTitle>Crea tu primer trabajo</AlertTitle>
						<AlertDescription>
							Usa “Nuevo trabajo” arriba para separar tus responsabilidades.
							Después podrás crear eventos y guardar marcas con Dom.
						</AlertDescription>
					</Alert>
				)}

				<div className="pt-1">
					<p className="flex h-7 items-center text-muted-foreground text-xs">
						Dile a Dom lo que necesitas
					</p>
					{SUGGESTIONS.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => setInitialPrompt(suggestion)}
							className="flex h-[42px] w-full items-center border-t text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
						>
							<span className="min-w-0 flex-1 font-medium text-sm">
								{suggestion}
							</span>
							<Icon
								icon={ArrowRight}
								className="size-4 text-muted-foreground"
							/>
						</button>
					))}
				</div>
			</div>
		</main>
	);
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] || "";
}
