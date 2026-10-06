import { createHash } from "node:crypto";
import type { Db } from "@crm/db";
import { profileSchema } from "@crm/validation/lookout";
import { z } from "zod";

export const contactInput = z.object({
	sponsorshipId: z.string().min(1).max(160),
	firstName: z.string().trim().min(1).max(160),
	lastName: z.string().trim().max(160).optional(),
	title: z.string().trim().max(200).optional(),
	email: z
		.email()
		.max(254)
		.transform((s) => s.toLowerCase()),
	sourceUrl: z.url().max(1500),
});

type ContactContext = {
	userId: string;
	workAreaId: string;
	eventId?: string;
};

export async function saveLookoutContact(
	db: Db,
	context: ContactContext,
	input: z.infer<typeof contactInput>,
) {
	return db.$transaction(async (tx) => {
		const sponsorship = await tx.sponsorship.findFirst({
			where: {
				id: input.sponsorshipId,
				event: {
					workAreaId: context.workAreaId,
					workArea: { ownerId: context.userId },
					status: { in: ["planning", "active"] },
					...(context.eventId ? { id: context.eventId } : {}),
				},
				company: { archivedAt: null },
			},
			select: {
				id: true,
				companyId: true,
				contactId: true,
				company: { select: { sponsorshipProfile: true } },
			},
		});
		if (!sponsorship)
			throw new Error("La empresa no está en un evento del contexto activo.");
		const companyProfile = profileSchema.safeParse(
			sponsorship.company.sponsorshipProfile ?? {},
		);
		if (!companyProfile.success || companyProfile.data.doNotContact)
			throw new Error(
				"Revisa el bloqueo y el perfil de esta empresa antes de guardar un contacto.",
			);
		const selection = {
			id: true,
			companyId: true,
			archivedAt: true,
			sponsorshipProfile: true,
		} as const;
		const existing = await tx.contact.findFirst({
			where: { email: { equals: input.email, mode: "insensitive" } },
			select: selection,
		});
		const contact =
			existing ??
			(await tx.contact.upsert({
				where: {
					id: `dom-contact-${createHash("sha256").update(input.email).digest("hex")}`,
				},
				update: {},
				create: {
					firstName: input.firstName,
					lastName: input.lastName,
					title: input.title,
					email: input.email,
					companyId: sponsorship.companyId,
					ownerId: context.userId,
					sponsorshipProfile: profileSchema.parse({
						source: input.sourceUrl,
						verificationStatus: "unverified",
					}),
				},
				select: selection,
			}));
		if (contact.archivedAt)
			throw new Error(
				"Este contacto está archivado. Revísalo antes de usarlo.",
			);
		const profile = profileSchema.safeParse(contact.sponsorshipProfile ?? {});
		if (
			!profile.success ||
			profile.data.doNotContact ||
			["invalid", "risky"].includes(profile.data.verificationStatus) ||
			profile.data.bounceCount > 0
		)
			throw new Error(
				"Este contacto necesita revisión por bloqueo, riesgo o rebote.",
			);
		if (contact.companyId && contact.companyId !== sponsorship.companyId)
			throw new Error(
				"Ese correo ya pertenece a otra empresa. Revisa el contacto existente.",
			);
		if (!contact.companyId)
			await tx.contact.update({
				where: { id: contact.id, companyId: null },
				data: { companyId: sponsorship.companyId },
			});
		if (sponsorship.contactId !== contact.id)
			await tx.sponsorDraft.updateMany({
				where: { sponsorshipId: sponsorship.id, status: "approved" },
				data: {
					status: "needs_review",
					approvedBy: null,
					approvedAt: null,
					approvalHash: null,
				},
			});
		await tx.sponsorship.update({
			where: { id: sponsorship.id },
			data: {
				contactId: contact.id,
				selectedContactReason: `Fuente: ${input.sourceUrl}`,
			},
		});
		return {
			contactId: contact.id,
			sponsorshipId: sponsorship.id,
			reused: Boolean(existing),
			note: "Contacto guardado y seleccionado. Revisa la dirección y el borrador antes de aprobar y enviar.",
		};
	});
}
