"use client";

import Add from "@carbon/icons-react/es/Add";
import Partnership from "@carbon/icons-react/es/Partnership";
import Star from "@carbon/icons-react/es/Star";
import StarFilled from "@carbon/icons-react/es/StarFilled";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import type { FieldValueJson } from "@crm/db/fields";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { EnrichmentActions } from "@/components/crm/enrichment-actions";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineField,
	InlineSelectField,
	savingValue,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { CompanySocials } from "@/components/crm/social-links";
import { DealStageMenu } from "@/components/crm/stage-change";
import { Timeline } from "@/components/crm/timeline/timeline";
import { WebsiteActivity } from "@/components/crm/website-activity";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetMain,
	DetailSheetPending,
	DetailSheetProperties,
	DetailSheetProse,
	DetailSheetRail,
	DetailSheetSection,
	DetailSheetSplit,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { LocalDay } from "@/components/local-date-time";
import { SponsorProfile } from "@/components/lookout/profile";
import { ENRICHMENT_POLL_MS, isEnriching } from "@/lib/enrichment-status";
import { savingField } from "@/lib/pending-field";
import { hasCompanyLinks } from "@/lib/social-links";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { QuickAddContact } from "./quick-add";
import { RecordActions } from "./record-actions";
import {
	AddRow,
	DealAmount,
	DomainLink,
	MetaLine,
	RecordSheetFrame,
} from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Company = RouterOutputs["companies"]["byId"];

const UNASSIGNED = "unassigned";

function pendingFields(company: Company): string[] {
	const missing: string[] = [];
	if (!company.industry) missing.push("industry");
	if (!company.description) missing.push("description");
	if (!hasCompanyLinks(company)) missing.push("social links");
	return missing;
}

function companyConsequence(company: Company): string {
	if (company.sponsorshipCount > 0) {
		return `Esta empresa tiene historial en ${company.sponsorshipCount} eventos. No se puede borrar definitivamente. Conserva el registro archivado.`;
	}
	const deals = company.deals.length;
	const contacts = company.contacts.length;

	const gone =
		deals > 0
			? `Se eliminarán la empresa y sus ${deals} oportunidades CRM.`
			: "Se eliminará la empresa.";

	const kept =
		contacts > 0
			? ` Sus ${contacts} contactos quedarán en el CRM sin empresa.`
			: "";

	return gone + kept;
}

const CONTACT_COLUMNS = [
	{ id: "primary", srLabel: "Principal", width: "w-10", className: "pl-5" },
	{ id: "name", header: "Nombre", width: "w-[28%]" },
	{ id: "title", header: "Cargo", width: "w-[24%]" },
	{ id: "email", header: "Correo", width: "w-[26%]" },
	{ id: "owner", header: "Responsable", width: "w-[22%]" },
];

const DEAL_COLUMNS = [
	{ id: "deal", header: "Oportunidad", width: "w-[32%]", className: "pl-5" },
	{ id: "stage", header: "Etapa", width: "w-[24%]" },
	{
		id: "amount",
		header: "Monto",
		width: "w-[16%]",
		align: "right" as const,
	},
	{ id: "close-date", header: "Fecha de cierre", width: "w-[14%]" },
	{ id: "owner", header: "Responsable", width: "w-[14%]" },
];

export function CompanySheet({ companyId }: { companyId: string }) {
	const trpc = useTRPC();
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("overview");

	const query = useQuery({
		...trpc.companies.byId.queryOptions({ id: companyId }),
		refetchInterval: (current) => {
			const record = current.state.data;
			return record && isEnriching(record.enrichmentStatus, record.queued)
				? ENRICHMENT_POLL_MS
				: false;
		},
	});

	const company = query.data;

	const location = company
		? [company.city, company.stateCode, company.country]
				.filter(Boolean)
				.join(", ")
		: null;

	const tabs: DetailSheetTab[] = company
		? [
				{
					value: "overview",
					label: "Resumen",
					content: <CompanyOverview company={company} />,
				},
				{
					value: "contacts",
					label: "Contactos",
					count: company.contacts.length,
					content: (
						<CompanyContacts
							company={company}
							adding={adding === "contact"}
							onAdd={() => setAdding("contact")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "deals",
					label: "Oportunidades CRM",
					count: company.deals.length,
					content: <CompanyDeals company={company} />,
				},
				{
					value: "activity",
					label: "Actividad",
					content: <Timeline anchor={{ companyId: company.id }} />,
				},
				{
					value: "agent",
					label: "Dom",
					content: <AgentPanel record={{ kind: "company", id: company.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={company?.name ?? "Empresa"}
			description={
				company ? (
					<MetaLine
						lead={
							<DomainLink domain={company.domain} website={company.website} />
						}
						parts={[location, company.industry]}
					/>
				) : undefined
			}
			note={
				company && company.enrichmentStatus !== "COMPLETE" ? (
					<EnrichmentIndicator
						status={company.enrichmentStatus}
						queued={company.queued}
						title={company.enrichmentError}
					/>
				) : null
			}
			media={
				<EntityLogo
					src={company?.iconUrl ?? company?.logoUrl}
					darkSrc={company?.iconDarkUrl}
					tone={company?.iconTone as EntityLogoTone | null | undefined}
					name={company?.name ?? "?"}
					size="lg"
				/>
			}
			actions={
				company ? (
					<>
						<EnrichmentActions
							companyId={company.id}
							hasDomain={company.domain !== null}
						/>
						<RecordActions
							record={{ kind: "company", id: company.id }}
							name={company.name}
							consequence={companyConsequence(company)}
							archivedAt={company.archivedAt}
							purgeBlocked={company.sponsorshipCount > 0}
						/>
					</>
				) : null
			}
			stats={
				company ? (
					<DetailSheetStats>
						<DetailSheetStat label="Eventos vinculados">
							<span className="tabular-nums">{company.sponsorshipCount}</span>
						</DetailSheetStat>
						<DetailSheetStat label="Contactos">
							<span className="tabular-nums">{company.contacts.length}</span>
						</DetailSheetStat>
						<DetailSheetStat label="Oportunidades CRM">
							<span className="tabular-nums">{company.deals.length}</span>
						</DetailSheetStat>
						<DetailSheetStat label="Responsable">
							<OwnerCell owner={company.owner} />
						</DetailSheetStat>
					</DetailSheetStats>
				) : null
			}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function CompanyOverview({ company }: { company: Company }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const update = useMutation(
		trpc.companies.update.mutationOptions({
			onSuccess: () => cache.company(company.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const save = (data: Record<string, string | null>) =>
		update.mutate({ id: company.id, data });

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: company.id, data: { fields } });

	const isSaving = savingField(update);
	const isSavingField = savingValue(update);

	return (
		<DetailSheetBody>
			<SponsorProfile entity="company" id={company.id} />
			<DetailSheetSplit>
				<DetailSheetMain>
					{company.description ? (
						<DetailSheetSection title="Acerca de">
							<DetailSheetProse>{company.description}</DetailSheetProse>
						</DetailSheetSection>
					) : null}

					<WebsiteActivity companyId={company.id} />
				</DetailSheetMain>

				<DetailSheetRail>
					<DetailSheetSection
						title="Detalles"
						action={<FieldsCog kind="company" />}
					>
						<DetailSheetProperties columns={1}>
							<InlineField
								label="Nombre"
								value={company.name}
								saving={isSaving("name")}
								onSave={(name) => name && save({ name })}
							/>
							<InlineField
								label="Dominio"
								value={company.domain}
								type="url"
								placeholder="stripe.com"
								saving={isSaving("domain")}
								onSave={(domain) => save({ domain })}
							/>
							<InlineField
								label="Sitio web"
								value={company.website}
								type="url"
								placeholder="https://stripe.com"
								saving={isSaving("website")}
								onSave={(website) => save({ website })}
							/>
							<InlineField
								label="Teléfono"
								value={company.phone}
								type="tel"
								saving={isSaving("phone")}
								onSave={(phone) => save({ phone })}
							/>
							<InlineField
								label="Correo"
								value={company.email}
								type="email"
								saving={isSaving("email")}
								onSave={(email) => save({ email })}
							/>
							<InlineField
								label="Ciudad"
								value={company.city}
								saving={isSaving("city")}
								onSave={(city) => save({ city })}
							/>
							<InlineField
								label="País"
								value={company.country}
								saving={isSaving("country")}
								onSave={(country) => save({ country })}
							/>
							<InlineSelectField
								label="Responsable"
								value={company.owner?.id ?? UNASSIGNED}
								options={[
									{ value: UNASSIGNED, label: "Sin asignar" },
									...(users.data ?? []).map((user) => ({
										value: user.id,
										label: user.name,
									})),
								]}
								onSave={(ownerId) =>
									save({ ownerId: ownerId === UNASSIGNED ? null : ownerId })
								}
							/>
							<RecordFields
								fields={company.fields}
								saving={isSavingField}
								onSave={saveFields}
							/>
						</DetailSheetProperties>
					</DetailSheetSection>

					<DetailSheetPending
						fields={pendingFields(company)}
						running={isEnriching(company.enrichmentStatus, company.queued)}
					/>

					{hasCompanyLinks(company) ? (
						<DetailSheetSection title="Enlaces">
							<CompanySocials company={company} />
						</DetailSheetSection>
					) : null}
				</DetailSheetRail>
			</DetailSheetSplit>
		</DetailSheetBody>
	);
}

function CompanyContacts({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const setPrimary = useMutation(
		trpc.companies.setPrimaryContact.mutationOptions({
			onSuccess: () => cache.company(company.id),
			onError: (error) => toast.error(error.message),
		}),
	);

	const form = adding ? (
		<QuickAddContact
			companyId={company.id}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UserMultiple}
						title="Todavía no hay contactos"
						description={`Agrega a la primera persona de ${company.name}. Sus correos, llamadas y notas quedarán juntos aquí.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								Añadir contacto
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable variant="panel" columns={CONTACT_COLUMNS}>
				{company.contacts.map((contact) => {
					const isPrimary = contact.id === company.primaryContactId;
					return (
						<SimpleTableRow
							key={contact.id}
							clickable
							onClick={() => openRecord({ kind: "contact", id: contact.id })}
						>
							<TableCell className="w-10 py-2.5 pl-5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-xs"
											aria-pressed={isPrimary}
											disabled={isPrimary || setPrimary.isPending}
											onClick={(event) => {
												event.stopPropagation();
												setPrimary.mutate({
													companyId: company.id,
													contactId: contact.id,
												});
											}}
										>
											<Icon icon={isPrimary ? StarFilled : Star} />
											<span className="sr-only">
												{isPrimary
													? "Contacto principal"
													: "Marcar como principal"}
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{isPrimary ? "Contacto principal" : "Marcar como principal"}
									</TooltipContent>
								</Tooltip>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 font-medium">
								<span className="flex min-w-0 items-center gap-2">
									<PersonAvatar
										src={contact.imageUrl}
										name={[contact.firstName, contact.lastName]
											.filter(Boolean)
											.join(" ")}
										email={contact.email}
										size="sm"
									/>
									<span className="truncate">
										{[contact.firstName, contact.lastName]
											.filter(Boolean)
											.join(" ")}
									</span>
								</span>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5">
								{contact.title ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
								{contact.email ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="px-3 py-2.5">
								<OwnerCell owner={contact.owner} />
							</TableCell>
						</SimpleTableRow>
					);
				})}

				<AddRow
					label="Añadir contacto"
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}

function CompanyDeals({ company }: { company: Company }) {
	const openRecord = useOpenRecord();

	if (company.deals.length === 0) {
		return (
			<DetailSheetEmpty
				icon={Partnership}
				title="Sin oportunidades CRM anteriores"
				description="Los auspicios actuales se gestionan dentro de cada evento. Revisa la pestaña Resumen para verlos."
			/>
		);
	}

	return (
		<SimpleTable variant="panel" columns={DEAL_COLUMNS}>
			{company.deals.map((deal) => (
				<SimpleTableRow
					key={deal.id}
					clickable
					onClick={() => openRecord({ kind: "deal", id: deal.id })}
				>
					<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
						{deal.name}
					</TableCell>
					<TableCell className="px-3 py-2.5">
						<DealStageMenu dealId={deal.id} stage={deal.stage} />
					</TableCell>
					<TableCell className="px-3 py-2.5 text-right">
						<DealAmount
							amountCents={deal.amountCents}
							currency={deal.currency}
						/>
					</TableCell>
					<TableCell className="px-3 py-2.5 text-muted-foreground">
						{deal.expectedCloseDate ? (
							<LocalDay date={deal.expectedCloseDate} />
						) : (
							<EmptyCellValue />
						)}
					</TableCell>
					<TableCell className="px-3 py-2.5">
						<OwnerCell owner={deal.owner} />
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
