import { createHash } from "node:crypto";
import type { Db } from "@crm/db";
import { categories, profileOf, profileSchema } from "@crm/validation/lookout";
import { z } from "zod";
import { type LookoutScope, lookoutAccess } from "./lookout";

export const candidateInput = z.object({
	eventId: z.string().min(1).max(160),
	name: z.string().trim().min(1).max(160),
	domain: z
		.string()
		.trim()
		.toLowerCase()
		.transform((s) => s.replace(/^www\./, ""))
		.pipe(
			z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
		),
	category: z.enum(categories),
	sourceUrl: z.url().max(1500),
	notes: z.string().trim().max(3000).default(""),
});

export async function addLookoutCandidate(
	db: Db,
	userId: string,
	conversationId: string,
	scope: LookoutScope,
	input: z.infer<typeof candidateInput>,
) {
	if (scope.eventId && scope.eventId !== input.eventId)
		throw new Error("El evento no corresponde al contexto de este chat.");
	const { work, canEdit } = await lookoutAccess(db, userId, conversationId, {
		...scope,
		eventId: input.eventId,
	});
	if (!work || !canEdit)
		throw new Error("Solo puedes guardar candidatas en tu trabajo activo.");
	const event = await db.sponsorEvent.findFirst({
		where: {
			id: input.eventId,
			workAreaId: work.id,
			status: { in: ["planning", "active"] },
		},
		select: { id: true },
	});
	if (!event)
		throw new Error(
			"El evento está archivado, finalizado o fuera del trabajo.",
		);
	return db.$transaction(async (tx) => {
		const existing = await tx.company.findFirst({
			where: { domain: input.domain },
			select: { id: true, sponsorshipProfile: true, archivedAt: true },
		});
		if (existing?.archivedAt)
			throw new Error("Esta empresa está archivada. Revísala antes de usarla.");
		const profile = profileOf(
			z.json().parse(existing?.sponsorshipProfile ?? {}),
		);
		if (profile.doNotContact)
			throw new Error("Esta empresa está bloqueada para contacto.");
		const company =
			existing ??
			(await tx.company.upsert({
				where: {
					id: `dom-company-${createHash("sha256").update(input.domain).digest("hex")}`,
				},
				update: {},
				create: {
					name: input.name,
					domain: input.domain,
					website: `https://${input.domain}`,
					ownerId: userId,
					sponsorshipProfile: profileSchema.parse({
						categories: [input.category],
						source: input.sourceUrl,
						globalNotes: input.notes,
					}),
				},
				select: { id: true, sponsorshipProfile: true, archivedAt: true },
			}));
		if (company.archivedAt)
			throw new Error("Esta empresa está archivada. Revísala antes de usarla.");
		const savedProfile = profileOf(
			z.json().parse(company.sponsorshipProfile ?? {}),
		);
		if (savedProfile.doNotContact)
			throw new Error("Esta empresa está bloqueada para contacto.");
		if (existing && !profile.categories.includes(input.category))
			await tx.company.update({
				where: { id: company.id },
				data: {
					sponsorshipProfile: {
						...profile,
						categories: [...profile.categories, input.category],
					},
				},
			});
		const sponsorship = await tx.sponsorship.upsert({
			where: {
				eventId_companyId: { eventId: event.id, companyId: company.id },
			},
			update: {},
			create: {
				eventId: event.id,
				companyId: company.id,
				stage: "candidate",
				notes: `${input.notes}\nFuente: ${input.sourceUrl}`.trim(),
			},
			select: { id: true, eventId: true, companyId: true, stage: true },
		});
		return {
			...sponsorship,
			reusedCompany: Boolean(existing),
			note: "Candidata guardada en el evento. No se ha enviado ningún correo.",
		};
	});
}
