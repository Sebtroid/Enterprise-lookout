import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { inviteTokenHash } from "../packages/auth/src/invites";
import { db } from "../packages/db/src/client";

if (!process.env.DATABASE_URL?.includes("127.0.0.1:55439/lookout_v2_lab")) {
	throw new Error("Esta prueba solo puede usar la base ficticia local.");
}

const email = "auth-test@example.invalid";
const authOrigin = process.argv[2] ?? "http://127.0.0.1:4311";
if (
	![
		"http://localhost:4310",
		"http://localhost:4311",
		"http://127.0.0.1:4311",
		"http://localhost:4322",
	].includes(authOrigin)
) {
	throw new Error("La prueba solo admite la app o API local del laboratorio.");
}
const endpoint = `${authOrigin}/api/auth/sign-up/email`;
const password = `test-${randomBytes(20).toString("base64url")}`;
const invite = randomBytes(32).toString("base64url");
const body = JSON.stringify({ name: "Invitado de prueba", email, password });
const request = (headers: Record<string, string> = {}) =>
	fetch(endpoint, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin: authOrigin,
			...headers,
		},
		body,
	});

assert.equal(await db.user.count({ where: { email } }), 0);

try {
	const withoutInvite = await request();
	assert.equal(withoutInvite.status, 403);

	await db.lookoutInvite.create({
		data: {
			email,
			tokenHash: inviteTokenHash(invite),
			expiresAt: new Date(Date.now() + 60_000),
		},
	});

	const wrongInvite = await request({ "x-lookout-invite": "x".repeat(40) });
	assert.equal(wrongInvite.status, 403);

	const signup = await request({ "x-lookout-invite": invite });
	if (!signup.ok) {
		const detail = (await signup.text())
			.slice(0, 300)
			.replaceAll(invite, "[REDACTED]");
		throw new Error(`La invitación válida falló (${signup.status}): ${detail}`);
	}
	assert.equal(await db.user.count({ where: { email } }), 1);
	assert.ok((await db.lookoutInvite.findUnique({ where: { email } }))?.usedAt);

	const signIn = await fetch(`${authOrigin}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: authOrigin },
		body: JSON.stringify({ email, password }),
	});
	assert.equal(signIn.status, 200);
	assert.ok(signIn.headers.get("set-cookie"));
	const testUser = await db.user.findUniqueOrThrow({
		where: { email },
		select: { id: true },
	});
	const blockedEmail = `blocked-${randomBytes(8).toString("hex")}@example.invalid`;
	try {
		await db.user.update({
			where: { id: testUser.id },
			data: { email: blockedEmail },
		});
		const blocked = await fetch(`${authOrigin}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: authOrigin },
			body: JSON.stringify({ email: blockedEmail, password }),
		});
		assert.equal(blocked.status, 403);
	} finally {
		await db.user.update({ where: { id: testUser.id }, data: { email } });
	}
	console.log("Invitación, alta privada, consumo único e ingreso: correctos.");
	console.log("Cuenta existente con correo no autorizado: ingreso bloqueado.");
} finally {
	await db.user.deleteMany({ where: { email } });
	await db.lookoutInvite.deleteMany({ where: { email } });
	await db.$disconnect();
}
