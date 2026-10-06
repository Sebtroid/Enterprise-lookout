import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inviteTokenHash } from "../packages/auth/src/invites";
import { isWorkspaceEmail } from "../packages/auth/src/workspace";
import { db } from "../packages/db/src/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
	throw new Error("Uso: bun evaluation/create-invite.ts correo@dominio.cl");
}
if (!isWorkspaceEmail(email)) {
	throw new Error("El correo no figura en ALLOWED_SIGN_IN.");
}

try {
	if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
		throw new Error(
			"Ese correo ya tiene una cuenta. Ingresa o cambia la contraseña.",
		);
	}

	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await db.lookoutInvite.upsert({
		where: { email },
		create: { email, tokenHash: inviteTokenHash(token), expiresAt },
		update: { tokenHash: inviteTokenHash(token), expiresAt, usedAt: null },
	});

	const directory = resolve(import.meta.dir, "../.scratch/lookout-invites");
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const path = resolve(directory, `${email}.txt`);
	writeFileSync(
		path,
		`Enterprise Lookout · invitación personal\nCorreo: ${email}\nCódigo: ${token}\nVence: ${expiresAt.toISOString()}\n\nIngresa a la app, elige «Tengo una invitación» y crea una contraseña de al menos 12 caracteres.\n`,
		{ mode: 0o600 },
	);
	console.log(`Invitación creada para ${email}. Código guardado en ${path}`);
} finally {
	await db.$disconnect();
}
