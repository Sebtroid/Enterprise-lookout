export const LOCAL_RUNTIME = {
	minimumNodeMajor: 24,
	heapMb: 512,
	maxResidentMb: 1536,
	monitorIntervalMs: 5000,
	readyTimeoutMs: 20_000,
	requestTimeoutMs: 1000,
	readyPollMs: 500,
	shutdownGraceMs: 3000,
} as const;
