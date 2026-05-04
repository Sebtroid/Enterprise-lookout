import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL or DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
});

for (const file of ["supabase/schema.sql", "supabase/seed.sql"]) {
  const statement = await readFile(file, "utf8");
  console.log(`Applying ${file}`);
  await sql.unsafe(statement);
}

await sql.end();
console.log("Supabase schema and seed applied.");
