export const LOOKOUT = {
	agentHealthTimeoutMs: 3000,
	mailbox: {
		stateTtlMs: 10 * 60_000,
		requestTimeoutMs: 30_000,
		refreshBeforeMs: 60_000,
	},
	mime: {
		subjectChunkBytes: 42,
		bodyLineCharacters: 76,
	},
} as const;
