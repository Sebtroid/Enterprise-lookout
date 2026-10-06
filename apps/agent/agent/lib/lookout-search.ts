import { z } from "zod";
import { glmApiKey } from "./glm";

const searchResponse = z.object({
	search_result: z
		.array(
			z.object({
				title: z.string(),
				link: z.url(),
				content: z.string().default(""),
				publish_date: z.string().optional(),
			}),
		)
		.max(50),
});

export const LOOKOUT_SEARCH = {
	timeoutMs: 30_000,
	count: 8,
	contentCharacters: 1800,
} as const;

export async function searchSponsorshipWeb(
	query: string,
	signal?: AbortSignal,
) {
	const key = await glmApiKey();
	if (!key) throw new Error("Falta configurar la clave GLM.");
	const response = await fetch("https://api.z.ai/api/paas/v4/web_search", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			search_engine: "search-prime",
			search_query: query,
			count: LOOKOUT_SEARCH.count,
		}),
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(LOOKOUT_SEARCH.timeoutMs)])
			: AbortSignal.timeout(LOOKOUT_SEARCH.timeoutMs),
	});
	if (!response.ok)
		return {
			available: false as const,
			reason: `La búsqueda web GLM devolvió HTTP ${response.status}. No se han verificado marcas externas.`,
			results: [],
		};
	const parsed = searchResponse.safeParse(await response.json());
	if (!parsed.success)
		return {
			available: false as const,
			reason: "La búsqueda no devolvió fuentes utilizables.",
			results: [],
		};
	return {
		available: true as const,
		reason: null,
		results: parsed.data.search_result.map((r) => ({
			title: r.title,
			url: r.link,
			excerpt: r.content.slice(0, LOOKOUT_SEARCH.contentCharacters),
			publishedAt: r.publish_date ?? null,
		})),
	};
}
