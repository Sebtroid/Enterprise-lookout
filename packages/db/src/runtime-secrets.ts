import "@crm/env/load";

export const RUNTIME_SECRET_NAMES = {
	glmApiKey: "lookout_v2_glm_api_key",
	googleClientId: "lookout_v2_google_client_id",
	googleClientSecret: "lookout_v2_google_client_secret",
} as const;

export type RuntimeSecretName =
	(typeof RUNTIME_SECRET_NAMES)[keyof typeof RUNTIME_SECRET_NAMES];

export async function readRuntimeSecret(
	name: RuntimeSecretName,
): Promise<string | null> {
	const source = process.env.DATABASE_URL;
	if (!source) return null;
	const url = new URL(source);
	if (
		url.searchParams.get("schema") !== "lookout_v2" ||
		!(
			url.hostname.endsWith(".pooler.supabase.com") ||
			url.hostname.endsWith(".supabase.co")
		)
	)
		return null;

	try {
		const { db } = await import("./client");
		const rows = await db.$queryRaw<{ value: string | null }[]>`
			SELECT lookout_v2.read_runtime_secret(${name}::text) AS value
		`;
		return rows[0]?.value?.trim() || null;
	} catch {
		console.error("[vault] No se pudo leer la credencial del servidor.");
		return null;
	}
}
