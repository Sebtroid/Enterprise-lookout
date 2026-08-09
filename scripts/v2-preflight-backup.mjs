import { createCipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const encryptionSecret = process.env.V2_BACKUP_ENCRYPTION_KEY;
if (!databaseUrl) throw new Error("Falta SUPABASE_DB_URL o DATABASE_URL.");
if (!encryptionSecret || encryptionSecret.length < 24) throw new Error("V2_BACKUP_ENCRYPTION_KEY debe tener al menos 24 caracteres.");

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputRoot = resolve(process.env.V2_BACKUP_DIR ?? join(process.cwd(), "..", "enterprise-lookout-backups"), stamp);
const tempRoot = await mkdtemp(join(tmpdir(), "enterprise-lookout-backup-"));
await mkdir(outputRoot, { recursive: true });

const files = [
  { name: "schema.sql", args: [] },
  { name: "data.sql", args: ["--data-only", "--use-copy"] },
  { name: "roles.sql", args: ["--role-only"] },
];

try {
  for (const file of files) {
    const target = join(tempRoot, file.name);
    runSupabase(["db", "dump", "--db-url", databaseUrl, "--file", target, ...file.args]);
  }
  const config = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(NEXT_PUBLIC_SUPABASE_|SUPABASE_|GMAIL_|MINIMAX_|CRON_|APP_ALLOWED_|NEXT_PUBLIC_APP_URL)/.test(key)));
  await writeFile(join(tempRoot, "runtime-config.json"), JSON.stringify(config, null, 2), "utf8");

  const manifest = { createdAt: new Date().toISOString(), format: "aes-256-gcm", files: {} };
  for (const name of [...files.map((file) => file.name), "runtime-config.json"]) {
    const plain = await readFile(join(tempRoot, name));
    const encrypted = encrypt(plain, encryptionSecret);
    const encryptedName = `${name}.enc`;
    await writeFile(join(outputRoot, encryptedName), encrypted);
    manifest.files[encryptedName] = { sha256: createHash("sha256").update(encrypted).digest("hex"), bytes: encrypted.length };
  }
  await writeFile(join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Respaldo cifrado creado en ${outputRoot}`);
} finally {
  if (dirname(tempRoot) !== resolve(tmpdir())) throw new Error("Ruta temporal inesperada; no se eliminó.");
  await rm(tempRoot, { recursive: true, force: true });
}

function runSupabase(args) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(executable, ["--yes", "supabase@latest", ...args], { stdio: "inherit", shell: false });
  if (result.status !== 0) throw new Error("Supabase CLI no pudo crear el respaldo. Verifica Docker y la conexión.");
}

function encrypt(plain, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("ELV2BACKUP1"), salt, iv, cipher.getAuthTag(), body]);
}
