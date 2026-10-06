"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { LookoutCard } from "@crm/ui/components/lookout";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { ConnectionPage } from "./connection-page";

export function GmailMailbox({
	loginEmail,
	initialSender,
}: {
	loginEmail: string;
	initialSender: string;
}) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const params = useSearchParams();
	const client = useQueryClient();
	const [email, setEmail] = useState(initialSender);
	const status = useQuery(trpc.lookout.mailboxStatus.queryOptions());
	const google = useQuery({
		...trpc.google.status.queryOptions(),
		enabled: Boolean(status.data?.connected),
	});
	const connect = useMutation(
		trpc.lookout.connectMailbox.mutationOptions({
			onSuccess: ({ url }) => {
				window.location.href = url;
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const disconnect = useMutation(
		trpc.lookout.disconnectMailbox.mutationOptions({
			onSuccess: async () => {
				await client.invalidateQueries({
					queryKey: trpc.lookout.mailboxStatus.pathKey(),
				});
				toast.success(
					"Correo desconectado. Tu inicio de sesión sigue disponible.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const sync = useMutation(
		trpc.google.syncNow.mutationOptions({
			onSuccess: async () => {
				await client.invalidateQueries({
					queryKey: trpc.google.status.pathKey(),
				});
				toast.success("Sincronización terminada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const gmail = google.data?.sources.find(
		(source) => source.source === "gmail",
	);
	return (
		<ConnectionPage>
			<header className="flex flex-col gap-2 px-(--spacing-block-inline)">
				<Link
					href={workspaceUrl("/settings/connections")}
					className="text-muted-foreground text-sm"
				>
					← Conexiones
				</Link>
				<h1 className="font-medium text-2xl tracking-tight">
					Tu correo de auspicios
				</h1>
				<p className="text-muted-foreground text-sm">
					Elige desde qué cuenta enviarás y recibirás correos. Inicias sesión
					con {loginEmail}.
				</p>
			</header>
			{params.get("mailbox") === "error" && (
				<Alert variant="destructive">
					<AlertTitle>No se pudo conectar Gmail</AlertTitle>
					<AlertDescription>
						{params.get("message") ?? "Intenta nuevamente desde esta página."}
					</AlertDescription>
				</Alert>
			)}
			{params.get("mailbox") === "connected" && (
				<Alert>
					<AlertTitle>Gmail conectado</AlertTitle>
					<AlertDescription>
						Ya puedes revisar y enviar tus borradores desde cada evento.
					</AlertDescription>
				</Alert>
			)}
			{status.isPending ? (
				<Spinner />
			) : status.isError ? (
				<Alert variant="destructive">
					<AlertTitle>No se pudo cargar la conexión</AlertTitle>
					<AlertDescription>
						<Button variant="outline" onClick={() => status.refetch()}>
							Reintentar
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<LookoutCard>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-medium">Gmail</h2>
						<Badge variant="outline">
							{status.data?.connected ? "Conectado" : "Pendiente de conexión"}
						</Badge>
					</div>
					{status.data?.connected ? (
						<>
							<p className="font-medium">{status.data.email}</p>
							<p className="text-muted-foreground text-sm">
								Los correos salen desde esta cuenta. Cada borrador requiere
								revisión, aprobación y un clic en Enviar.
							</p>
							<p className="text-muted-foreground text-sm">
								{gmail?.lastSyncedAt
									? `Última sincronización: ${new Date(gmail.lastSyncedAt).toLocaleString("es-CL")}`
									: "La primera sincronización comienza desde el momento de la conexión."}
							</p>
							{gmail?.lastError && (
								<Alert variant="destructive">
									<AlertTitle>Revisa la sincronización</AlertTitle>
									<AlertDescription>{gmail.lastError}</AlertDescription>
								</Alert>
							)}
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									disabled={sync.isPending}
									onClick={() => sync.mutate()}
								>
									{sync.isPending ? "Sincronizando…" : "Sincronizar respuestas"}
								</Button>
								<Button
									variant="outline"
									disabled={disconnect.isPending}
									onClick={() => disconnect.mutate()}
								>
									{disconnect.isPending
										? "Desconectando…"
										: "Desconectar correo"}
								</Button>
							</div>
						</>
					) : (
						<form
							className="flex flex-col gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								connect.mutate({ email });
							}}
						>
							<div className="flex flex-col gap-2">
								<Label htmlFor="sender-email">Correo de envío</Label>
								<Input
									id="sender-email"
									type="email"
									required
									autoComplete="email"
									placeholder="tu.correo@universidad.cl"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</div>
							<p className="text-muted-foreground text-sm">
								Google pedirá permiso para leer correos y enviar los que
								apruebes. Puedes elegir una cuenta distinta a la de inicio de
								sesión.
							</p>
							<Button
								type="submit"
								disabled={!status.data?.configured || connect.isPending}
							>
								{connect.isPending
									? "Abriendo Google…"
									: "Conectar este correo con Google"}
							</Button>
							{!status.data?.configured && (
								<p role="alert" className="text-sm">
									Falta configurar el cliente de Google en Supabase Vault.
								</p>
							)}
						</form>
					)}
				</LookoutCard>
			)}
			<LookoutCard>
				<h2 className="font-medium">Así funciona el envío</h2>
				<ol className="list-decimal space-y-2 pl-5 text-sm">
					<li>Prepara el correo dentro de un evento.</li>
					<li>Revisa el destinatario, asunto y contenido.</li>
					<li>Aprueba el borrador y confirma el envío.</li>
				</ol>
				<p className="text-muted-foreground text-sm">
					Dom y las claves API preparan borradores. La aprobación y el envío se
					hacen en tu sesión de la app.
				</p>
			</LookoutCard>
		</ConnectionPage>
	);
}
