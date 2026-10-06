import { db } from "../packages/db/src/client";
import {
	RUNTIME_SECRET_NAMES,
	readRuntimeSecret,
} from "../packages/db/src/runtime-secrets";

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.searchParams.get("schema") !== "lookout_v2")
	throw new Error("Esta comprobación requiere el esquema privado lookout_v2.");

try {
	const permissions = await db.$queryRaw<
		{
			role: string;
			direct_vault_access: boolean;
			server_can_read: boolean;
			anonymous_can_read: boolean;
		}[]
	>`
		SELECT current_user AS role,
			has_schema_privilege(current_user, 'vault', 'USAGE') AS direct_vault_access,
			has_function_privilege(current_user, 'lookout_v2.read_runtime_secret(text)', 'EXECUTE') AS server_can_read,
			has_function_privilege('anon', 'lookout_v2.read_runtime_secret(text)', 'EXECUTE') AS anonymous_can_read
	`;
	const permission = permissions[0];
	if (
		permission?.role !== "lookout_v2_app" ||
		permission.direct_vault_access ||
		!permission.server_can_read ||
		permission.anonymous_can_read
	)
		throw new Error(
			"Los permisos de Vault no corresponden a la configuración privada.",
		);

	const unrelated = await db.$queryRaw<{ value: string | null }[]>`
		SELECT lookout_v2.read_runtime_secret('enterprise-lookout:00000000-0000-4000-8000-000000000001:cron-secret') AS value
	`;
	if (unrelated[0]?.value !== null)
		throw new Error("El lector permite acceder a un secreto ajeno a V2.");
	console.log(
		"PASS: lector privado limitado a credenciales V2, sin acceso directo a Vault ni acceso anónimo.",
	);
	for (const [key, name] of Object.entries(RUNTIME_SECRET_NAMES)) {
		console.log(
			`${key}: ${(await readRuntimeSecret(name)) ? "configurado" : "pendiente de completar en Vault"}`,
		);
	}
} finally {
	await db.$disconnect();
}
