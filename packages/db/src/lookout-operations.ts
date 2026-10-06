import type { Db, Prisma } from "./index";
import { WORKSPACE_ID } from "./workspace";

export const OPERATIONS = {
	listLimit: 10,
	followupWindowMs: 24 * 60 * 60_000,
	mailPreviewCharacters: 500,
} as const;

export type OperationsScope = {
	ownerId?: string;
	workAreaId?: string;
	eventId?: string;
};

export class OperationsScopeError extends Error {}

export async function readLookoutOperations(
	db: Db,
	userId: string,
	scope: OperationsScope,
	now = new Date(),
) {
	const work = await db.workArea.findFirst({
		where: {
			...(scope.workAreaId ? { id: scope.workAreaId } : {}),
			ownerId: scope.ownerId ?? userId,
			owner: { members: { some: { organizationId: WORKSPACE_ID } } },
		},
		orderBy: { createdAt: "asc" },
		select: { id: true, name: true, organization: true, ownerId: true },
	});
	if (scope.workAreaId && !work)
		throw new OperationsScopeError("El trabajo no pertenece a esta sección.");
	if (
		scope.eventId &&
		!(await db.sponsorEvent.findFirst({
			where: {
				id: scope.eventId,
				workAreaId: work?.id ?? "missing",
				status: { not: "archived" },
			},
			select: { id: true },
		}))
	)
		throw new OperationsScopeError("El evento no pertenece al trabajo activo.");
	const event: Prisma.SponsorEventWhereInput = {
		workAreaId: work?.id ?? "missing",
		status: { in: ["planning", "active"] },
		...(scope.eventId ? { id: scope.eventId } : {}),
	};
	const sponsorship: Prisma.SponsorshipWhereInput = {
		event,
		company: { archivedAt: null },
	};
	const dueAt = { lte: new Date(now.getTime() + OPERATIONS.followupWindowMs) };
	const followupWhere: Prisma.SponsorshipWhereInput = {
		...sponsorship,
		stage: { notIn: ["completed", "rejected"] },
		nextFollowupAt: dueAt,
	};
	const readyWhere: Prisma.SponsorshipWhereInput = {
		...sponsorship,
		stage: "ready",
	};
	const draftWhere: Prisma.SponsorDraftWhereInput = {
		sponsorship,
		status: { in: ["needs_review", "approved"] },
	};
	const benefitWhere: Prisma.SponsorBenefitWhereInput = {
		sponsorship,
		status: "pending",
		dueAt,
	};
	const relationSelect = {
		id: true,
		company: { select: { name: true } },
		event: { select: { id: true, name: true } },
	} as const;
	const ownSection = (scope.ownerId ?? userId) === userId;
	const mailWhere: Prisma.EmailMessageWhereInput = {
		syncedByUserId: userId,
		direction: "INBOUND",
		thread: {
			OR: [
				{ company: { sponsorships: { some: { event } } } },
				{ contact: { sponsorships: { some: { event } } } },
			],
		},
	};
	const [
		followups,
		drafts,
		ready,
		benefits,
		followupCount,
		draftCount,
		readyCount,
		benefitCount,
		messages,
		mailbox,
		sync,
	] = await Promise.all([
		db.sponsorship.findMany({
			where: followupWhere,
			orderBy: { nextFollowupAt: "asc" },
			take: OPERATIONS.listLimit,
			select: { ...relationSelect, nextFollowupAt: true },
		}),
		db.sponsorDraft.findMany({
			where: draftWhere,
			orderBy: { createdAt: "desc" },
			take: OPERATIONS.listLimit,
			select: {
				id: true,
				subject: true,
				status: true,
				sponsorship: { select: relationSelect },
			},
		}),
		db.sponsorship.findMany({
			where: readyWhere,
			orderBy: { priority: "desc" },
			take: OPERATIONS.listLimit,
			select: relationSelect,
		}),
		db.sponsorBenefit.findMany({
			where: benefitWhere,
			orderBy: { dueAt: "asc" },
			take: OPERATIONS.listLimit,
			select: {
				id: true,
				description: true,
				dueAt: true,
				sponsorship: { select: relationSelect },
			},
		}),
		db.sponsorship.count({ where: followupWhere }),
		db.sponsorDraft.count({ where: draftWhere }),
		db.sponsorship.count({ where: readyWhere }),
		db.sponsorBenefit.count({ where: benefitWhere }),
		ownSection
			? db.emailMessage.findMany({
					where: mailWhere,
					orderBy: { sentAt: "desc" },
					take: OPERATIONS.listLimit,
					select: {
						id: true,
						threadId: true,
						subject: true,
						snippet: true,
						fromEmail: true,
						fromName: true,
						sentAt: true,
						thread: { select: { company: { select: { name: true } } } },
					},
				})
			: [],
		ownSection
			? db.lookoutMailbox.findUnique({
					where: { userId },
					select: { email: true, scopes: true },
				})
			: null,
		ownSection
			? db.mailboxSync.findUnique({
					where: { userId_source: { userId, source: "gmail" } },
					select: { status: true, lastSyncedAt: true },
				})
			: null,
	]);
	const tasks = [
		...followups.map((s) => ({
			id: s.id,
			kind: "followup" as const,
			title: `Seguimiento a ${s.company.name}`,
			companyName: s.company.name,
			eventId: s.event.id,
			eventName: s.event.name,
			dueAt: s.nextFollowupAt?.toISOString() ?? null,
		})),
		...drafts.map((d) => ({
			id: d.id,
			kind: "draft" as const,
			title: `${d.status === "approved" ? "Listo para enviar" : "Revisar correo"}: ${d.subject}`,
			companyName: d.sponsorship.company.name,
			eventId: d.sponsorship.event.id,
			eventName: d.sponsorship.event.name,
			dueAt: null,
		})),
		...benefits.map((b) => ({
			id: b.id,
			kind: "benefit" as const,
			title: b.description,
			companyName: b.sponsorship.company.name,
			eventId: b.sponsorship.event.id,
			eventName: b.sponsorship.event.name,
			dueAt: b.dueAt?.toISOString() ?? null,
		})),
		...ready.map((s) => ({
			id: s.id,
			kind: "ready" as const,
			title: `Preparar contacto con ${s.company.name}`,
			companyName: s.company.name,
			eventId: s.event.id,
			eventName: s.event.name,
			dueAt: null,
		})),
	];
	return {
		work,
		canEdit: work?.ownerId === userId,
		generatedAt: now.toISOString(),
		counts: {
			followups: followupCount,
			drafts: draftCount,
			ready: readyCount,
			benefits: benefitCount,
		},
		tasks,
		inbox: {
			visible: ownSection,
			connected: Boolean(
				mailbox?.scopes.includes(
					"https://www.googleapis.com/auth/gmail.readonly",
				),
			),
			email: mailbox?.email ?? null,
			status: sync?.status ?? null,
			lastSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null,
			messages: messages.map((m) => ({
				id: m.id,
				threadId: m.threadId,
				subject: m.subject ?? "Sin asunto",
				snippet: m.snippet?.slice(0, OPERATIONS.mailPreviewCharacters) ?? "",
				from: m.fromName ?? m.fromEmail,
				companyName: m.thread.company?.name ?? null,
				receivedAt: m.sentAt.toISOString(),
			})),
		},
		note: "Seguimientos y compromisos vencidos o próximos en 24 horas. Listas de hasta 10 por tipo; los contadores incluyen todos los pendientes del contexto. Los recibidos son mensajes propios relacionados con empresas/contactos del contexto, no una atribución automática a un evento ni un conteo de correos sin leer.",
	};
}
