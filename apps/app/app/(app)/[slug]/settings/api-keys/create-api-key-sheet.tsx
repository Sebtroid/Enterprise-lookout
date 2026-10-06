"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useState } from "react";
import { toast } from "sonner";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CreatedApiKeyDialog } from "./created-api-key-dialog";

const FORM = "create-api-key";

const EXPIRATION_OPTIONS = [
	{ value: "30", label: "30 días" },
	{ value: "90", label: "90 días" },
	{ value: "365", label: "1 año" },
	{ value: "never", label: "Sin vencimiento" },
] as const;

type ExpirationValue = (typeof EXPIRATION_OPTIONS)[number]["value"];

type CreatedApiKey = RouterOutputs["apiKeys"]["create"];

function NewApiKeyButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			Nueva clave API
		</Button>
	);
}

export function CreateApiKeySheet() {
	return (
		<Suspense fallback={<NewApiKeyButton disabled />}>
			<CreateApiKeyForm />
		</Suspense>
	);
}

function CreateApiKeyForm() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const nameId = useId();
	const expirationId = useId();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [expiration, setExpiration] = useState<ExpirationValue>("90");
	const [created, setCreated] = useState<CreatedApiKey | null>(null);

	const create = useMutation(
		trpc.apiKeys.create.mutationOptions({
			onSuccess: async (apiKey) => {
				await cache.apiKeys();
				await setOpen(null);
				setName("");
				setExpiration("90");
				setCreated(apiKey);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<>
			<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
				<SheetTrigger asChild>
					<NewApiKeyButton />
				</SheetTrigger>

				<SheetContent side="right">
					<SheetHeader>
						<SheetTitle>Nueva clave API</SheetTitle>
						<SheetDescription>
							La clave actúa con tus permisos. La aprobación y el envío de
							correos requieren tu sesión en la app.
						</SheetDescription>
					</SheetHeader>

					<form
						id={FORM}
						className="flex-1 overflow-y-auto px-4"
						onSubmit={(event) => {
							event.preventDefault();
							create.mutate({
								name: name.trim(),
								expiresInDays:
									expiration === "never" ? null : Number(expiration),
							});
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
								<Input
									id={nameId}
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Hermes en mi servidor"
									maxLength={64}
									autoComplete="off"
									autoCapitalize="off"
									autoCorrect="off"
									spellCheck={false}
									required
								/>
								<FieldDescription>
									Un nombre que identifique dónde la usarás.
								</FieldDescription>
							</Field>

							<Field>
								<FieldLabel htmlFor={expirationId}>Vencimiento</FieldLabel>
								<Select
									value={expiration}
									onValueChange={(value) =>
										setExpiration(value as ExpirationValue)
									}
								>
									<SelectTrigger id={expirationId} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{EXPIRATION_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</FieldGroup>
					</form>

					<SheetFooter>
						<Button
							type="submit"
							form={FORM}
							disabled={!name.trim() || create.isPending}
						>
							{create.isPending ? <Spinner /> : null}
							Crear clave
						</Button>
						<SheetClose asChild>
							<Button variant="outline">Cancelar</Button>
						</SheetClose>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			<CreatedApiKeyDialog
				apiKey={created}
				onOpenChange={(next) => {
					if (!next) setCreated(null);
				}}
			/>
		</>
	);
}
