import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const includeSeed = process.argv.includes("--seed");
if (!databaseUrl) throw new Error("Falta SUPABASE_DB_URL o DATABASE_URL.");

const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
try {
  const [{ legacy_exists: legacyExists }] = await sql`select to_regclass('public.campaigns') is not null as legacy_exists`;
  if (!legacyExists) {
    console.log("Inicializando esquema V1 requerido por las migraciones aditivas...");
    await sql.unsafe(await readFile("supabase/schema.sql", "utf8"));
    if (includeSeed) await sql.unsafe(await readFile("supabase/seed.sql", "utf8"));
  }

  await sql`create schema if not exists app_migrations`;
  await sql`create table if not exists app_migrations.applied (version text primary key, applied_at timestamptz not null default now())`;
  const migrationFiles = (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  for (const file of migrationFiles) {
    const [existing] = await sql`select version from app_migrations.applied where version = ${file}`;
    if (existing) {
      console.log(`Omitiendo ${file}: ya aplicada.`);
      continue;
    }
    const statement = await readFile(`supabase/migrations/${file}`, "utf8");
    console.log(`Aplicando ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(statement);
      await tx`insert into app_migrations.applied (version) values (${file})`;
    });
  }
  console.log("Esquema Enterprise Lookout V2 actualizado.");
} finally {
  await sql.end();
}
