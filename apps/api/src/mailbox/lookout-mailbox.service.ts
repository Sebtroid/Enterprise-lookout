import { createHash, randomBytes, randomUUID } from "node:crypto";
import { apiUrl, appUrl } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	RUNTIME_SECRET_NAMES,
	readRuntimeSecret,
} from "@crm/db/runtime-secrets";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	ServiceUnavailableException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import { LOOKOUT } from "../lookout/lookout.config";
import { openMailboxValue, sealMailboxValue } from "./mailbox-crypto";

export const MAILBOX_SCOPES = {
	read: "https://www.googleapis.com/auth/gmail.readonly",
	send: "https://www.googleapis.com/auth/gmail.send",
} as const;

const stateSchema = z.object({ verifier: z.string(), email: z.email() });
const tokenSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().optional(),
	expires_in: z.number().positive(),
	scope: z.string().optional(),
});
const profileSchema = z.object({ emailAddress: z.email() });

@Injectable()
export class LookoutMailboxService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	private get secret() {
		return process.env.BETTER_AUTH_SECRET ?? "";
	}
	private get callbackUrl() {
		return new URL("/google/mailbox/callback", apiUrl).toString();
	}

	private async credentials() {
		const [clientId, clientSecret] = await Promise.all([
			process.env.GOOGLE_CLIENT_ID?.trim() ||
				readRuntimeSecret(RUNTIME_SECRET_NAMES.googleClientId),
			process.env.GOOGLE_CLIENT_SECRET?.trim() ||
				readRuntimeSecret(RUNTIME_SECRET_NAMES.googleClientSecret),
		]);
		return clientId && clientSecret ? { clientId, clientSecret } : null;
	}

	async status(userId: string) {
		const row = await this.db.lookoutMailbox.findUnique({
			where: { userId },
			select: { email: true, scopes: true },
		});
		return {
			configured: Boolean(await this.credentials()),
			connected: Boolean(row),
			email: row?.email ?? null,
			canRead: row?.scopes.includes(MAILBOX_SCOPES.read) ?? false,
			canSend: row?.scopes.includes(MAILBOX_SCOPES.send) ?? false,
		};
	}

	async begin(userId: string, email: string) {
		const credentials = await this.credentials();
		if (!credentials)
			throw new ServiceUnavailableException(
				"Configura el cliente de Google en Supabase Vault.",
			);
		const state = randomBytes(32).toString("base64url");
		const verifier = randomBytes(48).toString("base64url");
		const identifier = `lookout-mailbox:${userId}:${createHash("sha256").update(state).digest("hex")}`;
		await this.db.verification.deleteMany({
			where: { identifier: { startsWith: `lookout-mailbox:${userId}:` } },
		});
		await this.db.verification.create({
			data: {
				id: randomUUID(),
				identifier,
				value: sealMailboxValue(
					JSON.stringify({ verifier, email: email.toLowerCase() }),
					this.secret,
					userId,
				),
				expiresAt: new Date(Date.now() + LOOKOUT.mailbox.stateTtlMs),
			},
		});
		const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
		url.search = new URLSearchParams({
			client_id: credentials.clientId,
			redirect_uri: this.callbackUrl,
			response_type: "code",
			scope: Object.values(MAILBOX_SCOPES).join(" "),
			state,
			code_challenge: createHash("sha256").update(verifier).digest("base64url"),
			code_challenge_method: "S256",
			access_type: "offline",
			prompt: "consent select_account",
			login_hint: email,
			include_granted_scopes: "false",
		}).toString();
		return { url: url.toString() };
	}

	async finish(userId: string, state: string, code: string) {
		const identifier = `lookout-mailbox:${userId}:${createHash("sha256").update(state).digest("hex")}`;
		const row = await this.db.verification.findFirst({
			where: { identifier, expiresAt: { gt: new Date() } },
		});
		if (!row)
			throw new BadRequestException(
				"La autorización venció. Vuelve a conectar Gmail desde la app.",
			);
		const claimed = await this.db.verification.deleteMany({
			where: { id: row.id, expiresAt: { gt: new Date() } },
		});
		if (claimed.count !== 1)
			throw new BadRequestException("La autorización ya se utilizó.");
		const pending = stateSchema.parse(
			JSON.parse(openMailboxValue(row.value, this.secret, userId)),
		);
		const credentials = await this.credentials();
		if (!credentials)
			throw new ServiceUnavailableException("Google no está configurado.");
		const response = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: credentials.clientId,
				client_secret: credentials.clientSecret,
				redirect_uri: this.callbackUrl,
				grant_type: "authorization_code",
				code_verifier: pending.verifier,
			}),
			signal: AbortSignal.timeout(LOOKOUT.mailbox.requestTimeoutMs),
		});
		if (!response.ok)
			throw new BadRequestException(
				"Google rechazó la autorización. Vuelve a conectar Gmail.",
			);
		const token = tokenSchema.parse(await response.json());
		const scopes = (token.scope ?? "").split(/\s+/);
		if (!Object.values(MAILBOX_SCOPES).every((scope) => scopes.includes(scope)))
			throw new BadRequestException(
				"Autoriza lectura y envío de Gmail para continuar.",
			);
		const mailbox = await this.profile(token.access_token);
		if (mailbox !== pending.email)
			throw new ConflictException(
				`Selecciona ${pending.email} en Google. La cuenta elegida es diferente.`,
			);
		const old = await this.db.lookoutMailbox.findUnique({ where: { userId } });
		const refreshToken =
			token.refresh_token ||
			(old?.email === mailbox
				? openMailboxValue(old.refreshToken, this.secret, userId)
				: null);
		if (!refreshToken)
			throw new BadRequestException(
				"Google no entregó acceso persistente. Vuelve a autorizar Gmail.",
			);
		const data = {
			email: mailbox,
			accessToken: sealMailboxValue(token.access_token, this.secret, userId),
			refreshToken: sealMailboxValue(refreshToken, this.secret, userId),
			scopes,
			expiresAt: new Date(Date.now() + token.expires_in * 1000),
		};
		await this.db.$transaction(async (tx) => {
			await tx.lookoutMailbox.upsert({
				where: { userId },
				create: { userId, ...data },
				update: data,
			});
			await tx.mailboxSync.upsert({
				where: { userId_source: { userId, source: "gmail" } },
				create: { userId, source: "gmail", autoCreate: false },
				update: {
					cursor: old?.email === mailbox ? undefined : null,
					status: "IDLE",
					lastError: null,
					retryAfter: null,
				},
			});
		});
	}

	async profile(accessToken: string) {
		const response = await fetch(
			"https://gmail.googleapis.com/gmail/v1/users/me/profile",
			{
				headers: { Authorization: `Bearer ${accessToken}` },
				signal: AbortSignal.timeout(LOOKOUT.mailbox.requestTimeoutMs),
			},
		);
		if (!response.ok)
			throw new BadRequestException(
				"Gmail requiere una nueva autorización. Revisa también que Gmail API esté habilitada en Google Cloud.",
			);
		return profileSchema
			.parse(await response.json())
			.emailAddress.toLowerCase();
	}

	async access(userId: string) {
		const row = await this.db.lookoutMailbox.findUnique({ where: { userId } });
		if (!row)
			throw new ConflictException(
				"Conecta tu correo de envío en Ajustes → Conexiones → Gmail.",
			);
		if (row.expiresAt.getTime() > Date.now() + LOOKOUT.mailbox.refreshBeforeMs)
			return {
				email: row.email,
				scopes: row.scopes,
				accessToken: openMailboxValue(row.accessToken, this.secret, userId),
			};
		const credentials = await this.credentials();
		if (!credentials)
			throw new ServiceUnavailableException("Google no está configurado.");
		const response = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				client_id: credentials.clientId,
				client_secret: credentials.clientSecret,
				refresh_token: openMailboxValue(row.refreshToken, this.secret, userId),
			}),
			signal: AbortSignal.timeout(LOOKOUT.mailbox.requestTimeoutMs),
		});
		if (!response.ok)
			throw new ConflictException(
				"Google revocó o venció el acceso. Vuelve a conectar Gmail.",
			);
		const token = tokenSchema.parse(await response.json());
		await this.db.lookoutMailbox.update({
			where: { userId },
			data: {
				accessToken: sealMailboxValue(token.access_token, this.secret, userId),
				expiresAt: new Date(Date.now() + token.expires_in * 1000),
				...(token.refresh_token
					? {
							refreshToken: sealMailboxValue(
								token.refresh_token,
								this.secret,
								userId,
							),
						}
					: {}),
			},
		});
		return {
			email: row.email,
			scopes: row.scopes,
			accessToken: token.access_token,
		};
	}

	async disconnect(userId: string) {
		const row = await this.db.lookoutMailbox.findUnique({ where: { userId } });
		if (row) {
			const response = await fetch("https://oauth2.googleapis.com/revoke", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					token: openMailboxValue(row.refreshToken, this.secret, userId),
				}),
				signal: AbortSignal.timeout(LOOKOUT.mailbox.requestTimeoutMs),
			});
			if (!response.ok && response.status !== 400)
				throw new ServiceUnavailableException(
					"Google no pudo revocar la conexión. Intenta nuevamente.",
				);
		}
		await this.db.$transaction([
			this.db.lookoutMailbox.deleteMany({ where: { userId } }),
			this.db.mailboxSync.deleteMany({ where: { userId, source: "gmail" } }),
		]);
		return this.status(userId);
	}

	async returnUrl(result: "connected" | "error", message?: string) {
		const workspace = await this.db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { slug: true },
		});
		const url = new URL(
			`/${workspace?.slug ?? "enterprise-lookout"}/settings/connections/google`,
			appUrl,
		);
		url.searchParams.set("mailbox", result);
		if (message) url.searchParams.set("message", message);
		return url.toString();
	}
}
