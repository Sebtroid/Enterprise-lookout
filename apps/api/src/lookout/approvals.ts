import { createHash } from "node:crypto";
import type { Prisma } from "@crm/db";
import { profileSchema } from "@crm/validation/lookout";
import { ConflictException } from "@nestjs/common";
import { normalizeDomain } from "../companies/domain";
import { normalizeEmail } from "../crm/values";

export type SponsorshipForDelivery = Prisma.SponsorshipGetPayload<{
	include: { company: true; contact: true };
}>;

export function draftApprovalHash(
	draft: { id: string; subject: string; body: string; sponsorshipId: string },
	email: string,
) {
	return createHash("sha256")
		.update(
			JSON.stringify([
				draft.id,
				draft.sponsorshipId,
				email,
				draft.subject,
				draft.body,
			]),
		)
		.digest("hex");
}

export async function deliveryRecipient(
	tx: Prisma.TransactionClient,
	sponsorship: SponsorshipForDelivery,
) {
	if (
		sponsorship.company.archivedAt ||
		!sponsorship.contact ||
		sponsorship.contact.archivedAt ||
		sponsorship.contact.companyId !== sponsorship.companyId
	)
		throw new ConflictException(
			"La empresa o el contacto ya no están disponibles para este auspicio.",
		);
	const company = profileSchema.parse(
		sponsorship.company.sponsorshipProfile ?? {},
	);
	const contact = profileSchema.parse(
		sponsorship.contact.sponsorshipProfile ?? {},
	);
	if (
		company.doNotContact ||
		contact.doNotContact ||
		["invalid", "risky"].includes(contact.verificationStatus) ||
		contact.bounceCount > 0
	)
		throw new ConflictException(
			"Este contacto está bloqueado o requiere revisión.",
		);
	const email = normalizeEmail(sponsorship.contact.email ?? "");
	const domain = normalizeDomain(email?.split("@")[1]);
	if (!email || !domain)
		throw new ConflictException(
			"Selecciona un contacto con correo válido antes de aprobar.",
		);
	const [suppressedEmail, suppressedDomain] = await Promise.all([
		tx.suppressedContact.findFirst({
			where: { email: { equals: email, mode: "insensitive" } },
			select: { email: true },
		}),
		tx.suppressedDomain.findUnique({
			where: { domain },
			select: { domain: true },
		}),
	]);
	if (suppressedEmail || suppressedDomain)
		throw new ConflictException(
			"El correo o su dominio están bloqueados en la base de contactos.",
		);
	return email;
}

export function revokeDraftApprovals(
	tx: Prisma.TransactionClient,
	where: Prisma.SponsorDraftWhereInput,
) {
	return tx.sponsorDraft.updateMany({
		where: { ...where, status: "approved" },
		data: {
			status: "needs_review",
			approvedBy: null,
			approvedAt: null,
			approvalHash: null,
		},
	});
}
