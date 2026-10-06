import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

function key(secret: string) {
	if (secret.length < 32)
		throw new Error(
			"La clave del servidor no permite cifrar la conexión de correo.",
		);
	return createHash("sha256").update(`lookout-mailbox:v1:${secret}`).digest();
}

export function sealMailboxValue(
	value: string,
	secret: string,
	userId: string,
) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
	cipher.setAAD(Buffer.from(userId));
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

export function openMailboxValue(
	value: string,
	secret: string,
	userId: string,
) {
	const [version, iv, tag, encrypted, extra] = value.split(".");
	if (version !== "v1" || !iv || !tag || !encrypted || extra)
		throw new Error("La conexión de correo requiere una nueva autorización.");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key(secret),
		Buffer.from(iv, "base64url"),
	);
	decipher.setAAD(Buffer.from(userId));
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(encrypted, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
