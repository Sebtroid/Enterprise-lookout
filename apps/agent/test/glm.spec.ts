import { describe, expect, it } from "bun:test";
import { createGlmModel } from "../agent/lib/glm";

const prompt = [
	{ role: "user" as const, content: [{ type: "text" as const, text: "Hola" }] },
];

const completion = () =>
	Response.json({
		id: "test",
		created: 1,
		model: "glm-5.3",
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: "Hola",
					reasoning_content: "Revisión",
				},
				finish_reason: "stop",
			},
		],
		usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
	});

describe("GLM direct API", () => {
	it("loads a fresh server key per request and uses the Z.ai endpoint", async () => {
		let key = "test-first";
		const calls: { url: string; authorization: string | null; body: string }[] =
			[];
		const request: typeof fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				calls.push({
					url: String(input),
					authorization: new Headers(init?.headers).get("authorization"),
					body: String(init?.body),
				});
				return completion();
			},
			{ preconnect: fetch.preconnect },
		);
		const model = createGlmModel(async () => key, request);
		const result = await model.doGenerate({ prompt });
		key = "test-rotated";
		await model.doGenerate({ prompt });
		expect(calls.map((call) => call.url)).toEqual(
			Array(2).fill("https://api.z.ai/api/paas/v4/chat/completions"),
		);
		expect(calls.map((call) => call.authorization)).toEqual([
			"Bearer test-first",
			"Bearer test-rotated",
		]);
		expect(calls[0]?.body).toContain('"model":"glm-5.3"');
		expect(calls[0]?.body).not.toContain("test-first");
		expect(result.content).toContainEqual({ type: "text", text: "Hola" });
		expect(result.content).toContainEqual({
			type: "reasoning",
			text: "Revisión",
		});
	});

	it("refuses inference without a key and makes no external request", async () => {
		let calls = 0;
		const request: typeof fetch = Object.assign(
			async () => {
				calls += 1;
				return completion();
			},
			{ preconnect: fetch.preconnect },
		);
		const model = createGlmModel(async () => null, request);
		await expect(model.doGenerate({ prompt })).rejects.toThrow(
			"lookout_v2_glm_api_key",
		);
		expect(calls).toBe(0);
	});

	it("streams reasoning and text through the provider", async () => {
		const chunks = [
			{
				choices: [
					{
						index: 0,
						delta: { reasoning_content: "Revisión" },
						finish_reason: null,
					},
				],
			},
			{
				choices: [
					{ index: 0, delta: { content: "Hola" }, finish_reason: null },
				],
			},
			{
				choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
			},
		];
		const request: typeof fetch = Object.assign(
			async () =>
				new Response(
					`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
					{ headers: { "content-type": "text/event-stream" } },
				),
			{ preconnect: fetch.preconnect },
		);
		const { stream } = await createGlmModel(
			async () => "test-key",
			request,
		).doStream({ prompt });
		const events = await Array.fromAsync(stream);
		expect(events).toContainEqual(
			expect.objectContaining({ type: "text-delta", delta: "Hola" }),
		);
		expect(events).toContainEqual(
			expect.objectContaining({ type: "reasoning-delta", delta: "Revisión" }),
		);
		expect(events.some((event) => event.type === "finish")).toBe(true);
	});
});
