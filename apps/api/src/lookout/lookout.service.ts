import type { Db, Prisma } from "@crm/db";
import {
	OperationsScopeError,
	readLookoutOperations,
} from "@crm/db/lookout-operations";
import {
	RUNTIME_SECRET_NAMES,
	readRuntimeSecret,
} from "@crm/db/runtime-secrets";
import { readAgentModel } from "@crm/db/settings";
import {
	type Command,
	commandInput,
	contactSearchInput,
	contactSearchOutput,
	operationsInput,
	operationsOutput,
	profileSchema,
	snapshotInput,
	snapshotOutput,
	usageInput,
} from "@crm/validation/lookout";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import {
	deliveryRecipient,
	draftApprovalHash,
	revokeDraftApprovals,
} from "./approvals";
import { LOOKOUT } from "./lookout.config";

type SponsorshipForApproval = Prisma.SponsorshipGetPayload<{
	include: { company: true; contact: true };
}>;

@Injectable()
export class LookoutService {
	constructor(@InjectDatabase() private readonly db: Db) {}
	async operations(userId: string, input: z.infer<typeof operationsInput>) {
		try {
			return operationsOutput.parse(
				await readLookoutOperations(this.db, userId, input),
			);
		} catch (error) {
			if (error instanceof OperationsScopeError)
				throw new BadRequestException(error.message);
			throw error;
		}
	}
	async runtimeStatus() {
		const model = await readAgentModel(this.db);
		const configured = model.id.startsWith("zai/")
			? Boolean(
					process.env.GLM_API_KEY?.trim() ||
						(await readRuntimeSecret(RUNTIME_SECRET_NAMES.glmApiKey)),
				)
			: Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
		let agentAvailable = false;
		if (process.env.AGENT_URL && process.env.AGENT_BRIDGE_SECRET) {
			try {
				const health = await fetch(
					new URL("/eve/v1/health", process.env.AGENT_URL),
					{ signal: AbortSignal.timeout(LOOKOUT.agentHealthTimeoutMs) },
				);
				agentAvailable = health.ok;
			} catch {
				agentAvailable = false;
			}
		}
		return { model: model.id, configured, agentAvailable };
	}
	async snapshot(userId: string, input: z.infer<typeof snapshotInput>) {
		const users = await this.db.user.findMany({
			select: { id: true, name: true },
			orderBy: { name: "asc" },
		});
		const workAreas = await this.db.workArea.findMany({
			where: { ownerId: input.ownerId ?? userId },
			orderBy: { createdAt: "asc" },
		});
		const selectedWork = input.workAreaId
			? workAreas.find((w) => w.id === input.workAreaId)
			: workAreas[0];
		if (input.workAreaId && !selectedWork)
			throw new NotFoundException(
				"El trabajo no pertenece a la sección seleccionada.",
			);
		const [events, companies, contacts, companyCount] = await Promise.all([
			selectedWork
				? this.db.sponsorEvent.findMany({
						where: { workAreaId: selectedWork.id },
						orderBy: { createdAt: "desc" },
						include: {
							budget: true,
							sponsorships: {
								orderBy: { priority: "desc" },
								include: {
									company: true,
									contact: true,
									contributions: true,
									benefits: true,
									drafts: { orderBy: { createdAt: "desc" } },
								},
							},
						},
					})
				: [],
			this.db.company.findMany({
				where: { archivedAt: null },
				orderBy: { name: "asc" },
				take: 2000,
				select: {
					id: true,
					name: true,
					domain: true,
					industry: true,
					sponsorshipProfile: true,
				},
			}),
			this.db.contact.findMany({
				where: { archivedAt: null },
				orderBy: { firstName: "asc" },
				take: 5000,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					companyId: true,
					sponsorshipProfile: true,
				},
			}),
			this.db.company.count({ where: { archivedAt: null } }),
		]);
		return snapshotOutput.parse(
			JSON.parse(
				JSON.stringify({
					userId,
					users,
					workAreas,
					selectedWork: selectedWork ?? null,
					events,
					companies,
					contacts,
					companyCount,
					storage: process.env.DATABASE_URL?.includes("supabase")
						? "supabase"
						: "local",
				}),
			),
		);
	}
	async profile(entity: "company" | "contact", id: string) {
		const row =
			entity === "company"
				? await this.db.company.findUnique({ where: { id } })
				: await this.db.contact.findUnique({ where: { id } });
		if (!row) throw new NotFoundException("Registro no encontrado.");
		return profileSchema.parse(row.sponsorshipProfile ?? {});
	}
	async searchContacts(input: z.infer<typeof contactSearchInput>) {
		const company = await this.db.company.findFirst({
			where: { id: input.companyId, archivedAt: null },
			select: { id: true },
		});
		if (!company) throw new NotFoundException("Empresa no disponible.");
		const where: Prisma.ContactWhereInput = {
			companyId: company.id,
			archivedAt: null,
			...(input.q
				? {
						OR: [
							{
								firstName: { contains: input.q, mode: "insensitive" as const },
							},
							{ lastName: { contains: input.q, mode: "insensitive" as const } },
							{ email: { contains: input.q, mode: "insensitive" as const } },
							{ title: { contains: input.q, mode: "insensitive" as const } },
						],
					}
				: {}),
		};
		const [rows, total] = await Promise.all([
			this.db.contact.findMany({
				where,
				orderBy: [{ firstName: "asc" }, { id: "asc" }],
				take: input.take,
			}),
			this.db.contact.count({ where }),
		]);
		return contactSearchOutput.parse(
			JSON.parse(JSON.stringify({ rows, total })),
		);
	}
	async usage(input: z.infer<typeof usageInput>) {
		const where =
			input.entity === "company"
				? { companyId: input.id }
				: { contactId: input.id };
		const [rows, total] = await Promise.all([
			this.db.sponsorship.findMany({
				where,
				skip: (input.page - 1) * 20,
				take: 20,
				orderBy: { updatedAt: "desc" },
				include: {
					event: {
						include: {
							workArea: {
								include: { owner: { select: { id: true, name: true } } },
							},
						},
					},
				},
			}),
			this.db.sponsorship.count({ where }),
		]);
		return {
			total,
			rows: rows.map((s) => ({
				id: s.id,
				eventId: s.event.id,
				eventName: s.event.name,
				workId: s.event.workArea.id,
				workName: s.event.workArea.name,
				ownerId: s.event.workArea.owner.id,
				ownerName: s.event.workArea.owner.name,
				stage: s.stage,
				eventStatus: s.event.status,
			})),
		};
	}
	private async work(tx: Prisma.TransactionClient, id: string, userId: string) {
		const row = await tx.workArea.findUnique({ where: { id } });
		if (!row) throw new NotFoundException("Trabajo no encontrado.");
		if (row.ownerId !== userId)
			throw new ForbiddenException(
				"Puedes consultar esta sección. Solo su responsable puede modificarla.",
			);
		return row;
	}
	async command(userId: string, raw: z.infer<typeof commandInput>) {
		const input: Command = commandInput.parse(raw);
		if (
			(input.action === "createEvent" || input.action === "updateEvent") &&
			input.data.startsOn &&
			input.data.endsOn &&
			input.data.endsOn < input.data.startsOn
		)
			throw new BadRequestException(
				"El fin de la campaña debe ser posterior al inicio.",
			);
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The command handlers share one transaction and authorization boundary.
		return this.db.$transaction(async (tx) => {
			if (input.action === "createWork") {
				const row = await tx.workArea.create({
					data: { ...input.data, ownerId: userId },
				});
				return { ok: true as const, id: row.id };
			}
			if (input.action === "updateWork") {
				await this.work(tx, input.id, userId);
				await tx.workArea.update({ where: { id: input.id }, data: input.data });
				return { ok: true as const, id: input.id };
			}
			if (input.action === "createEvent") {
				await this.work(tx, input.workAreaId, userId);
				const row = await tx.sponsorEvent.create({
					data: { ...input.data, workAreaId: input.workAreaId },
				});
				return { ok: true as const, id: row.id };
			}
			if (input.action === "saveProfile") {
				if (input.entity === "company")
					await tx.company.update({
						where: { id: input.id },
						data: { sponsorshipProfile: input.data },
					});
				else
					await tx.contact.update({
						where: { id: input.id },
						data: { sponsorshipProfile: input.data },
					});
				if (
					input.data.doNotContact ||
					(input.entity === "contact" &&
						(["invalid", "risky"].includes(input.data.verificationStatus) ||
							input.data.bounceCount > 0))
				) {
					await revokeDraftApprovals(tx, {
						sponsorship:
							input.entity === "company"
								? { companyId: input.id }
								: { contactId: input.id },
					});
				}
				return { ok: true as const, id: input.id };
			}
			const event = await tx.sponsorEvent.findUnique({
				where: { id: input.eventId },
			});
			if (!event) throw new NotFoundException("Evento no encontrado.");
			await this.work(tx, event.workAreaId, userId);
			if (input.action === "updateEvent") {
				await tx.sponsorEvent.update({
					where: { id: event.id },
					data: input.data,
				});
				return { ok: true as const, id: event.id };
			}
			if (input.action === "saveBudget") {
				if (
					input.id &&
					!(await tx.budgetLine.findFirst({
						where: { id: input.id, eventId: event.id },
					}))
				)
					throw new NotFoundException("Gasto fuera de este evento.");
				const row = input.id
					? await tx.budgetLine.update({
							where: { id: input.id },
							data: input.data,
						})
					: await tx.budgetLine.create({
							data: { ...input.data, eventId: event.id },
						});
				return { ok: true as const, id: row.id };
			}
			if (input.action === "linkCompany") {
				const company = await tx.company.findFirst({
					where: { id: input.companyId, archivedAt: null },
				});
				if (!company) throw new NotFoundException("Empresa no disponible.");
				if (
					input.contactId &&
					!(await tx.contact.findFirst({
						where: {
							id: input.contactId,
							companyId: company.id,
							archivedAt: null,
						},
					}))
				)
					throw new BadRequestException(
						"El contacto no pertenece a la empresa.",
					);
				const row = await tx.sponsorship.upsert({
					where: {
						eventId_companyId: { eventId: event.id, companyId: company.id },
					},
					create: {
						eventId: event.id,
						companyId: company.id,
						contactId: input.contactId,
					},
					update: {},
				});
				return { ok: true as const, id: row.id };
			}
			const sponsorshipId = this.sponsorshipId(input);
			const draft =
				input.action === "approveDraft"
					? await tx.sponsorDraft.findUnique({ where: { id: input.id } })
					: null;
			const sponsorship = await tx.sponsorship.findFirst({
				where: {
					id: sponsorshipId ?? draft?.sponsorshipId ?? "missing",
					eventId: event.id,
				},
				include: { company: true, contact: true },
			});
			if (!sponsorship)
				throw new NotFoundException("Auspicio fuera de este evento.");
			if (input.action === "updateSponsorship") {
				if (
					input.contactId &&
					!(await tx.contact.findFirst({
						where: {
							id: input.contactId,
							companyId: sponsorship.companyId,
							archivedAt: null,
						},
					}))
				)
					throw new BadRequestException(
						"El contacto no pertenece a la empresa.",
					);
				const { action, eventId, id, ...data } = input;
				if (
					input.contactId !== undefined &&
					input.contactId !== sponsorship.contactId
				)
					await revokeDraftApprovals(tx, { sponsorshipId: id });
				await tx.sponsorship.update({ where: { id }, data });
				return { ok: true as const, id };
			}
			if (input.action === "saveContribution") {
				if (
					input.id &&
					!(await tx.contribution.findFirst({
						where: { id: input.id, sponsorshipId: sponsorship.id },
					}))
				)
					throw new NotFoundException("Aporte fuera de este auspicio.");
				const old = input.id
					? await tx.contribution.findUnique({ where: { id: input.id } })
					: null;
				const data = {
					...input.data,
					receivedAt:
						input.data.status === "received"
							? (old?.receivedAt ?? new Date())
							: null,
				};
				const row = input.id
					? await tx.contribution.update({ where: { id: input.id }, data })
					: await tx.contribution.create({
							data: { ...data, sponsorshipId: sponsorship.id },
						});
				return { ok: true as const, id: row.id };
			}
			if (input.action === "saveBenefit") {
				if (
					input.id &&
					!(await tx.sponsorBenefit.findFirst({
						where: { id: input.id, sponsorshipId: sponsorship.id },
					}))
				)
					throw new NotFoundException("Compromiso fuera de este auspicio.");
				const data = {
					description: input.description,
					dueAt: input.dueAt,
					status: input.status,
				};
				const row = input.id
					? await tx.sponsorBenefit.update({ where: { id: input.id }, data })
					: await tx.sponsorBenefit.create({
							data: { ...data, sponsorshipId: sponsorship.id },
						});
				return { ok: true as const, id: row.id };
			}
			if (input.action === "saveDraft") {
				const old = input.id
					? await tx.sponsorDraft.findFirst({
							where: { id: input.id, sponsorshipId: sponsorship.id },
						})
					: null;
				if (input.id && !old)
					throw new NotFoundException("Borrador fuera de este auspicio.");
				if (old && !["needs_review", "approved"].includes(old.status))
					throw new ConflictException(
						"Este correo ya se envió o está pendiente de confirmar. Prepara un borrador nuevo.",
					);
				const data = {
					subject: input.subject,
					body: input.body,
					status: "needs_review",
					approvedBy: null,
					approvedAt: null,
					approvalHash: null,
					sendError: null,
				};
				if (old) {
					const updated = await tx.sponsorDraft.updateMany({
						where: { id: old.id, updatedAt: old.updatedAt, status: old.status },
						data,
					});
					if (updated.count !== 1)
						throw new ConflictException(
							"El borrador cambió o comenzó a enviarse. Actualiza el evento.",
						);
					return { ok: true as const, id: old.id };
				}
				const row = await tx.sponsorDraft.create({
					data: { ...data, sponsorshipId: sponsorship.id },
				});
				return { ok: true as const, id: row.id };
			}
			if (draft) {
				await this.approveDraft(tx, sponsorship, draft, userId);
				return { ok: true as const, id: draft.id };
			}
			throw new BadRequestException("Acción no disponible.");
		});
	}
	private sponsorshipId(input: Command): string | undefined {
		if ("sponsorshipId" in input) return input.sponsorshipId;
		if (input.action === "updateSponsorship") return input.id;
		return undefined;
	}
	private async approveDraft(
		tx: Prisma.TransactionClient,
		sponsorship: SponsorshipForApproval,
		draft: Prisma.SponsorDraftGetPayload<Record<string, never>>,
		userId: string,
	) {
		if (!["needs_review", "approved"].includes(draft.status))
			throw new ConflictException(
				"Este correo ya se envió o está pendiente de confirmar.",
			);
		const email = await deliveryRecipient(tx, sponsorship);
		const updated = await tx.sponsorDraft.updateMany({
			where: { id: draft.id, status: draft.status, updatedAt: draft.updatedAt },
			data: {
				status: "approved",
				approvedBy: userId,
				approvedAt: new Date(),
				recipientEmail: email,
				approvalHash: draftApprovalHash(draft, email),
				sendError: null,
			},
		});
		if (updated.count !== 1)
			throw new ConflictException(
				"El borrador cambió. Actualiza y revísalo nuevamente.",
			);
	}
}
