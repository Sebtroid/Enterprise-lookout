"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Renew from "@carbon/icons-react/es/Renew";
import Undo from "@carbon/icons-react/es/Undo";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@crm/ui/components/dropdown-menu";
import { formatCount } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	BulkActionsMenu,
	BulkDeleteDialog,
	BulkOwnerMenu,
	reportBulk,
} from "@/components/crm/bulk-actions";
import { CompanyMenuSearch } from "@/components/crm/company-picker";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function contacts(count: number): string {
	return formatCount(count, "contacto", "contactos");
}

export function ContactsBulkActions({
	ids,
	onDone,
	archived,
}: {
	ids: string[];
	onDone: () => void;
	archived: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const users = useQuery(trpc.users.list.queryOptions());
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const companySearch = useRef<HTMLInputElement>(null);

	const onError = (error: { message: string }) => toast.error(error.message);

	const assignOwner = useMutation(
		trpc.contacts.bulkAssignOwner.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) => `Se cambió el responsable de ${contacts(count)}.`,
				);
				onDone();
			},
			onError,
		}),
	);

	const setCompany = useMutation(
		trpc.contacts.bulkSetCompany.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) => `Cambio de empresa completado: ${contacts(count)}.`,
				);
				onDone();
			},
			onError,
		}),
	);

	const enrich = useMutation(
		trpc.contacts.bulkEnrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) =>
						`Investigación iniciada para ${contacts(count)}; la tabla se actualizará.`,
				);
				onDone();
			},
			onError,
		}),
	);

	const archive = useMutation(
		trpc.contacts.bulkArchive.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "contact", ids: variables.ids });
				reportBulk(
					result,
					(count) => `Archivo completado: ${contacts(count)}.`,
				);
				onDone();
			},
			onError,
		}),
	);

	const restore = useMutation(
		trpc.contacts.bulkRestore.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) => `Restauración completada: ${contacts(count)}.`,
				);
				onDone();
			},
			onError,
		}),
	);

	const purge = useMutation(
		trpc.contacts.bulkPurge.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "contact", ids: variables.ids });
				reportBulk(
					result,
					(count) => `Eliminación definitiva: ${contacts(count)}.`,
				);
				setConfirming(false);
				onDone();
			},
			onError,
		}),
	);

	if (archived) {
		const pending = restore.isPending || purge.isPending;

		return (
			<>
				<BulkActionsMenu pending={pending}>
					<DropdownMenuGroup>
						<DropdownMenuItem onSelect={() => restore.mutate({ ids })}>
							<Undo />
							Restaurar
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setConfirming(true)}
						>
							Eliminar definitivamente
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</BulkActionsMenu>

				<BulkDeleteDialog
					open={confirming}
					onOpenChange={setConfirming}
					title={`¿Eliminar definitivamente ${contacts(ids.length)}?`}
					description="Sus correos quedarán bloqueados para que la sincronización no vuelva a crear estos contactos. Esta acción no se puede deshacer."
					onConfirm={() => purge.mutate({ ids })}
				/>
			</>
		);
	}

	const pending =
		assignOwner.isPending ||
		setCompany.isPending ||
		enrich.isPending ||
		archive.isPending;

	return (
		<BulkActionsMenu
			pending={pending}
			open={menuOpen}
			onOpenChange={setMenuOpen}
		>
			<BulkOwnerMenu
				users={users.data ?? []}
				unassignedLabel="Sin asignar"
				onSelect={(ownerId) => assignOwner.mutate({ ids, ownerId })}
			/>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>Mover a empresa</DropdownMenuSubTrigger>
				<DropdownMenuSubContent
					className="w-64 p-0"
					onFocus={(event) => {
						if (event.target === event.currentTarget) {
							companySearch.current?.focus();
						}
					}}
				>
					<CompanyMenuSearch
						none="Sin empresa"
						inputRef={companySearch}
						onSelect={(companyId) => {
							setMenuOpen(false);
							setCompany.mutate({ ids, companyId });
						}}
					/>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<DropdownMenuGroup>
				<DropdownMenuItem onSelect={() => enrich.mutate({ ids })}>
					<Renew />
					Actualizar información
				</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuItem onSelect={() => archive.mutate({ ids })}>
					<Archive />
					Archivar
				</DropdownMenuItem>
			</DropdownMenuGroup>
		</BulkActionsMenu>
	);
}
