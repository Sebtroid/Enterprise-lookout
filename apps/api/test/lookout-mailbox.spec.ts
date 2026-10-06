import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Db } from "@crm/db";
import {
	LookoutMailboxService,
	MAILBOX_SCOPES,
} from "../src/mailbox/lookout-mailbox.service";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function fixture(
	actualEmail = "sawitting@miuandes.cl",
	scopes = Object.values(MAILBOX_SCOPES).join(" "),
) {
	let stored: {
		id: string;
		identifier: string;
		value: string;
		expiresAt: Date;
	} | null = null;
	const write = mock(async () => ({ userId: "seba" }));
	const tx = {
		lookoutMailbox: { upsert: write },
		mailboxSync: { upsert: mock(async () => ({ id: "sync-1" })) },
	};
	const db = {
		verification: {
			deleteMany: async ({ where }: { where: { id?: string } }) => {
				const count = stored && where.id === stored.id ? 1 : 0;
				if (count) stored = null;
				return { count };
			},
			create: async ({ data }: { data: NonNullable<typeof stored> }) => {
				stored = { ...data };
				return data;
			},
			findFirst: async ({ where }: { where: { identifier: string } }) =>
				stored?.identifier === where.identifier && stored.expiresAt > new Date()
					? { ...stored }
					: null,
		},
		lookoutMailbox: { findUnique: async () => null },
		$transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
	} as unknown as Db;
	const fetchMock = mock(
		async (url: string | URL | Request) =>
			new Response(
				JSON.stringify(
					String(url).includes("/token")
						? {
								access_token: "fake-access-token",
								refresh_token: "fake-refresh-token",
								expires_in: 3600,
								scope: scopes,
							}
						: { emailAddress: actualEmail },
				),
				{ status: 200 },
			),
	);
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	const service = new LookoutMailboxService(db);
	return { service, write, fetchMock };
}

describe("Independent Gmail connection", () => {
	it("requests only mail permissions and binds the expected sender", async () => {
		const f = fixture();
		const url = new URL(
			(await f.service.begin("seba", "sawitting@miuandes.cl")).url,
		);
		expect(url.searchParams.get("scope")).toBe(
			Object.values(MAILBOX_SCOPES).join(" "),
		);
		expect(url.searchParams.get("login_hint")).toBe("sawitting@miuandes.cl");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("redirect_uri")).toContain(
			"/google/mailbox/callback",
		);
	});
	it("connects a different sender without changing the login account", async () => {
		const f = fixture();
		const url = new URL(
			(await f.service.begin("seba", "sawitting@miuandes.cl")).url,
		);
		await f.service.finish(
			"seba",
			url.searchParams.get("state") ?? "",
			"fake-code",
		);
		expect(f.write).toHaveBeenCalledTimes(1);
		const call = f.write.mock.calls[0] as unknown as [
			{
				create: {
					userId: string;
					email: string;
					accessToken: string;
					refreshToken: string;
				};
			},
		];
		expect(call[0].create.email).toBe("sawitting@miuandes.cl");
		expect(call[0].create.userId).toBe("seba");
		expect(call[0].create.accessToken).not.toContain("fake-access-token");
		expect(call[0].create.refreshToken).not.toContain("fake-refresh-token");
	});
	it("rejects reuse of an OAuth state", async () => {
		const f = fixture();
		const url = new URL(
			(await f.service.begin("seba", "sawitting@miuandes.cl")).url,
		);
		const state = url.searchParams.get("state") ?? "";
		await f.service.finish("seba", state, "fake-code");
		await expect(f.service.finish("seba", state, "fake-code")).rejects.toThrow(
			"venció",
		);
		expect(f.write).toHaveBeenCalledTimes(1);
	});
	it("rejects a state issued for another logged-in user", async () => {
		const f = fixture();
		const url = new URL(
			(await f.service.begin("seba", "sawitting@miuandes.cl")).url,
		);
		await expect(
			f.service.finish(
				"miguel",
				url.searchParams.get("state") ?? "",
				"fake-code",
			),
		).rejects.toThrow("venció");
		expect(f.fetchMock).not.toHaveBeenCalled();
		expect(f.write).not.toHaveBeenCalled();
	});
	it("rejects selecting the login mailbox instead of the requested sender", async () => {
		const f = fixture("sebawitting@gmail.com");
		const url = new URL(
			(await f.service.begin("seba", "sawitting@miuandes.cl")).url,
		);
		await expect(
			f.service.finish(
				"seba",
				url.searchParams.get("state") ?? "",
				"fake-code",
			),
		).rejects.toThrow("cuenta elegida es diferente");
		expect(f.write).not.toHaveBeenCalled();
	});
	it("requires the user to grant all requested mail permissions", async () => {
		const f = fixture("sawitting@miuandes.cl", MAILBOX_SCOPES.read);
		const url = new URL(
			(await f.service.begin("seba", "sawitting@miuandes.cl")).url,
		);
		await expect(
			f.service.finish(
				"seba",
				url.searchParams.get("state") ?? "",
				"fake-code",
			),
		).rejects.toThrow("lectura y envío");
		expect(f.write).not.toHaveBeenCalled();
	});
});
