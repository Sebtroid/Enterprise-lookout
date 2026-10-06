import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Db } from "@crm/db";
import { draftApprovalHash } from "../src/lookout/approvals";
import {
	encodeSponsorMessage,
	LookoutMailService,
} from "../src/lookout/lookout-mail.service";
import {
	type LookoutMailboxService,
	MAILBOX_SCOPES,
} from "../src/mailbox/lookout-mailbox.service";
import {
	openMailboxValue,
	sealMailboxValue,
} from "../src/mailbox/mailbox-crypto";
import type { BaseTrpcContext } from "../src/trpc/context.types";
import { assertHumanSession } from "../src/trpc/middlewares/session-only.middleware";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function fixture() {
	const row = {
		id: "draft-1",
		sponsorshipId: "sponsor-1",
		subject: "Auspicio para el asado",
		body: "Hola, ¿nos apoyan con bebidas?",
		status: "approved",
		approvedBy: "seba",
		approvedAt: new Date(),
		updatedAt: new Date(),
		approvalHash: "",
		senderEmail: "sawitting@miuandes.cl",
		sendingStartedAt: new Date(),
		sponsorship: {
			id: "sponsor-1",
			companyId: "company-1",
			company: { archivedAt: null, sponsorshipProfile: {} },
			contact: {
				archivedAt: null,
				companyId: "company-1",
				email: "contacto@marca.cl",
				sponsorshipProfile: {},
			},
		},
	};
	row.approvalHash = draftApprovalHash(row, "contacto@marca.cl");
	let denied = false;
	let suppressed = false;
	const update = mock(async (input: { data: Partial<typeof row> }) => {
		Object.assign(row, input.data);
		return row;
	});
	const updateMany = mock(
		async (input: {
			where: { status?: string };
			data: Partial<typeof row>;
		}) => {
			if (input.where.status && input.where.status !== row.status)
				return { count: 0 };
			Object.assign(row, input.data);
			return { count: 1 };
		},
	);
	const tx = {
		sponsorDraft: {
			findFirst: mock(async () => (denied ? null : { ...row })),
			updateMany,
			update,
		},
		suppressedContact: {
			findFirst: mock(async () =>
				suppressed ? { email: "contacto@marca.cl" } : null,
			),
		},
		suppressedDomain: { findUnique: mock(async () => null) },
		sponsorship: { update: mock(async () => ({ id: "sponsor-1" })) },
	};
	const database = {
		...tx,
		$transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
	} as unknown as Db;
	const mailbox = {
		access: mock(async () => ({
			email: "sawitting@miuandes.cl",
			accessToken: "fake-test-token",
			scopes: Object.values(MAILBOX_SCOPES),
		})),
		profile: mock(async () => "sawitting@miuandes.cl"),
	} as unknown as LookoutMailboxService;
	const service = new LookoutMailService(database, mailbox);
	const fetchMock = mock(
		async () =>
			new Response(JSON.stringify({ id: "gmail-1", threadId: "thread-1" }), {
				status: 200,
			}),
	);
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return {
		row,
		service,
		fetchMock,
		updateMany,
		deny: () => {
			denied = true;
		},
		suppress: () => {
			suppressed = true;
		},
	};
}

const sendInput = {
	id: "draft-1",
	eventId: "event-1",
	senderEmail: "sawitting@miuandes.cl",
};

describe("Human approval", () => {
	it("rejects an API key even when it resolves to a user session", () => {
		const ctx = {
			req: { headers: { "x-api-key": "fake" } },
			session: { user: { id: "seba" } },
		} as unknown as BaseTrpcContext;
		expect(() => assertHumanSession(ctx)).toThrow("sesión humana");
	});
	it("rejects a missing session", () => {
		expect(() => assertHumanSession({ session: null })).toThrow(
			"sesión humana",
		);
	});
	it("accepts an authenticated browser session", () => {
		expect(() =>
			assertHumanSession({
				req: { headers: {} },
				session: { user: { id: "seba" } },
			} as unknown as BaseTrpcContext),
		).not.toThrow();
	});
});

describe("Mailbox encryption", () => {
	it("binds tokens to their owner and rejects tampering", () => {
		const secret = "s".repeat(40);
		const sealed = sealMailboxValue("fake-refresh-token", secret, "seba");
		expect(sealed).not.toContain("fake-refresh-token");
		expect(openMailboxValue(sealed, secret, "seba")).toBe("fake-refresh-token");
		expect(() => openMailboxValue(sealed, secret, "miguel")).toThrow();
		expect(() =>
			openMailboxValue(`${sealed.slice(0, -4)}AAAA`, secret, "seba"),
		).toThrow();
	});
});

describe("Draft delivery", () => {
	it("sends once from the separate sender, then blocks re-sending", async () => {
		const f = fixture();
		expect((await f.service.send("seba", sendInput)).status).toBe("sent");
		expect(f.fetchMock).toHaveBeenCalledTimes(1);
		await expect(f.service.send("seba", sendInput)).rejects.toThrow("aprueba");
		expect(f.fetchMock).toHaveBeenCalledTimes(1);
	});
	it("blocks a draft outside the user's section", async () => {
		const f = fixture();
		f.deny();
		await expect(f.service.send("miguel", sendInput)).rejects.toThrow(
			"tu sección",
		);
		expect(f.fetchMock).not.toHaveBeenCalled();
	});
	it("blocks a suppressed contact before making a send request", async () => {
		const f = fixture();
		f.suppress();
		await expect(f.service.send("seba", sendInput)).rejects.toThrow(
			"bloqueados",
		);
		expect(f.fetchMock).not.toHaveBeenCalled();
	});
	it("requires a fresh approval after the content changes", async () => {
		const f = fixture();
		f.row.body = "Texto distinto";
		await expect(f.service.send("seba", sendInput)).rejects.toThrow("cambió");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});
	it("requires a fresh approval after the destination changes", async () => {
		const f = fixture();
		f.row.sponsorship.contact.email = "otro@marca.cl";
		await expect(f.service.send("seba", sendInput)).rejects.toThrow("cambió");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});
	it("records uncertain delivery and never retries the POST", async () => {
		const f = fixture();
		f.fetchMock.mockImplementation(async () => {
			throw new Error("timeout");
		});
		expect((await f.service.send("seba", sendInput)).status).toBe(
			"send_uncertain",
		);
		await expect(f.service.send("seba", sendInput)).rejects.toThrow("aprueba");
		expect(f.fetchMock).toHaveBeenCalledTimes(1);
	});
	it("removes approval when Gmail explicitly refuses to send", async () => {
		const f = fixture();
		f.fetchMock.mockImplementation(
			async () => new Response("", { status: 403 }),
		);
		await expect(f.service.send("seba", sendInput)).rejects.toThrow(
			"Gmail rechazó",
		);
		expect(f.row.status).toBe("needs_review");
	});
	it("rejects a changed sender before delivery", async () => {
		const f = fixture();
		await expect(
			f.service.send("seba", {
				...sendInput,
				senderEmail: "sebawitting@gmail.com",
			}),
		).rejects.toThrow("remitente cambió");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});
	it("confirms an uncertain message through its stable Message-ID", async () => {
		const f = fixture();
		f.row.status = "send_uncertain";
		f.fetchMock.mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						messages: [{ id: "gmail-1", threadId: "thread-1" }],
					}),
				),
		);
		expect((await f.service.check("seba", sendInput)).status).toBe("sent");
		expect(f.row.status).toBe("sent");
	});
	it("blocks header injection", () => {
		expect(() =>
			encodeSponsorMessage({
				id: "d",
				from: "seba@universidad.cl",
				to: "marca@marca.cl",
				subject: "Auspicio\r\nBcc: atacante@otro.cl",
				body: "Hola",
			}),
		).toThrow("encabezados inválidos");
	});
	it("preserves long Unicode subjects within MIME header limits", () => {
		const subject =
			"Auspicio para Ingeniería: bebidas y colaboración 🎓 ".repeat(8);
		const mime = Buffer.from(
			encodeSponsorMessage({
				id: "d",
				from: "seba@universidad.cl",
				to: "marca@marca.cl",
				subject,
				body: "Hola",
			}),
			"base64url",
		).toString();
		const header =
			mime.split("Subject: ")[1]?.split("\r\nMessage-ID:")[0] ?? "";
		const decoded = [...header.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)]
			.map((match) => Buffer.from(match[1] ?? "", "base64").toString())
			.join("");
		expect(decoded).toBe(subject);
		for (const line of `Subject: ${header}`.split("\r\n"))
			expect(Buffer.byteLength(line)).toBeLessThanOrEqual(78);
	});
});
