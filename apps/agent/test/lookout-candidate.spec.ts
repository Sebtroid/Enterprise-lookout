import { describe, expect, it, mock } from "bun:test";
import type { Db } from "@crm/db";
import {
	addLookoutCandidate,
	candidateInput,
} from "../agent/lib/lookout-candidate";

const scope = { ownerId: "seba", workAreaId: "work-1", eventId: "event-1" };
const input = candidateInput.parse({
	eventId: "event-1",
	name: "Marca",
	domain: "www.marca.cl",
	category: "Bebidas",
	sourceUrl: "https://marca.cl/",
	notes: "Fuente oficial",
});

function fixture(
	ownerId = "seba",
	blocked = false,
	archivedAt: Date | null = null,
) {
	const companyWrite = mock(async () => ({
		id: "brand-1",
		sponsorshipProfile: {},
	}));
	const sponsorshipWrite = mock(async () => ({
		id: "sponsor-1",
		companyId: "brand-1",
		eventId: "event-1",
		stage: "candidate",
	}));
	const tx = {
		company: {
			findFirst: mock(async () => ({
				id: "brand-1",
				archivedAt,
				sponsorshipProfile: { categories: ["Bebidas"], doNotContact: blocked },
			})),
			upsert: companyWrite,
			update: companyWrite,
		},
		sponsorship: { upsert: sponsorshipWrite },
	};
	const transaction = mock(async (fn: (client: typeof tx) => unknown) =>
		fn(tx),
	);
	const database = {
		agentConversation: { findFirst: mock(async () => ({ id: "chat-1" })) },
		workArea: { findFirst: mock(async () => ({ id: "work-1", ownerId })) },
		sponsorEvent: { findFirst: mock(async () => ({ id: "event-1" })) },
		$transaction: transaction,
	} as unknown as Db;
	return { database, transaction, companyWrite, sponsorshipWrite };
}

describe("Dom saves sponsorship candidates", () => {
	it("normalizes a domain and reuses a shared company without replacing its profile", async () => {
		const f = fixture();
		const result = await addLookoutCandidate(
			f.database,
			"seba",
			"chat-1",
			scope,
			input,
		);
		expect(input.domain).toBe("marca.cl");
		expect(result.reusedCompany).toBe(true);
		expect(f.companyWrite).not.toHaveBeenCalled();
		expect(f.sponsorshipWrite).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					eventId_companyId: { eventId: "event-1", companyId: "brand-1" },
				},
				update: {},
			}),
		);
	});
	it("cannot write in a teammate's section", async () => {
		const f = fixture("miguel");
		await expect(
			addLookoutCandidate(
				f.database,
				"seba",
				"chat-1",
				{ ...scope, ownerId: "miguel" },
				input,
			),
		).rejects.toThrow("tu trabajo activo");
		expect(f.transaction).not.toHaveBeenCalled();
	});
	it("cannot cross a conversation's selected event", async () => {
		const f = fixture();
		await expect(
			addLookoutCandidate(f.database, "seba", "chat-1", scope, {
				...input,
				eventId: "other",
			}),
		).rejects.toThrow("contexto de este chat");
		expect(f.transaction).not.toHaveBeenCalled();
	});
	it("does not link a blocked company", async () => {
		const f = fixture("seba", true);
		await expect(
			addLookoutCandidate(f.database, "seba", "chat-1", scope, input),
		).rejects.toThrow("bloqueada");
		expect(f.sponsorshipWrite).not.toHaveBeenCalled();
	});
	it("does not recreate or link an archived company", async () => {
		const f = fixture("seba", false, new Date());
		await expect(
			addLookoutCandidate(f.database, "seba", "chat-1", scope, input),
		).rejects.toThrow("archivada");
		expect(f.companyWrite).not.toHaveBeenCalled();
		expect(f.sponsorshipWrite).not.toHaveBeenCalled();
	});
});
