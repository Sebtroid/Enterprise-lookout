"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function DraftDelivery({
	id,
	eventId,
	eventName,
	recipient,
	subject,
	body,
	status,
}: {
	id: string;
	eventId: string;
	eventName: string;
	recipient: string | null;
	subject: string;
	body: string;
	status: string;
}) {
	const trpc = useTRPC();
	const client = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();
	const [open, setOpen] = useState(false);
	const mailbox = useQuery({
		...trpc.lookout.mailboxStatus.queryOptions(),
		staleTime: 30_000,
	});
	const invalidate = async () => {
		await client.invalidateQueries({
			queryKey: trpc.lookout.snapshot.pathKey(),
		});
	};
	const send = useMutation(
		trpc.lookout.sendDraft.mutationOptions({
			onSuccess: async (result) => {
				setOpen(false);
				result.status === "sent"
					? toast.success(result.message)
					: toast.warning(result.message);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const check = useMutation(
		trpc.lookout.checkDraft.mutationOptions({
			onSuccess: async (result) => {
				result.status === "sent"
					? toast.success(result.message)
					: toast.warning(result.message);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	if (["sending", "send_uncertain"].includes(status))
		return (
			<Button
				variant="outline"
				disabled={check.isPending}
				onClick={() => check.mutate({ id, eventId })}
			>
				{check.isPending ? "Comprobando Gmail…" : "Comprobar envío en Gmail"}
			</Button>
		);
	if (status !== "approved") return null;
	if (mailbox.isError)
		return (
			<Button variant="outline" onClick={() => mailbox.refetch()}>
				Reintentar conexión de correo
			</Button>
		);
	if (mailbox.isPending)
		return <Button disabled>Comprobando remitente…</Button>;
	if (!mailbox.data?.canSend)
		return (
			<Button asChild variant="outline">
				<Link href={workspaceUrl("/settings/connections/google")}>
					Conectar correo de envío
				</Link>
			</Button>
		);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button disabled={!recipient}>Enviar desde Gmail</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Enviar este correo</DialogTitle>
					<DialogDescription>
						Enviarás el borrador aprobado para {eventName}. Esta acción contacta
						a la empresa.
					</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
					<dt>Desde</dt>
					<dd className="break-all">{mailbox.data.email}</dd>
					<dt>Para</dt>
					<dd className="break-all">{recipient}</dd>
					<dt>Asunto</dt>
					<dd>{subject}</dd>
				</dl>
				<div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
					{body}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						disabled={send.isPending}
						onClick={() => setOpen(false)}
					>
						Volver a revisar
					</Button>
					<Button
						disabled={send.isPending}
						onClick={() => {
							if (mailbox.data?.email)
								send.mutate({ id, eventId, senderEmail: mailbox.data.email });
						}}
					>
						{send.isPending ? "Enviando…" : "Confirmar y enviar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
