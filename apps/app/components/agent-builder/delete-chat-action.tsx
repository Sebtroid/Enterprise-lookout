"use client";

import Close from "@carbon/icons-react/es/Close";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function DeleteChatAction({
	conversationId,
	title,
	trigger,
	className,
	returnToChatList = false,
	onDeleted,
}: {
	conversationId: string;
	title: string;
	trigger: "close" | "menu";
	className?: string;
	returnToChatList?: boolean;
	onDeleted?: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const [confirming, setConfirming] = useState(false);
	const remove = useMutation(
		trpc.conversations.remove.mutationOptions({
			onSuccess: async () => {
				await cache.conversationRemoved(conversationId);
				setConfirming(false);
				toast.success("Chat eliminado.");
				onDeleted?.();

				if (returnToChatList) {
					router.replace(workspaceUrl("/chat"));
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const removeAction = useAsyncAction({
		action: () => remove.mutateAsync({ id: conversationId }),
	});

	return (
		<>
			{trigger === "close" ? (
				<Button
					variant="ghost"
					size="icon-xs"
					className={className}
					disabled={removeAction.pending}
					aria-label={`Delete ${title}`}
					onClick={() => setConfirming(true)}
				>
					<Icon icon={Close} />
				</Button>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={removeAction.pending}
						>
							<Icon icon={OverflowMenuVertical} />
							<span className="sr-only">Más acciones del chat</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setConfirming(true)}
						>
							<Icon icon={TrashCan} />
							Eliminar chat
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => {
					if (!removeAction.pending) setConfirming(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Eliminar {title}?</AlertDialogTitle>
						<AlertDialogDescription>
							Se eliminan permanentemente el chat, sus mensajes, adjuntos y
							enlace compartido. Los agentes creados desde este chat siguen
							disponibles.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removeAction.pending}>
							Cancelar
						</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={removeAction.pending}
							aria-busy={removeAction.pending}
							onClick={() => removeAction.run()}
						>
							<AsyncButtonContent
								status={removeAction.status}
								pendingLabel="Eliminando"
								successLabel="Eliminado"
								errorLabel="Inténtalo de nuevo"
							>
								Eliminar chat
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
