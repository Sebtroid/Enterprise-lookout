"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
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
import { categories } from "@crm/validation/lookout";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const UNASSIGNED = "unassigned";

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			Nueva empresa
		</Button>
	);
}

export function CreateCompanySheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateCompanyForm />
		</Suspense>
	);
}

function CreateCompanyForm() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");
	const [ownerId, setOwnerId] = useState(UNASSIGNED);
	const [selectedCategories, setSelectedCategories] = useState<
		(typeof categories)[number][]
	>([]);

	const nameId = useId();
	const domainId = useId();
	const categoryId = useId();

	const users = useQuery(trpc.users.list.queryOptions());

	const create = useMutation(
		trpc.companies.create.mutationOptions({
			onSuccess: async (company) => {
				await cache.company(company.id);
				toast.success(`${company.name} agregada a la base de empresas.`);
				await setOpen(null);
				setName("");
				setDomain("");
				setOwnerId(UNASSIGNED);
				setSelectedCategories([]);
				openRecord({ kind: "company", id: company.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>Nueva empresa</SheetTitle>
					<SheetDescription>
						Clasifícala una vez y úsala en todos tus eventos. Después puedes
						completar contactos y datos de la empresa.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-company"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (selectedCategories.length === 0) {
							toast.error("Selecciona al menos una categoría.");
							return;
						}
						create.mutate({
							name,
							domain: domain || undefined,
							ownerId: ownerId === UNASSIGNED ? null : ownerId,
							categories: selectedCategories,
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
								placeholder="Stripe"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={domainId}>Dominio</FieldLabel>
							<Input
								id={domainId}
								value={domain}
								onChange={(event) => setDomain(event.target.value)}
								placeholder="stripe.com"
								autoComplete="off"
								inputMode="url"
							/>
							<FieldDescription>
								Opcional. Puedes pegar el sitio completo; guardaremos solo el
								dominio. No se puede repetir entre empresas activas.
							</FieldDescription>
						</Field>

						<FieldSet>
							<FieldLegend>Categorías para auspicios</FieldLegend>
							<FieldDescription>
								Selecciona al menos una. Puedes elegir varias, por ejemplo
								bebidas y dinero.
							</FieldDescription>
							<div className="grid grid-cols-2 gap-3">
								{categories.map((category, index) => {
									const id = `${categoryId}-${index}`;
									return (
										<Field key={category} orientation="horizontal">
											<Checkbox
												id={id}
												checked={selectedCategories.includes(category)}
												onCheckedChange={(checked) =>
													setSelectedCategories((current) =>
														checked
															? [...current, category]
															: current.filter((value) => value !== category),
													)
												}
											/>
											<FieldLabel htmlFor={id}>{category}</FieldLabel>
										</Field>
									);
								})}
							</div>
						</FieldSet>

						<Field>
							<FieldLabel htmlFor="create-company-owner">
								Responsable
							</FieldLabel>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger id="create-company-owner">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
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
						form="create-company"
						disabled={
							create.isPending ||
							name.trim() === "" ||
							selectedCategories.length === 0
						}
					>
						{create.isPending ? <Spinner /> : null}
						Guardar empresa
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancelar</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
