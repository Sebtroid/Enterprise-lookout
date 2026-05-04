import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

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
    });
  }

  return sqlClient;
}
