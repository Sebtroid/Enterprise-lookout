import { createHash } from "node:crypto";
import { db } from "@crm/db";
import { APIError, createAuthMiddleware } from "better-auth/api";

export const INVITE_HEADER = "x-lookout-invite";

export function inviteTokenHash(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export const signupInviteGuard = createAuthMiddleware(async (ctx) => {
	if (ctx.path !== "/sign-up/email") return;

	const body = ctx.body;
	const email =
		body && typeof body === "object" && "email" in body
			? body.email
			: undefined;
	const token = ctx.headers?.get(INVITE_HEADER)?.trim();

	if (
		typeof email !== "string" ||
		typeof token !== "string" ||
		token.length < 32 ||
		token.length > 128
	) {
		throw new APIError("FORBIDDEN", {
			message: "Necesitas una invitación válida para crear tu cuenta.",
		});
	}

	const invite = await db.lookoutInvite.findUnique({
		where: { tokenHash: inviteTokenHash(token) },
		select: { email: true, expiresAt: true, usedAt: true },
	});

	if (
		!invite ||
		invite.email !== email.trim().toLowerCase() ||
		invite.usedAt ||
		invite.expiresAt <= new Date()
	) {
		throw new APIError("FORBIDDEN", {
			message: "La invitación no corresponde a este correo o ya venció.",
		});
	}
});
