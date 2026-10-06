import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
	RUNTIME_SECRET_NAMES,
	readRuntimeSecret,
} from "@crm/db/runtime-secrets";
import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";

export async function glmApiKey(): Promise<string | null> {
	return (
		process.env.GLM_API_KEY?.trim() ||
		(await readRuntimeSecret(RUNTIME_SECRET_NAMES.glmApiKey))
	);
}

export function createGlmModel(
	readKey: () => Promise<string | null> = glmApiKey,
	request: typeof fetch = fetch,
): LanguageModelV4 {
	const provider = createOpenAICompatible({
		name: "zai",
		baseURL: "https://api.z.ai/api/paas/v4",
		fetch: async (input, init) => {
			const key = await readKey();
			if (!key) {
				throw new Error(
					"Falta completar lookout_v2_glm_api_key en Supabase Vault.",
				);
			}
			const headers = new Headers(init?.headers);
			headers.set("Authorization", `Bearer ${key}`);
			return request(input, { ...init, headers });
		},
	});
	return provider.chatModel(DEFAULT_AGENT_MODEL.id.replace(/^zai\//, ""));
}

export const glmModel: LanguageModelV4 = createGlmModel();
