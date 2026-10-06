"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@crm/ui/components/native-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import {
	categories,
	profileOf,
	type Sponsorship,
	stages,
} from "@crm/validation/lookout";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { useLookout } from "./use-lookout";

const pesos = new Intl.NumberFormat("es-CL", {
	style: "currency",
	currency: "CLP",
	maximumFractionDigits: 0,
});

function contributionSummary(sponsorship: Sponsorship) {
	const valid = sponsorship.contributions.filter(
		(item) => item.status === "committed" || item.status === "received",
	);
	const cash = valid
		.filter((item) => item.kind === "cash")
		.reduce((total, item) => total + item.amount, 0);
	const inKind = valid
		.filter((item) => item.kind !== "cash")
		.reduce((total, item) => total + item.estimatedValue, 0);
	if (!cash && !inKind) return "Sin aporte acordado";
	return [
		cash && `${pesos.format(cash)} en dinero`,
		inKind && `${pesos.format(inKind)} en productos o servicios`,
	]
		.filter(Boolean)
		.join(" · ");
}

export function PipelineBoard() {
	const { data, error, isPending } = useLookout();
	const searchParams = useSearchParams();
	const workspaceUrl = useWorkspaceUrl();
	const openRecord = useOpenRecord();
	const [search, setSearch] = useState("");
	const [stage, setStage] = useState("");
	const [category, setCategory] = useState("");
	const [eventId, setEventId] = useState("");

	const rows = useMemo(
		() =>
			data?.events
				.filter((event) => event.status !== "archived")
				.flatMap((event) =>
					event.sponsorships.map((sponsorship) => ({ event, sponsorship })),
				) ?? [],
		[data],
	);
	const filtered = rows.filter(({ event, sponsorship }) => {
		const text =
			`${sponsorship.company.name} ${event.name} ${sponsorship.contact?.firstName ?? ""} ${sponsorship.contact?.lastName ?? ""}`.toLocaleLowerCase(
				"es-CL",
			);
		return (
			text.includes(search.trim().toLocaleLowerCase("es-CL")) &&
			(!stage || sponsorship.stage === stage) &&
			(!eventId || event.id === eventId) &&
			(!category ||
				profileOf(sponsorship.company.sponsorshipProfile).categories.includes(
					category as (typeof categories)[number],
				))
		);
	});
	const overdue = rows.filter(
		({ sponsorship }) =>
			sponsorship.nextFollowupAt &&
			new Date(sponsorship.nextFollowupAt) < new Date(),
	).length;
	const base = new URLSearchParams();
	base.set(
		"person",
		data?.selectedWork?.ownerId ??
			searchParams.get("person") ??
			data?.userId ??
			"",
	);
	if (data?.selectedWork) base.set("work", data.selectedWork.id);
	const eventHref = (id: string) => {
		const query = new URLSearchParams(base);
		query.set("event", id);
		return `${workspaceUrl("/")}?${query}`;
	};

	if (isPending)
		return (
			<PageShell>
				<p>Cargando auspicios…</p>
			</PageShell>
		);
	if (error || !data)
		return (
			<PageShell>
				<p role="alert">
					No se pudieron cargar los auspicios. {error?.message}
				</p>
			</PageShell>
		);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Auspicios</PageShellTitle>
					<PageShellDescription>
						{data.selectedWork?.name ?? "Selecciona un trabajo"} · Empresas de
						todos sus eventos activos.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Button asChild variant="outline">
						<Link href={`${workspaceUrl("/")}?${base}`}>Ver eventos</Link>
					</Button>
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent>
				<div className="grid gap-3 sm:grid-cols-3">
					<div className="min-w-0 rounded-xl border bg-muted/20 px-4 py-3">
						<strong className="block text-2xl font-semibold tabular-nums">
							{rows.length}
						</strong>
						<span className="text-sm text-muted-foreground">
							{rows.length === 1 ? "auspicio" : "auspicios"} en este trabajo
						</span>
					</div>
					<div className="min-w-0 rounded-xl border bg-muted/20 px-4 py-3">
						<strong className="block text-2xl font-semibold tabular-nums">
							{
								rows.filter(({ sponsorship }) => sponsorship.stage === "ready")
									.length
							}
						</strong>
						<span className="text-sm text-muted-foreground">Por contactar</span>
					</div>
					<div className="min-w-0 rounded-xl border bg-muted/20 px-4 py-3">
						<strong className="block text-2xl font-semibold tabular-nums">
							{overdue}
						</strong>
						<span className="text-sm text-muted-foreground">
							{overdue === 1 ? "seguimiento vencido" : "seguimientos vencidos"}
						</span>
					</div>
				</div>
				<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(10rem,12rem))]">
					<Input
						type="search"
						aria-label="Buscar auspicios"
						placeholder="Buscar empresa, contacto o evento"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="w-full"
					/>
					<NativeSelect
						aria-label="Filtrar por evento"
						value={eventId}
						onChange={(event) => setEventId(event.target.value)}
					>
						<NativeSelectOption value="">Todos los eventos</NativeSelectOption>
						{data.events
							.filter((event) => event.status !== "archived")
							.map((event) => (
								<NativeSelectOption key={event.id} value={event.id}>
									{event.name}
								</NativeSelectOption>
							))}
					</NativeSelect>
					<NativeSelect
						aria-label="Filtrar por etapa"
						value={stage}
						onChange={(event) => setStage(event.target.value)}
					>
						<NativeSelectOption value="">Todas las etapas</NativeSelectOption>
						{Object.entries(stages).map(([key, label]) => (
							<NativeSelectOption key={key} value={key}>
								{label}
							</NativeSelectOption>
						))}
					</NativeSelect>
					<NativeSelect
						aria-label="Filtrar por categoría"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
					>
						<NativeSelectOption value="">
							Todas las categorías
						</NativeSelectOption>
						{categories.map((item) => (
							<NativeSelectOption key={item} value={item}>
								{item}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</div>
				{!rows.length ? (
					<div className="flex flex-col gap-3 py-10">
						<h2 className="text-lg font-medium">
							Todavía no hay auspicios en este trabajo
						</h2>
						<p className="text-sm text-muted-foreground">
							Abre un evento para añadir empresas de la base compartida.
						</p>
						<Button asChild className="self-start">
							<Link href={`${workspaceUrl("/")}?${base}`}>Ir a eventos</Link>
						</Button>
					</div>
				) : !filtered.length ? (
					<p className="py-10 text-sm text-muted-foreground">
						Ningún auspicio coincide con estos filtros.
					</p>
				) : (
					<>
						<div className="grid min-w-0 gap-3 lg:hidden">
							{filtered.map(({ event, sponsorship }) => {
								const due = sponsorship.nextFollowupAt
									? new Date(sponsorship.nextFollowupAt)
									: null;
								const contact = sponsorship.contact;
								return (
									<article
										key={sponsorship.id}
										className="min-w-0 rounded-xl border bg-card p-4"
									>
										<div className="flex min-w-0 items-start justify-between gap-3">
											<Button
												type="button"
												variant="link"
												className="h-auto min-w-0 flex-1 justify-start p-0 text-left text-base font-semibold whitespace-normal"
												onClick={() =>
													openRecord({
														kind: "company",
														id: sponsorship.companyId,
													})
												}
											>
												{sponsorship.company.name}
											</Button>
											<Badge variant="outline" className="shrink-0">
												{stages[sponsorship.stage]}
											</Badge>
										</div>
										<Link
											className="mt-2 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
											href={eventHref(event.id)}
										>
											Evento: {event.name}
										</Link>
										<dl className="mt-4 grid min-w-0 gap-3 border-t pt-3 sm:grid-cols-2">
											<div className="min-w-0">
												<dt className="text-xs text-muted-foreground">
													Aporte acordado
												</dt>
												<dd className="mt-1 text-sm break-words">
													{contributionSummary(sponsorship)}
												</dd>
											</div>
											<div className="min-w-0">
												<dt className="text-xs text-muted-foreground">
													Seguimiento
												</dt>
												<dd className="mt-1 text-sm">
													{due ? (
														<span
															className={
																due < new Date()
																	? "text-destructive"
																	: undefined
															}
														>
															{due.toLocaleDateString("es-CL")}
															{due < new Date() ? " · Vencido" : ""}
														</span>
													) : (
														"Sin fecha"
													)}
												</dd>
											</div>
											<div className="min-w-0 sm:col-span-2">
												<dt className="text-xs text-muted-foreground">
													Contacto
												</dt>
												<dd className="mt-1 text-sm">
													{contact ? (
														<Button
															type="button"
															variant="link"
															className="h-auto max-w-full justify-start p-0 text-left whitespace-normal"
															onClick={() =>
																openRecord({
																	kind: "contact",
																	id: contact.id,
																})
															}
														>
															{contact.firstName} {contact.lastName}
														</Button>
													) : (
														"Sin contacto"
													)}
												</dd>
											</div>
										</dl>
									</article>
								);
							})}
						</div>
						<div className="hidden min-w-0 lg:block">
							<Table className="min-w-[58rem]">
								<TableHeader>
									<TableRow>
										<TableHead>Empresa</TableHead>
										<TableHead>Evento</TableHead>
										<TableHead>Etapa</TableHead>
										<TableHead>Aporte acordado</TableHead>
										<TableHead>Seguimiento</TableHead>
										<TableHead>Contacto</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filtered.map(({ event, sponsorship }) => {
										const due = sponsorship.nextFollowupAt
											? new Date(sponsorship.nextFollowupAt)
											: null;
										const contact = sponsorship.contact;
										return (
											<TableRow key={sponsorship.id}>
												<TableCell>
													<Button
														variant="link"
														onClick={() =>
															openRecord({
																kind: "company",
																id: sponsorship.companyId,
															})
														}
													>
														{sponsorship.company.name}
													</Button>
												</TableCell>
												<TableCell>
													<Link
														className="underline-offset-4 hover:underline"
														href={eventHref(event.id)}
													>
														{event.name}
													</Link>
												</TableCell>
												<TableCell>
													<Badge variant="outline">
														{stages[sponsorship.stage]}
													</Badge>
												</TableCell>
												<TableCell>
													{contributionSummary(sponsorship)}
												</TableCell>
												<TableCell>
													{due ? (
														<span
															className={
																due < new Date()
																	? "text-destructive"
																	: undefined
															}
														>
															{due.toLocaleDateString("es-CL")}
															{due < new Date() ? " · Vencido" : ""}
														</span>
													) : (
														"Sin fecha"
													)}
												</TableCell>
												<TableCell>
													{contact ? (
														<Button
															variant="link"
															onClick={() =>
																openRecord({
																	kind: "contact",
																	id: contact.id,
																})
															}
														>
															{contact.firstName} {contact.lastName}
														</Button>
													) : (
														"Sin contacto"
													)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					</>
				)}
			</PageShellContent>
		</PageShell>
	);
}
