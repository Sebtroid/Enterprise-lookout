import "../packages/env/src/load";
import { apiUrl, auth, WORKSPACE_ID } from "../packages/auth/src";
import { db } from "../packages/db/src/client";
import { snapshotOutput } from "../packages/validation/src/lookout";

const email = "sebawitting@gmail.com";
const user = await db.user.findUnique({
	where: { email },
	select: { id: true },
});
if (!user) throw new Error("Falta el usuario de Sebastián.");
const membership = await db.member.findFirst({
	where: { userId: user.id, organizationId: WORKSPACE_ID },
	select: { id: true },
});
if (!membership)
	throw new Error("El usuario no pertenece al espacio de Lookout.");
const name = `Lookout QA temporal ${Date.now()}`;
const created = await auth.api.createApiKey({
	body: { userId: user.id, name, expiresIn: 24 * 60 * 60 },
});
let verificationError: Error | undefined;
let revocationError: Error | undefined;

try {
	const headers = {
		"x-api-key": created.key,
		"Content-Type": "application/json",
	};
	const workspace = await fetch(new URL("/rest/lookout/workspace", apiUrl), {
		headers,
		signal: AbortSignal.timeout(10_000),
	});
	if (workspace.status !== 200)
		throw new Error(
			`La clave real no puede leer el tablero: ${workspace.status}.`,
		);
	const snapshot = snapshotOutput.parse(await workspace.json());
	if (snapshot.userId !== user.id)
		throw new Error("La clave resolvió a otro usuario.");
	console.log("PASS Clave API real: tablero 200 y usuario correcto.");
	const client = Bun.spawn(["python3", "scripts/lookout-api.py", "workspace"], {
		env: {
			...process.env,
			LOOKOUT_API_URL: apiUrl,
			LOOKOUT_API_KEY: created.key,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const clientResult = await new Response(client.stdout).text();
	if ((await client.exited) !== 0)
		throw new Error("El cliente Python no puede consultar la API.");
	if (snapshotOutput.parse(JSON.parse(clientResult)).userId !== user.id)
		throw new Error("El cliente Python resolvió a otro usuario.");
	console.log("PASS Cliente Python para Hermes: tablero y usuario correctos.");
	const protectedActions = [
		{
			path: "/rest/lookout/actions",
			body: {
				command: {
					action: "approveDraft",
					eventId: "qa-event",
					id: "qa-draft",
				},
			},
		},
		{
			path: "/rest/lookout/drafts/send",
			body: {
				eventId: "qa-event",
				id: "qa-draft",
				senderEmail: "sawitting@miuandes.cl",
			},
		},
		{
			path: "/rest/lookout/mailbox/connect",
			body: { email: "sawitting@miuandes.cl" },
		},
		{
			path: "/rest/api-keys",
			body: { name: "qa-forbidden", expiresInDays: 1 },
		},
	];
	for (const action of protectedActions) {
		const response = await fetch(new URL(action.path, apiUrl), {
			method: "POST",
			headers,
			body: JSON.stringify(action.body),
			signal: AbortSignal.timeout(10_000),
		});
		if (response.status !== 401)
			throw new Error(`La clave accede a ${action.path}: ${response.status}.`);
		console.log(`PASS Sesión humana obligatoria: ${action.path} 401.`);
	}
} catch (error) {
	verificationError =
		error instanceof Error
			? error
			: new Error("Falló la verificación de la API.");
} finally {
	try {
		const removed = await db.apikey.deleteMany({
			where: { id: created.id, referenceId: user.id, name },
		});
		if (removed.count === 1) {
			console.log("PASS Clave temporal revocada. No se enviaron correos.");
		} else {
			revocationError = new Error(
				"No se pudo revocar la clave temporal de verificación.",
			);
		}
	} catch {
		revocationError = new Error(
			"Falló la revocación de la clave temporal de verificación.",
		);
	}
	await db.$disconnect();
}
if (revocationError) throw revocationError;
if (verificationError) throw verificationError;
