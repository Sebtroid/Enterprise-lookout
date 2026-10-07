const SECOND_MS = 1_000;

export const DATABASE_POOL = {
	supabase: {
		max: 1,
		idleTimeoutMillis: 10 * SECOND_MS,
		connectionTimeoutMillis: 10 * SECOND_MS,
	},
} as const;
