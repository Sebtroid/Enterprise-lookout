import { describe, expect, it, mock } from "bun:test";
import type { Db } from "@crm/db";
import { contactInput, saveLookoutContact } from "../agent/lib/lookout-contact";

const context = { userId: "seba", workAreaId: "work-1", eventId: "event-1" };
const input = contactInput.parse({
	sponsorshipId: "sponsor-1",
	firstName: "Ana",
	email: "ANA@marca.cl",
	sourceUrl: "https://marca.cl/equipo",
});

function fixture(
	options: {
		currentContactId?: string;
		companyId?: string | null;
		archivedAt?: Date;
		blocked?: boolean;
		newContact?: boolean;
		missingSponsorship?: boolean;
	} = {},
) {
	const approval = {
		status: "approved",
		approvedBy: "seba" as string | null,
		approvedAt: new Date() as Date | null,
		approvalHash: "old-recipient-hash" as string | null,
	};
	const contact = {
		id: "contact-1",
		companyId: options.companyId === undefined ? "brand-1" : options.companyId,
		archivedAt: options.archivedAt ?? null,
		sponsorshipProfile: { doNotContact: options.blocked ?? false },
	};
	const revoke = mock(async (query: { data: typeof approval }) => {
		Object.assign(approval, query.data);
		return { count: 1 };
	});
	const select = mock(async () => ({ id: "sponsor-1" }));
	const updateContact = mock(async () => ({ id: "contact-1" }));
	const create = mock(async () => ({ ...contact, sponsorshipProfile: {} }));
	const sponsorshipQuery = mock(async () =>
		options.missingSponsorship
			? null
			: {
					id: "sponsor-1",
					companyId: "brand-1",
					contactId: options.currentContactId ?? "previous-contact",
					company: { sponsorshipProfile: {} },
				},
	);
	const tx = {
		sponsorship: { findFirst: sponsorshipQuery, update: select },
		contact: {
			findFirst: mock(async () => (options.newContact ? null : contact)),
			upsert: create,
			update: updateContact,
		},
		sponsorDraft: { updateMany: revoke },
	};
	const db = {
		$transaction: mock(async (fn: (client: typeof tx) => unknown) => fn(tx)),
	} as unknown as Db;
	return {
		db,
		approval,
		revoke,
		select,
		updateContact,
		create,
		sponsorshipQuery,
	};
}

describe("Dom selects a sourced sponsorship contact", () => {
	it("requires a new human approval when the recipient changes", async () => {
		const f = fixture();
		const result = await saveLookoutContact(f.db, context, input);
		expect(result.reused).toBe(true);
		expect(input.email).toBe("ana@marca.cl");
		expect(f.approval).toEqual({
			status: "needs_review",
			approvedBy: null,
			approvedAt: null,
			approvalHash: null,
		});
		expect(f.create).not.toHaveBeenCalled();
		expect(f.updateContact).not.toHaveBeenCalled();
	});
	it("keeps an approval when the selected recipient stays the same", async () => {
		const f = fixture({ currentContactId: "contact-1" });
		await saveLookoutContact(f.db, context, input);
		expect(f.revoke).not.toHaveBeenCalled();
		expect(f.approval.status).toBe("approved");
	});
	it("links an existing contact without a company to the selected company", async () => {
		const f = fixture({ companyId: null });
		await saveLookoutContact(f.db, context, input);
		expect(f.updateContact).toHaveBeenCalledWith({
			where: { id: "contact-1", companyId: null },
			data: { companyId: "brand-1" },
		});
	});
	it("refuses an archived contact without changing an approval", async () => {
		const f = fixture({ archivedAt: new Date() });
		await expect(saveLookoutContact(f.db, context, input)).rejects.toThrow(
			"archivado",
		);
		expect(f.select).not.toHaveBeenCalled();
		expect(f.revoke).not.toHaveBeenCalled();
	});
	it("refuses a contact associated with another company", async () => {
		const f = fixture({ companyId: "other-company" });
		await expect(saveLookoutContact(f.db, context, input)).rejects.toThrow(
			"otra empresa",
		);
		expect(f.select).not.toHaveBeenCalled();
		expect(f.updateContact).not.toHaveBeenCalled();
	});
	it("refuses a blocked contact", async () => {
		const f = fixture({ blocked: true });
		await expect(saveLookoutContact(f.db, context, input)).rejects.toThrow(
			"bloqueo",
		);
		expect(f.select).not.toHaveBeenCalled();
	});
	it("constrains the sponsorship to the owner, work and selected active event", async () => {
		const f = fixture({ missingSponsorship: true });
		await expect(saveLookoutContact(f.db, context, input)).rejects.toThrow(
			"contexto activo",
		);
		expect(f.sponsorshipQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: "sponsor-1",
					event: {
						workAreaId: "work-1",
						workArea: { ownerId: "seba" },
						status: { in: ["planning", "active"] },
						id: "event-1",
					},
					company: { archivedAt: null },
				},
			}),
		);
		expect(f.create).not.toHaveBeenCalled();
	});
	it("keeps a newly researched email unverified and stores its source", async () => {
		const f = fixture({ newContact: true });
		await saveLookoutContact(f.db, context, input);
		expect(f.create).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					email: "ana@marca.cl",
					sponsorshipProfile: expect.objectContaining({
						verificationStatus: "unverified",
						source: input.sourceUrl,
					}),
				}),
			}),
		);
	});
});
