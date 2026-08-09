import { createDecipheriv, createHash, scryptSync } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const sourceDir = process.env.V2_BACKUP_SOURCE;
const destinationDir = process.env.V2_RESTORE_DIR;
const secret = process.env.V2_BACKUP_ENCRYPTION_KEY;
if (!sourceDir || !destinationDir || !secret) throw new Error("Define V2_BACKUP_SOURCE, V2_RESTORE_DIR y V2_BACKUP_ENCRYPTION_KEY.");
const source = resolve(sourceDir);
const destination = resolve(destinationDir);
if (source === destination || basename(destination).length < 3) throw new Error("V2_RESTORE_DIR no es una ruta segura.");
await mkdir(destination, { recursive: true });
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
for (const [encryptedName, metadata] of Object.entries(manifest.files ?? {})) {
  const encrypted = await readFile(join(source, encryptedName));
  const hash = createHash("sha256").update(encrypted).digest("hex");
  if (hash !== metadata.sha256) throw new Error(`Checksum inválido: ${encryptedName}`);
  const output = join(destination, encryptedName.replace(/\.enc$/, ""));
  try { await access(output); throw new Error(`El destino ya existe: ${output}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await writeFile(output, decrypt(encrypted, secret));
}
console.log(`Respaldo verificado y descifrado en ${destination}`);

function decrypt(value, password) {
  const prefix = value.subarray(0, 11).toString("utf8");
  if (prefix !== "ELV2BACKUP1") throw new Error("Formato de respaldo inválido");
  const salt = value.subarray(11, 27);
  const iv = value.subarray(27, 39);
  const tag = value.subarray(39, 55);
  const body = value.subarray(55);
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
