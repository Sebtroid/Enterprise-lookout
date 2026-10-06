"use client";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	LookoutCard,
	LookoutMetrics,
	LookoutRow,
} from "@crm/ui/components/lookout";
import {
	NativeSelect,
	NativeSelectOption,
} from "@crm/ui/components/native-select";
import {
	type Command,
	categories,
	finances,
	profileOf,
	type Snapshot,
	type SponsorEvent,
	type Sponsorship,
	stageSchema,
	stages,
} from "@crm/validation/lookout";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
import { CompanyLinker } from "./company-linker";
import { DraftDelivery } from "./draft-delivery";
import { dateValue, Editor, type EditorField, number, value } from "./editor";
import { useLookout } from "./use-lookout";

const clp = (v: number) =>
	new Intl.NumberFormat("es-CL", {
		style: "currency",
		currency: "CLP",
		maximumFractionDigits: 0,
	}).format(v);
const shortDate = (s: string | null | undefined) =>
	s ? new Date(s).toLocaleDateString("es-CL") : "Sin fecha";
const options = (values: Record<string, string>) =>
	Object.entries(values).map(([value, label]) => ({ value, label }));
const dateInput = (s: string | null | undefined) => s?.slice(0, 10) ?? "";
type Execute = (c: Command) => Promise<{ ok: true; id: string }>;
const eventFields = (e?: SponsorEvent): EditorField[] => [
	{ name: "name", label: "Nombre del evento", required: true, value: e?.name },
	{
		name: "date",
		label: "Fecha del evento",
		type: "date",
		value: dateInput(e?.date),
	},
	{
		name: "startsOn",
		label: "Inicio de la campaña",
		type: "date",
		value: dateInput(e?.startsOn),
	},
	{
		name: "endsOn",
		label: "Fin de la campaña",
		type: "date",
		value: dateInput(e?.endsOn),
	},
	{ name: "location", label: "Lugar", value: e?.location ?? "" },
	{ name: "audience", label: "Público / asistentes", value: e?.audience ?? "" },
	{
		name: "cashTarget",
		label: "Meta de auspicios en dinero (CLP)",
		type: "number",
		value: e?.cashTarget ?? 0,
		max: 2_000_000_000,
	},
	{
		name: "needs",
		label: "Qué necesita el evento",
		type: "multi",
		value: e?.needs ?? [],
		options: categories.map((c) => ({ value: c, label: c })),
	},
	{
		name: "description",
		label: "Descripción del evento",
		type: "textarea",
		value: e?.description ?? "",
	},
	{
		name: "valueProposition",
		label: "Qué ofrecemos a las marcas",
		type: "textarea",
		value: e?.valueProposition ?? "",
	},
	{
		name: "status",
		label: "Estado",
		type: "select",
		value: e?.status ?? "planning",
		options: options({
			planning: "En preparación",
			active: "Activo",
			completed: "Finalizado",
			archived: "Archivado",
		}),
	},
];
function eventData(f: FormData) {
	const needs = f.getAll("needs").map(String);
	const invalid = needs.filter((s) => !categories.some((c) => c === s));
	if (invalid.length)
		throw new Error(`Categorías disponibles: ${categories.join(", ")}`);
	if (
		value(f, "startsOn") &&
		value(f, "endsOn") &&
		value(f, "startsOn") > value(f, "endsOn")
	)
		throw new Error("El fin de la campaña debe ser posterior al inicio.");
	return {
		name: value(f, "name"),
		date: dateValue(f, "date"),
		startsOn: dateValue(f, "startsOn"),
		endsOn: dateValue(f, "endsOn"),
		location: value(f, "location"),
		audience: value(f, "audience"),
		cashTarget: number(f, "cashTarget"),
		description: value(f, "description"),
		valueProposition: value(f, "valueProposition"),
		needs: categories.filter((c) => needs.includes(c)),
		status: parseEventStatus(value(f, "status")),
	};
}
function parseEventStatus(v: string): SponsorEvent["status"] {
	return v === "active" || v === "completed" || v === "archived"
		? v
		: "planning";
}

export function LookoutBoard({ pipeline = false }: { pipeline?: boolean }) {
	const [showArchived, setShowArchived] = useState(false);
	const { data, error, isPending, execute } = useLookout();
	const params = useSearchParams();
	const router = useRouter();
	const url = useWorkspaceUrl();
	if (isPending)
		return (
			<PageShell>
				<p>Cargando eventos…</p>
			</PageShell>
		);
	if (error || !data)
		return (
			<PageShell>
				<p role="alert">No se pudieron cargar los eventos. {error?.message}</p>
			</PageShell>
		);
	const selected = params.get("event");
	const event = data.events.find((e) => e.id === selected);
	const writable = data.selectedWork?.ownerId === data.userId;
	const href = (id?: string) => {
		const q = new URLSearchParams();
		q.set("person", data.selectedWork?.ownerId ?? data.userId);
		if (data.selectedWork) q.set("work", data.selectedWork.id);
		if (id) q.set("event", id);
		return `${url("/events")}?${q}`;
	};
	if (selected && !event)
		return (
			<PageShell>
				<p>Este evento no pertenece al trabajo seleccionado.</p>
				<Button asChild>
					<Link href={href()}>Volver a mis eventos</Link>
				</Button>
			</PageShell>
		);
	if (event)
		return (
			<EventBoard
				event={event}
				data={data}
				execute={execute}
				writable={writable}
				back={href()}
			/>
		);
	const current = data.events.filter((e) => e.status !== "archived");
	const visible = showArchived
		? data.events.filter((e) => e.status === "archived")
		: current;
	const totals = finances(current);
	const followups = current
		.flatMap((event) =>
			event.sponsorships.flatMap((sponsor) =>
				sponsor.nextFollowupAt
					? [{ event, sponsor, dueAt: sponsor.nextFollowupAt }]
					: [],
			),
		)
		.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
		.slice(0, 6);
	const selectedWork = data.selectedWork;
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>
						{pipeline
							? "Auspicios"
							: (data.selectedWork?.name ?? "Tus trabajos")}
					</PageShellTitle>
					<PageShellDescription>
						{data.selectedWork
							? `${data.selectedWork.organization} · Cada evento tiene sus empresas, presupuesto y acuerdos.`
							: "Crea tu primer trabajo arriba para organizar sus eventos."}
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Button
						variant="outline"
						onClick={() => setShowArchived(!showArchived)}
					>
						{showArchived ? "Ver eventos actuales" : "Ver archivados"}
					</Button>
					{selectedWork && (
						<Editor
							title="Nuevo evento"
							disabled={!writable}
							fields={eventFields()}
							onSave={async (f) => {
								const r = await execute({
									action: "createEvent",
									workAreaId: selectedWork.id,
									data: eventData(f),
								});
								router.push(href(r.id));
							}}
						/>
					)}
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent>
				<LookoutMetrics
					items={[
						{
							label: "Eventos por gestionar",
							value: String(
								current.filter((e) => e.status !== "completed").length,
							),
							detail: "En este trabajo",
						},
						{
							label: "Por conseguir en dinero",
							value: clp(totals.gap),
							detail: `Meta ${clp(totals.target)}`,
						},
						{
							label: "Dinero recibido",
							value: clp(totals.received),
							detail: `Comprometido total ${clp(totals.committed)}`,
						},
						{
							label: "Productos y servicios acordados",
							value: clp(totals.inKind),
							detail: "Valor estimado · no es dinero disponible",
						},
					]}
				/>
				<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
					<section
						className="flex flex-col gap-4"
						aria-label={
							showArchived ? "Eventos archivados" : "Eventos del trabajo"
						}
					>
						<h2 className="text-lg font-medium">
							{showArchived ? "Eventos archivados" : "Eventos del trabajo"}
						</h2>
						{!visible.length && (
							<LookoutCard>
								<h3>
									{showArchived
										? "No hay eventos archivados"
										: "Aquí empiezan tus próximos eventos"}
								</h3>
								<p>
									{showArchived
										? "Los eventos archivados aparecerán aquí."
										: "Crea un evento y añade empresas desde la base compartida."}
								</p>
							</LookoutCard>
						)}
						{visible.map((e) => {
							const f = finances([e]);
							const overdue = e.sponsorships.filter(
								(s) =>
									s.nextFollowupAt && new Date(s.nextFollowupAt) <= new Date(),
							).length;
							return (
								<LookoutCard key={e.id} className="gap-3">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<Badge variant="outline">
											{e.status === "active"
												? "Activo"
												: e.status === "completed"
													? "Finalizado"
													: e.status === "archived"
														? "Archivado"
														: "En preparación"}
										</Badge>
										<span className="text-sm text-muted-foreground">
											{shortDate(e.date)}
										</span>
									</div>
									<h3 className="text-xl font-medium">
										<Link href={href(e.id)} className="hover:underline">
											{e.name}
										</Link>
									</h3>
									<p className="text-sm text-muted-foreground">
										{e.description || "Añade el contexto de este evento."}
									</p>
									<div className="flex flex-wrap gap-2">
										{e.needs.map((n) => (
											<Badge key={n} variant="secondary">
												{n}
											</Badge>
										))}
									</div>
									<div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm">
										<span>
											{e.sponsorships.length}{" "}
											{e.sponsorships.length === 1 ? "empresa" : "empresas"} ·{" "}
											{overdue}{" "}
											{overdue === 1
												? "seguimiento vencido"
												: "seguimientos vencidos"}
										</span>
										<span>
											Faltan <strong>{clp(f.gap)}</strong> de {clp(f.target)}
										</span>
									</div>
									<Button asChild variant="outline" className="self-start">
										<Link href={href(e.id)}>Abrir evento</Link>
									</Button>
								</LookoutCard>
							);
						})}
					</section>
					<aside aria-label="Próximas acciones">
						<LookoutCard>
							<h2 className="text-lg font-medium">Próximas acciones</h2>
							{followups.map(({ event: e, sponsor: s, dueAt }) => (
								<LookoutRow key={s.id}>
									<Link
										className="font-medium hover:underline"
										href={href(e.id)}
									>
										{s.company.name} · {e.name}
									</Link>
									<span
										className={
											new Date(dueAt) < new Date()
												? "text-destructive"
												: "text-muted-foreground"
										}
									>
										{shortDate(dueAt)}
									</span>
								</LookoutRow>
							))}
							{!followups.length && (
								<p className="text-sm text-muted-foreground">
									Los seguimientos que programes en cada auspicio aparecerán
									aquí.
								</p>
							)}
						</LookoutCard>
					</aside>
				</div>
			</PageShellContent>
		</PageShell>
	);
}

function EventBoard({
	event,
	data,
	execute,
	writable,
	back,
}: {
	event: SponsorEvent;
	data: Snapshot;
	execute: Execute;
	writable: boolean;
	back: string;
}) {
	const [tab, setTab] = useState("companies");
	const [category, setCategory] = useState("");
	const [stage, setStage] = useState("");
	const f = finances([event]);
	const sponsors = event.sponsorships.filter(
		(s) =>
			(!category ||
				profileOf(s.company.sponsorshipProfile).categories.includes(
					category as (typeof categories)[number],
				)) &&
			(!stage || s.stage === stage),
	);
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{event.name}</PageShellTitle>
					<PageShellDescription>
						{shortDate(event.date)}
						{event.location ? ` · ${event.location}` : ""}
						{event.audience ? ` · ${event.audience}` : ""}
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Button asChild variant="ghost">
						<Link href={back}>Todos los eventos</Link>
					</Button>
					<Editor
						title="Editar evento"
						disabled={!writable}
						fields={eventFields(event)}
						onSave={async (form) => {
							await execute({
								action: "updateEvent",
								eventId: event.id,
								data: eventData(form),
							});
						}}
					/>
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent>
				{event.description && (
					<p className="text-muted-foreground">{event.description}</p>
				)}
				{(event.startsOn || event.endsOn) && (
					<p className="text-sm text-muted-foreground">
						Campaña de contacto: {shortDate(event.startsOn)} –{" "}
						{shortDate(event.endsOn)}
					</p>
				)}
				{event.valueProposition && (
					<div className="rounded-lg border bg-muted/40 p-4">
						<h2 className="font-medium">Propuesta para las marcas</h2>
						<p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
							{event.valueProposition}
						</p>
					</div>
				)}
				<LookoutMetrics
					items={[
						{
							label: "Falta conseguir",
							value: clp(f.gap),
							detail: `Meta monetaria ${clp(f.target)}`,
						},
						{
							label: "Dinero recibido",
							value: clp(f.received),
							detail: `Comprometido ${clp(f.committed)}`,
						},
						{
							label: "Productos y servicios",
							value: clp(f.inKind),
							detail: "Valor acordado · separado de caja",
						},
						{
							label: "Gastos reales",
							value: clp(f.actual),
							detail: `Presupuesto ${clp(f.planned)} · pagado ${clp(f.paid)}`,
						},
					]}
				/>
				<fieldset className="flex flex-wrap gap-2">
					<legend className="sr-only">Secciones del evento</legend>
					{(
						[
							["companies", "Empresas y auspicios"],
							["budget", "Presupuesto"],
							["benefits", "Compromisos"],
							["drafts", "Correos por revisar"],
						] as const
					).map(([id, label]) => (
						<Button
							key={id}
							aria-pressed={tab === id}
							variant={tab === id ? "default" : "outline"}
							onClick={() => setTab(id)}
						>
							{label}
						</Button>
					))}
				</fieldset>
				{tab === "companies" && (
					<>
						<div className="flex flex-wrap gap-3">
							<div>
								<NativeSelect
									aria-label="Categoría"
									value={category}
									onChange={(e) => setCategory(e.target.value)}
								>
									<NativeSelectOption value="">
										Todas las categorías
									</NativeSelectOption>
									{categories.map((c) => (
										<NativeSelectOption key={c}>{c}</NativeSelectOption>
									))}
								</NativeSelect>
							</div>
							<div>
								<NativeSelect
									aria-label="Etapa"
									value={stage}
									onChange={(e) => setStage(e.target.value)}
								>
									<NativeSelectOption value="">
										Todas las etapas
									</NativeSelectOption>
									{Object.entries(stages).map(([v, l]) => (
										<NativeSelectOption key={v} value={v}>
											{l}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</div>
							<CompanyLinker
								linkedIds={event.sponsorships.map((s) => s.companyId)}
								disabled={!writable}
								onLink={async (companyId) => {
									await execute({
										action: "linkCompany",
										eventId: event.id,
										companyId,
									});
								}}
							/>
						</div>
						{!sponsors.length && (
							<LookoutCard>
								<p>
									{event.sponsorships.length
										? "No hay empresas con estos filtros."
										: "Añade una empresa de la base compartida para empezar este evento."}
								</p>
							</LookoutCard>
						)}
						{sponsors.map((s) => (
							<SponsorCard
								key={s.id}
								s={s}
								event={event}
								data={data}
								execute={execute}
								writable={writable}
							/>
						))}
					</>
				)}
				{tab === "budget" && (
					<LookoutCard>
						<div className="flex justify-between">
							<h2 className="text-lg font-medium">
								Presupuesto del evento · CLP
							</h2>
							<BudgetEditor
								event={event}
								execute={execute}
								writable={writable}
							/>
						</div>
						<p>
							Registra lo previsto, lo gastado y lo pagado. Los canjes se
							registran en el auspicio.
						</p>
						{event.budget.map((line) => (
							<LookoutRow key={line.id}>
								<div>
									<p>{line.description}</p>
									<p className="text-sm text-muted-foreground">
										{line.category} · Previsto {clp(line.planned)} · Real{" "}
										{clp(line.actual)} ·{" "}
										{line.actual === 0
											? "Sin gasto real"
											: line.paid
												? "Pagado"
												: "Pendiente de pago"}
									</p>
								</div>
								<BudgetEditor
									event={event}
									execute={execute}
									writable={writable}
									line={line}
								/>
							</LookoutRow>
						))}
						{!event.budget.length && <p>Aún no hay gastos registrados.</p>}
						<p>Saldo de caja según lo registrado: {clp(f.received - f.paid)}</p>
					</LookoutCard>
				)}
				{tab === "benefits" && (
					<LookoutCard>
						<h2>Lo que nos comprometimos a entregar</h2>
						{event.sponsorships.flatMap((s) =>
							s.benefits.map((b) => (
								<LookoutRow key={b.id}>
									<div>
										<p>{b.description}</p>
										<p className="text-sm">
											{s.company.name} · {shortDate(b.dueAt)} ·{" "}
											{b.status === "done" ? "Cumplido" : "Pendiente"}
										</p>
									</div>
									<Editor
										title="Editar compromiso"
										disabled={!writable}
										fields={[
											{
												name: "description",
												label: "Compromiso",
												value: b.description,
												required: true,
											},
											{
												name: "dueAt",
												label: "Fecha límite",
												type: "date",
												value: dateInput(b.dueAt),
											},
											{
												name: "status",
												label: "Estado",
												type: "select",
												value: b.status,
												options: options({
													pending: "Pendiente",
													done: "Cumplido",
												}),
											},
										]}
										onSave={async (form) => {
											await execute({
												action: "saveBenefit",
												eventId: event.id,
												sponsorshipId: s.id,
												id: b.id,
												description: value(form, "description"),
												dueAt: dateValue(form, "dueAt"),
												status:
													value(form, "status") === "done" ? "done" : "pending",
											});
										}}
									/>
								</LookoutRow>
							)),
						)}
						{!event.sponsorships.some((s) => s.benefits.length) && (
							<p>Añade compromisos desde la ficha de cada auspicio.</p>
						)}
					</LookoutCard>
				)}
				{tab === "drafts" && (
					<LookoutCard>
						<h2>Revisión humana antes del envío</h2>
						<p>
							Revisa y aprueba cada correo. Después confirma el envío desde tu
							cuenta conectada de Gmail.
						</p>
						{event.sponsorships.flatMap((s) =>
							s.drafts.map((d) => (
								<DraftCard
									key={d.id}
									draft={d}
									s={s}
									event={event}
									execute={execute}
									writable={writable}
								/>
							)),
						)}
						{!event.sponsorships.some((s) => s.drafts.length) && (
							<p>Crea un borrador desde una empresa del evento.</p>
						)}
					</LookoutCard>
				)}
			</PageShellContent>
		</PageShell>
	);
}

function BudgetEditor({
	event,
	execute,
	writable,
	line,
}: {
	event: SponsorEvent;
	execute: Execute;
	writable: boolean;
	line?: SponsorEvent["budget"][number];
}) {
	return (
		<Editor
			title={line ? "Editar gasto" : "Añadir gasto"}
			disabled={!writable}
			fields={[
				{
					name: "description",
					label: "Concepto",
					value: line?.description,
					required: true,
				},
				{
					name: "category",
					label: "Categoría",
					value: line?.category ?? "Producción",
					required: true,
				},
				{
					name: "planned",
					label: "Presupuestado (CLP)",
					type: "number",
					value: line?.planned ?? 0,
				},
				{
					name: "actual",
					label: "Gasto real (CLP)",
					type: "number",
					value: line?.actual ?? 0,
				},
				{
					name: "paid",
					label: "Pago",
					type: "select",
					value: line?.paid ? "yes" : "no",
					options: options({ no: "Pendiente", yes: "Pagado" }),
				},
			]}
			onSave={async (form) => {
				await execute({
					action: "saveBudget",
					eventId: event.id,
					id: line?.id,
					data: {
						description: value(form, "description"),
						category: value(form, "category"),
						planned: number(form, "planned"),
						actual: number(form, "actual"),
						paid: value(form, "paid") === "yes",
					},
				});
			}}
		/>
	);
}

function SponsorCard({
	s,
	event,
	data,
	execute,
	writable,
}: {
	s: Sponsorship;
	event: SponsorEvent;
	data: Snapshot;
	execute: Execute;
	writable: boolean;
}) {
	const openRecord = useOpenRecord();
	const p = profileOf(s.company.sponsorshipProfile);
	const contact = s.contact;
	const overlaps = data.events.filter(
		(e) =>
			e.id !== event.id &&
			e.sponsorships.some((other) => other.companyId === s.companyId),
	);
	return (
		<LookoutCard>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<Button
						variant="link"
						onClick={() => openRecord({ kind: "company", id: s.companyId })}
					>
						{s.company.name}
					</Button>
					<div className="flex flex-wrap gap-2">
						{p.categories.map((c) => (
							<Badge key={c} variant="secondary">
								{c}
							</Badge>
						))}
						<Badge variant="outline">{stages[s.stage]}</Badge>
						{p.doNotContact && (
							<Badge variant="destructive">No contactar</Badge>
						)}
					</div>
				</div>
				<Editor
					title="Gestionar auspicio"
					disabled={!writable}
					fields={[
						{
							name: "stage",
							label: "Etapa",
							type: "select",
							value: s.stage,
							options: options(stages),
						},
						{
							name: "contactId",
							label: "Contacto",
							type: "contact",
							companyId: s.companyId,
							value: s.contactId ?? "",
							selectedContact: s.contact
								? {
										id: s.contact.id,
										name: `${s.contact.firstName} ${s.contact.lastName ?? ""}`.trim(),
										email: s.contact.email,
									}
								: undefined,
						},
						{
							name: "lastContactedAt",
							label: "Último contacto",
							type: "date",
							value: dateInput(s.lastContactedAt),
						},
						{
							name: "nextFollowupAt",
							label: "Próximo seguimiento",
							type: "date",
							value: dateInput(s.nextFollowupAt),
						},
						{
							name: "fitScore",
							label: "Afinidad con el evento (0–100)",
							type: "number",
							value: s.fitScore,
							max: 100,
						},
						{
							name: "priority",
							label: "Prioridad (0–100)",
							type: "number",
							value: s.priority,
							max: 100,
						},
						{
							name: "notes",
							label: "Notas del evento",
							type: "textarea",
							value: s.notes ?? "",
						},
						{
							name: "selectedContactReason",
							label: "Por qué elegimos este contacto",
							value: s.selectedContactReason ?? "",
						},
						{
							name: "futureNotes",
							label: "Ideas para próximos eventos",
							value: s.futureNotes ?? "",
						},
					]}
					onSave={async (form) => {
						await execute({
							action: "updateSponsorship",
							id: s.id,
							eventId: event.id,
							stage: stageSchema.parse(value(form, "stage")),
							contactId: value(form, "contactId") || null,
							notes: value(form, "notes"),
							lastContactedAt: dateValue(form, "lastContactedAt"),
							nextFollowupAt: dateValue(form, "nextFollowupAt"),
							fitScore: number(form, "fitScore"),
							priority: number(form, "priority"),
							selectedContactReason: value(form, "selectedContactReason"),
							futureNotes: value(form, "futureNotes"),
						});
					}}
				/>
			</div>
			{contact && (
				<Button
					variant="link"
					onClick={() => openRecord({ kind: "contact", id: contact.id })}
				>
					{contact.firstName} {contact.lastName} ·{" "}
					{contact.email ?? "Sin correo"}
				</Button>
			)}
			{s.notes && <p>{s.notes}</p>}
			{s.nextFollowupAt && (
				<p className="text-sm">Seguimiento: {shortDate(s.nextFollowupAt)}</p>
			)}
			{overlaps.length > 0 && (
				<p className="text-sm text-muted-foreground">
					También participa en: {overlaps.map((e) => e.name).join(", ")}
				</p>
			)}
			{s.contributions.map((c) => (
				<LookoutRow key={c.id}>
					<div>
						<p>{c.description}</p>
						<p className="text-sm">
							{c.kind === "cash"
								? clp(c.amount)
								: `${c.quantity} ${c.unit} · valor total estimado ${clp(c.estimatedValue)}`}{" "}
							·{" "}
							{
								{
									proposed: "Propuesto",
									committed: "Comprometido",
									received: "Recibido",
									cancelled: "Cancelado",
								}[c.status]
							}
						</p>
					</div>
					<ContributionEditor
						event={event}
						s={s}
						execute={execute}
						writable={writable}
						contribution={c}
					/>
				</LookoutRow>
			))}
			<div className="flex flex-wrap gap-2">
				<ContributionEditor
					event={event}
					s={s}
					execute={execute}
					writable={writable}
				/>
				<Editor
					title="Añadir compromiso"
					disabled={!writable}
					fields={[
						{
							name: "description",
							label: "Qué debemos entregar",
							required: true,
						},
						{ name: "dueAt", label: "Fecha límite", type: "date" },
					]}
					onSave={async (form) => {
						await execute({
							action: "saveBenefit",
							eventId: event.id,
							sponsorshipId: s.id,
							description: value(form, "description"),
							dueAt: dateValue(form, "dueAt"),
							status: "pending",
						});
					}}
				/>
				<Editor
					title="Crear borrador"
					disabled={!writable}
					fields={[
						{ name: "subject", label: "Asunto", required: true },
						{ name: "body", label: "Correo", type: "textarea", required: true },
					]}
					onSave={async (form) => {
						await execute({
							action: "saveDraft",
							eventId: event.id,
							sponsorshipId: s.id,
							subject: value(form, "subject"),
							body: value(form, "body"),
						});
					}}
				/>
			</div>
		</LookoutCard>
	);
}

function ContributionEditor({
	event,
	s,
	execute,
	writable,
	contribution: c,
}: {
	event: SponsorEvent;
	s: Sponsorship;
	execute: Execute;
	writable: boolean;
	contribution?: Sponsorship["contributions"][number];
}) {
	return (
		<Editor
			title={c ? "Editar aporte" : "Añadir aporte"}
			disabled={!writable}
			description="Registra dinero, productos y servicios por separado. En los canjes, indica el valor total estimado."
			fields={[
				{
					name: "kind",
					label: "Tipo de aporte",
					type: "select",
					value: c?.kind ?? "product",
					options: options({
						cash: "Dinero",
						product: "Productos",
						service: "Servicios",
					}),
				},
				{
					name: "description",
					label: "Descripción",
					required: true,
					value: c?.description,
				},
				{
					name: "status",
					label: "Estado",
					type: "select",
					value: c?.status ?? "proposed",
					options: options({
						proposed: "Propuesto",
						committed: "Comprometido",
						received: "Recibido",
						cancelled: "Cancelado",
					}),
				},
				{
					name: "amount",
					label: "Monto en dinero (CLP)",
					type: "number",
					value: c?.amount ?? 0,
					visibleWhen: { field: "kind", values: ["cash"] },
				},
				{
					name: "quantity",
					label: "Cantidad",
					type: "number",
					min: 1,
					value: c?.quantity ?? 1,
					visibleWhen: { field: "kind", values: ["product", "service"] },
				},
				{
					name: "unit",
					label: "Unidad (latas, cajas, horas…)",
					value: c?.unit ?? "unidades",
					visibleWhen: { field: "kind", values: ["product", "service"] },
				},
				{
					name: "estimatedValue",
					label: "Valor total estimado del canje (CLP)",
					type: "number",
					value: c?.estimatedValue ?? 0,
					visibleWhen: { field: "kind", values: ["product", "service"] },
				},
			]}
			onSave={async (form) => {
				const kind = value(form, "kind");
				const status = value(form, "status");
				await execute({
					action: "saveContribution",
					eventId: event.id,
					sponsorshipId: s.id,
					id: c?.id,
					data: {
						kind:
							kind === "cash"
								? "cash"
								: kind === "service"
									? "service"
									: "product",
						status:
							status === "committed"
								? "committed"
								: status === "received"
									? "received"
									: status === "cancelled"
										? "cancelled"
										: "proposed",
						description: value(form, "description"),
						amount: kind === "cash" ? number(form, "amount") : 0,
						quantity: kind === "cash" ? 1 : number(form, "quantity"),
						unit: kind === "cash" ? "unidades" : value(form, "unit"),
						estimatedValue:
							kind === "cash" ? 0 : number(form, "estimatedValue"),
					},
				});
			}}
		/>
	);
}
function DraftCard({
	draft: d,
	s,
	event,
	execute,
	writable,
}: {
	draft: Sponsorship["drafts"][number];
	s: Sponsorship;
	event: SponsorEvent;
	execute: Execute;
	writable: boolean;
}) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<LookoutCard>
			<Badge variant="outline">
				{{
					approved: "Aprobado · sin enviar",
					sent: "Enviado",
					sending: "Enviando · pendiente de confirmar",
					send_uncertain: "Revisa el resultado en Gmail",
					needs_review: "Pendiente de revisión",
				}[d.status] ?? "Pendiente de revisión"}
			</Badge>
			<h3>{d.subject}</h3>
			<p>
				{s.company.name} ·{" "}
				{d.recipientEmail ?? s.contact?.email ?? "Selecciona un contacto"}
			</p>
			<p className="whitespace-pre-wrap">{d.body}</p>
			<div className="flex gap-2">
				<Editor
					title="Editar borrador"
					disabled={
						!writable || !["needs_review", "approved"].includes(d.status)
					}
					fields={[
						{
							name: "subject",
							label: "Asunto",
							value: d.subject,
							required: true,
						},
						{
							name: "body",
							label: "Correo",
							type: "textarea",
							value: d.body,
							required: true,
						},
					]}
					onSave={async (form) => {
						await execute({
							action: "saveDraft",
							eventId: event.id,
							sponsorshipId: s.id,
							id: d.id,
							subject: value(form, "subject"),
							body: value(form, "body"),
						});
					}}
				/>
				<Button
					disabled={
						!writable ||
						busy ||
						!["needs_review", "approved"].includes(d.status)
					}
					onClick={async () => {
						setBusy(true);
						setError("");
						try {
							await execute({
								action: "approveDraft",
								eventId: event.id,
								id: d.id,
							});
						} catch (e) {
							setError(e instanceof Error ? e.message : "No se pudo aprobar.");
						} finally {
							setBusy(false);
						}
					}}
				>
					{d.status === "approved" ? "Volver a aprobar" : "Aprobar borrador"}
				</Button>
				{writable && (
					<DraftDelivery
						id={d.id}
						eventId={event.id}
						eventName={event.name}
						recipient={s.contact?.email ?? null}
						subject={d.subject}
						body={d.body}
						status={d.status}
					/>
				)}
			</div>
			{d.sentAt && (
				<p className="text-muted-foreground text-sm">
					Enviado el {new Date(d.sentAt).toLocaleString("es-CL")} desde{" "}
					{d.senderEmail}.
				</p>
			)}
			{d.sendError && <p role="alert">{d.sendError}</p>}
			{error && <p role="alert">{error}</p>}
		</LookoutCard>
	);
}
