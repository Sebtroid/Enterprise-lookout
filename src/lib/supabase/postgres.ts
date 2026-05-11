import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

const DB_QUERY_TIMEOUT_MS = 8_000;

type CancellableQuery<T> = Promise<T> & {
  cancel?: () => Promise<unknown> | void;
};

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? null;
}

export function hasPostgresConfig() {
  return Boolean(getDatabaseUrl());
}

export function getPostgresClient() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: 3,
      prepare: false,
      ssl: "require",
      idle_timeout: 20,
      connect_timeout: 5,
      connection: {
        application_name: "sponsor-prospecting-dashboard",
        statement_timeout: DB_QUERY_TIMEOUT_MS,
      },
    });
  }

  return sqlClient;
}

export async function withPostgresQueryTimeout<T>(
  query: CancellableQuery<T>,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void query.cancel?.();
      reject(new Error(`${label} query timed out after ${DB_QUERY_TIMEOUT_MS}ms`));
    }, DB_QUERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([query, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
