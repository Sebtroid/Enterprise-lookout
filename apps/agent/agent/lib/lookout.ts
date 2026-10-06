import type { Db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import type { ChatScope } from "@crm/validation/lookout";

export type LookoutScope = Partial<ChatScope>;

export async function lookoutAccess(
	db: Db,
	userId: string,
	conversationId: string,
	scope: LookoutScope,
) {
	const conversation = await db.agentConversation.findFirst({
		where: { id: conversationId, userId, kind: "BUILDER" },
		select: { id: true },
	});
	if (!conversation) throw new Error("Este chat no pertenece a tu cuenta.");
	const work = await db.workArea.findFirst({
		where: {
			...(scope.workAreaId ? { id: scope.workAreaId } : {}),
			ownerId: scope.ownerId ?? userId,
			owner: { members: { some: { organizationId: WORKSPACE_ID } } },
		},
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			name: true,
			organization: true,
			description: true,
			ownerId: true,
		},
	});
	if (!work && scope.workAreaId)
		throw new Error("El trabajo no pertenece a la sección de este chat.");
	if (
		scope.eventId &&
		!(await db.sponsorEvent.findFirst({
			where: { id: scope.eventId, workAreaId: work?.id ?? "missing" },
			select: { id: true },
		}))
	)
		throw new Error("El evento no pertenece al trabajo de este chat.");
	return { work, canEdit: work?.ownerId === userId };
}

export async function lookoutContext(
	db: Db,
	userId: string,
	conversationId: string,
	scope: LookoutScope,
) {
	const access = await lookoutAccess(db, userId, conversationId, scope);
	const events = access.work
		? await db.sponsorEvent.findMany({
				where: {
					workAreaId: access.work.id,
					...(scope.eventId
						? { id: scope.eventId }
						: { status: { not: "archived" } }),
				},
				orderBy: { createdAt: "desc" },
				take: 30,
				select: {
					id: true,
					name: true,
					description: true,
					valueProposition: true,
					date: true,
					startsOn: true,
					endsOn: true,
					location: true,
					audience: true,
					needs: true,
					cashTarget: true,
					status: true,
					budget: {
						select: {
							description: true,
							category: true,
							planned: true,
							actual: true,
							paid: true,
						},
					},
					sponsorships: {
						orderBy: { priority: "desc" },
						take: 100,
						select: {
							id: true,
							stage: true,
							priority: true,
							fitScore: true,
							notes: true,
							nextFollowupAt: true,
							lastContactedAt: true,
							company: {
								select: {
									id: true,
									name: true,
									domain: true,
									sponsorshipProfile: true,
								},
							},
							contact: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									email: true,
									sponsorshipProfile: true,
								},
							},
							contributions: {
								select: {
									kind: true,
									description: true,
									amount: true,
									quantity: true,
									unit: true,
									estimatedValue: true,
									status: true,
								},
							},
							benefits: {
								select: { description: true, status: true, dueAt: true },
							},
							drafts: {
								orderBy: { createdAt: "desc" },
								take: 5,
								select: {
									id: true,
									subject: true,
									status: true,
									approvedAt: true,
								},
							},
						},
					},
				},
			})
		: [];
	return {
		...access,
		events,
		currency: "CLP",
		note: "Dinero y productos/servicios se calculan por separado. Los datos corresponden a este trabajo. Aprobar y enviar correos requiere una persona en la app. Máximo 30 eventos y 100 auspicios por evento en esta consulta.",
	};
}

export async function prepareLookoutDraft(
	db: Db,
	userId: string,
	conversationId: string,
	scope: LookoutScope,
	input: { id: string; sponsorshipId: string; subject: string; body: string },
) {
	const access = await lookoutAccess(db, userId, conversationId, scope);
	if (!access.work || !access.canEdit)
		throw new Error(
			"Puedes consultar esta sección; solo su responsable puede preparar borradores.",
		);
	const sponsorship = await db.sponsorship.findFirst({
		where: {
			id: input.sponsorshipId,
			event: {
				workAreaId: access.work.id,
				status: { not: "archived" },
				...(scope.eventId ? { id: scope.eventId } : {}),
			},
			company: { archivedAt: null },
		},
		select: { id: true },
	});
	if (!sponsorship)
		throw new Error(
			"El auspicio no pertenece al contexto activo o está archivado.",
		);
	const result = await db.sponsorDraft.upsert({
		where: { id: input.id },
		update: {},
		create: {
			id: input.id,
			sponsorshipId: sponsorship.id,
			subject: input.subject,
			body: input.body,
			status: "needs_review",
		},
		select: { id: true, status: true },
	});
	return {
		...result,
		note: "Borrador guardado para revisión humana. El correo no se ha aprobado ni enviado.",
	};
}
