import { describe, expect, it, mock } from "bun:test";
import type { Db } from "../src/index";
import { readLookoutOperations } from "../src/lookout-operations";

function fixture(ownerId = "seba") {
	const work = mock(async () => ({
		id: "work-1",
		name: "Trabajo",
		organization: "UANDES",
		ownerId,
	}));
	const event = mock(async () => ({ id: "event-1" }));
	const mail = mock(async () => []);
	const mailbox = mock(async () => null);
	const sponsors = mock(async () => []);
	const drafts = mock(async () => []);
	const count = mock(async () => 40);
	const database = {
		workArea: { findFirst: work },
		sponsorEvent: { findFirst: event },
		sponsorship: { findMany: sponsors, count },
		sponsorDraft: { findMany: drafts, count },
		sponsorBenefit: { findMany: mock(async () => []), count },
		emailMessage: { findMany: mail },
		lookoutMailbox: { findUnique: mailbox },
		mailboxSync: { findUnique: mock(async () => null) },
	} as unknown as Db;
	return { database, work, event, mail, mailbox, sponsors, drafts };
}

describe("sponsorship operations", () => {
	it("reads only the selected work and keeps full totals separate from bounded lists", async () => {
		const f = fixture();
		const result = await readLookoutOperations(
			f.database,
			"seba",
			{ workAreaId: "work-1", eventId: "event-1" },
			new Date("2026-10-02T12:00:00Z"),
		);
		expect(result.counts.followups).toBe(40);
		expect(result.tasks).toEqual([]);
		expect(f.sponsors).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					event: {
						workAreaId: "work-1",
						id: "event-1",
						status: { in: ["planning", "active"] },
					},
				}),
				take: 10,
			}),
		);
	});
	it("never reads another person's mailbox when viewing their section", async () => {
		const f = fixture("miguel");
		const result = await readLookoutOperations(f.database, "seba", {
			ownerId: "miguel",
			workAreaId: "work-1",
		});
		expect(result.canEdit).toBe(false);
		expect(result.inbox.visible).toBe(false);
		expect(result.inbox.messages).toEqual([]);
		expect(f.mail).not.toHaveBeenCalled();
		expect(f.mailbox).not.toHaveBeenCalled();
	});
	it("limits inbox data to the current user's messages and companies in scope", async () => {
		const f = fixture();
		await readLookoutOperations(f.database, "seba", { workAreaId: "work-1" });
		expect(f.mail).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					syncedByUserId: "seba",
					direction: "INBOUND",
					thread: { OR: expect.any(Array) },
				}),
				select: expect.not.objectContaining({ body: true }),
			}),
		);
	});
	it("rejects a mismatched event before reading any mail", async () => {
		const f = fixture();
		f.event.mockResolvedValueOnce(null as never);
		await expect(
			readLookoutOperations(f.database, "seba", {
				workAreaId: "work-1",
				eventId: "wrong",
			}),
		).rejects.toThrow("El evento no pertenece");
		expect(f.mail).not.toHaveBeenCalled();
	});
});
