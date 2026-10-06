import { describe, expect, it, mock } from "bun:test";
import type { Db } from "@crm/db";
import { lookoutAccess, prepareLookoutDraft } from "../agent/lib/lookout";

function fixture(ownerId = "seba") {
	const work = {
		id: "work-1",
		ownerId,
		name: "Trabajo",
		description: null,
		organization: "UANDES",
	};
	const writes = mock(async () => ({ id: "draft-1", status: "needs_review" }));
	const workQuery = mock(async () => work);
	const eventQuery = mock(async () => ({ id: "event-1" }));
	const companyQuery = mock(async () => ({ id: "sponsor-1" }));
	const conversationQuery = mock(async () => ({ id: "chat-1" }));
	const database = {
		agentConversation: { findFirst: conversationQuery },
		workArea: { findFirst: workQuery },
		sponsorEvent: { findFirst: eventQuery },
		sponsorship: { findFirst: companyQuery },
		sponsorDraft: { upsert: writes },
	} as unknown as Db;
	return {
		database,
		writes,
		workQuery,
		eventQuery,
		companyQuery,
		conversationQuery,
	};
}

const input = {
	id: "draft-1",
	sponsorshipId: "sponsor-1",
	subject: "Auspicio",
	body: "Propuesta para el evento",
};
const scope = { ownerId: "seba", workAreaId: "work-1", eventId: "event-1" };

describe("Dom sponsorship scope", () => {
	it("requires a private conversation owned by the signed-in user", async () => {
		const f = fixture();
		f.conversationQuery.mockResolvedValueOnce(null as never);
		await expect(
			lookoutAccess(f.database, "seba", "other-chat", scope),
		).rejects.toThrow("Este chat no pertenece");
		expect(f.workQuery).not.toHaveBeenCalled();
	});
	it("allows deliberate reading of a teammate's work", async () => {
		const f = fixture("miguel");
		const result = await lookoutAccess(f.database, "seba", "chat-1", {
			...scope,
			ownerId: "miguel",
		});
		expect(result.canEdit).toBe(false);
		expect(f.workQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					ownerId: "miguel",
					id: "work-1",
					owner: { members: { some: { organizationId: "workspace" } } },
				}),
			}),
		);
	});
	it("prevents drafting inside a teammate's work", async () => {
		const f = fixture("miguel");
		await expect(
			prepareLookoutDraft(
				f.database,
				"seba",
				"chat-1",
				{ ...scope, ownerId: "miguel" },
				input,
			),
		).rejects.toThrow("solo su responsable");
		expect(f.writes).not.toHaveBeenCalled();
	});
	it("rejects an event outside the selected work", async () => {
		const f = fixture();
		f.eventQuery.mockResolvedValueOnce(null as never);
		await expect(
			lookoutAccess(f.database, "seba", "chat-1", scope),
		).rejects.toThrow("El evento no pertenece");
		expect(f.writes).not.toHaveBeenCalled();
	});
	it("rejects a company outside the event without writing a draft", async () => {
		const f = fixture();
		f.companyQuery.mockResolvedValueOnce(null as never);
		await expect(
			prepareLookoutDraft(f.database, "seba", "chat-1", scope, input),
		).rejects.toThrow("El auspicio no pertenece");
		expect(f.writes).not.toHaveBeenCalled();
	});
	it("writes only a pending draft with a stable id", async () => {
		const f = fixture();
		expect(
			(await prepareLookoutDraft(f.database, "seba", "chat-1", scope, input))
				.status,
		).toBe("needs_review");
		expect(f.writes).toHaveBeenCalledWith({
			where: { id: input.id },
			update: {},
			create: { ...input, status: "needs_review" },
			select: { id: true, status: true },
		});
	});
});
