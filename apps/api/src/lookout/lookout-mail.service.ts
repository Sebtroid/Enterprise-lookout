import type { Db } from "@crm/db";
import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import {
	LookoutMailboxService,
	MAILBOX_SCOPES,
} from "../mailbox/lookout-mailbox.service";
import { deliveryRecipient, draftApprovalHash } from "./approvals";
import { LOOKOUT } from "./lookout.config";

const sentSchema = z.object({
	id: z.string().min(1),
	threadId: z.string().min(1),
});
const messageListSchema = z.object({
	messages: z
		.array(z.object({ id: z.string(), threadId: z.string() }))
		.optional(),
});

function encodeSubject(subject: string) {
	const chunks: string[] = [];
	let chunk = "";
	for (const character of subject) {
		if (Buffer.byteLength(chunk + character) > LOOKOUT.mime.subjectChunkBytes) {
			chunks.push(Buffer.from(chunk).toString("base64"));
			chunk = "";
		}
		chunk += character;
	}
	if (chunk) chunks.push(Buffer.from(chunk).toString("base64"));
	return chunks.map((value) => `=?UTF-8?B?${value}?=`).join("\r\n ");
}

export function encodeSponsorMessage(input: {
	id: string;
	from: string;
	to: string;
	subject: string;
	body: string;
}) {
	if (
		[input.from, input.to, input.subject, input.id].some((value) =>
			/[\r\n]/.test(value),
		)
	)
		throw new ConflictException("El correo contiene encabezados inválidos.");
	const mime = [
		`From: ${input.from}`,
		`To: ${input.to}`,
		`Subject: ${encodeSubject(input.subject)}`,
		`Message-ID: <lookout-${input.id}@${input.from.split("@")[1]}>`,
		`Date: ${new Date().toUTCString()}`,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		Buffer.from(input.body.replace(/\r?\n/g, "\r\n"))
			.toString("base64")
			.match(new RegExp(`.{1,${LOOKOUT.mime.bodyLineCharacters}}`, "g"))
			?.join("\r\n") ?? "",
	].join("\r\n");
	return Buffer.from(mime).toString("base64url");
}

@Injectable()
export class LookoutMailService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly mailbox: LookoutMailboxService,
	) {}

	async send(
		userId: string,
		input: { id: string; eventId: string; senderEmail: string },
	) {
		const mailbox = await this.mailbox.access(userId);
		if (!mailbox.scopes.includes(MAILBOX_SCOPES.send))
			throw new ConflictException("Autoriza el envío en Conexiones → Gmail.");
		if (
			mailbox.email !== input.senderEmail.toLowerCase() ||
			(await this.mailbox.profile(mailbox.accessToken)) !== mailbox.email
		)
			throw new ConflictException(
				"El remitente cambió. Revisa el correo antes de enviar.",
			);
		const draft = await this.db.$transaction(async (tx) => {
			const row = await tx.sponsorDraft.findFirst({
				where: {
					id: input.id,
					sponsorship: {
						eventId: input.eventId,
						event: {
							status: { not: "archived" },
							workArea: { ownerId: userId },
						},
					},
				},
				include: { sponsorship: { include: { company: true, contact: true } } },
			});
			if (!row)
				throw new NotFoundException(
					"El borrador no pertenece a un evento activo de tu sección.",
				);
			if (
				row.status !== "approved" ||
				row.approvedBy !== userId ||
				!row.approvedAt
			)
				throw new ConflictException(
					"Revisa y aprueba este borrador antes de enviarlo.",
				);
			const recipient = await deliveryRecipient(tx, row.sponsorship);
			if (row.approvalHash !== draftApprovalHash(row, recipient))
				throw new ConflictException(
					"El contenido o destinatario cambió. Aprueba el borrador nuevamente.",
				);
			const raw = encodeSponsorMessage({
				id: row.id,
				from: mailbox.email,
				to: recipient,
				subject: row.subject,
				body: row.body,
			});
			const claim = await tx.sponsorDraft.updateMany({
				where: {
					id: row.id,
					status: "approved",
					updatedAt: row.updatedAt,
					approvalHash: row.approvalHash,
				},
				data: {
					status: "sending",
					sendingStartedAt: new Date(),
					senderEmail: mailbox.email,
					recipientEmail: recipient,
					sendError: null,
				},
			});
			if (claim.count !== 1)
				throw new ConflictException(
					"Otro envío o cambio ya tomó este borrador. Actualiza el evento.",
				);
			return {
				id: row.id,
				sponsorshipId: row.sponsorshipId,
				raw,
				updatedAt: row.updatedAt,
			};
		});
		let delivered: z.infer<typeof sentSchema> | null = null;
		try {
			const response = await fetch(
				"https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${mailbox.accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ raw: draft.raw }),
					signal: AbortSignal.timeout(LOOKOUT.mailbox.requestTimeoutMs),
				},
			);
			if (!response.ok) {
				if ([400, 401, 403, 404, 413, 429].includes(response.status)) {
					await this.db.sponsorDraft.update({
						where: { id: draft.id },
						data: {
							status: "needs_review",
							approvedBy: null,
							approvedAt: null,
							approvalHash: null,
							sendError:
								"Gmail rechazó el envío. Revisa la conexión y aprueba nuevamente.",
						},
					});
					throw new ConflictException(
						"Gmail rechazó el envío. Revisa la conexión y aprueba nuevamente.",
					);
				}
				throw new Error("Gmail no confirmó la entrega.");
			}
			delivered = sentSchema.parse(await response.json());
			await this.db.$transaction(async (tx) => {
				await tx.sponsorDraft.update({
					where: { id: draft.id },
					data: {
						status: "sent",
						sentAt: new Date(),
						gmailMessageId: delivered?.id,
						gmailThreadId: delivered?.threadId,
						sendError: null,
					},
				});
				await tx.sponsorship.update({
					where: { id: draft.sponsorshipId },
					data: { lastContactedAt: new Date() },
				});
			});
			return {
				id: draft.id,
				status: "sent" as const,
				message: "Correo enviado desde Gmail.",
			};
		} catch (error) {
			if (error instanceof ConflictException) throw error;
			await this.db.sponsorDraft.updateMany({
				where: { id: draft.id, status: "sending" },
				data: {
					status: "send_uncertain",
					gmailMessageId: delivered?.id,
					gmailThreadId: delivered?.threadId,
					sendError:
						"Gmail no confirmó el resultado. Comprueba el envío; este borrador no se reenvía automáticamente.",
				},
			});
			return {
				id: draft.id,
				status: "send_uncertain" as const,
				message:
					"No se pudo confirmar el envío. Comprueba Gmail antes de preparar otro correo.",
			};
		}
	}

	async check(userId: string, input: { id: string; eventId: string }) {
		const row = await this.db.sponsorDraft.findFirst({
			where: {
				id: input.id,
				sponsorship: {
					eventId: input.eventId,
					event: { workArea: { ownerId: userId } },
				},
			},
		});
		if (!row) throw new NotFoundException("Borrador fuera de tu sección.");
		if (row.status === "sent")
			return {
				id: row.id,
				status: "sent" as const,
				message: "El envío ya está confirmado.",
			};
		if (!row.senderEmail || !["sending", "send_uncertain"].includes(row.status))
			throw new ConflictException(
				"Este borrador no tiene un envío pendiente de comprobar.",
			);
		const mailbox = await this.mailbox.access(userId);
		if (
			mailbox.email !== row.senderEmail ||
			!mailbox.scopes.includes(MAILBOX_SCOPES.read)
		)
			throw new ConflictException(
				"Conecta el remitente original con permiso de lectura.",
			);
		const url = new URL(
			"https://gmail.googleapis.com/gmail/v1/users/me/messages",
		);
		url.searchParams.set(
			"q",
			`in:sent rfc822msgid:lookout-${row.id}@${row.senderEmail.split("@")[1]}`,
		);
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${mailbox.accessToken}` },
			signal: AbortSignal.timeout(LOOKOUT.mailbox.requestTimeoutMs),
		});
		if (!response.ok)
			throw new ConflictException(
				"No se pudo comprobar Gmail. Intenta nuevamente.",
			);
		const message = messageListSchema.parse(await response.json())
			.messages?.[0];
		if (!message)
			return {
				id: row.id,
				status: "send_uncertain" as const,
				message:
					"Gmail aún no muestra el correo. El reenvío sigue bloqueado para evitar duplicados.",
			};
		await this.db.$transaction(async (tx) => {
			await tx.sponsorDraft.update({
				where: { id: row.id },
				data: {
					status: "sent",
					sentAt: row.sendingStartedAt ?? new Date(),
					gmailMessageId: message.id,
					gmailThreadId: message.threadId,
					sendError: null,
				},
			});
			await tx.sponsorship.update({
				where: { id: row.sponsorshipId },
				data: { lastContactedAt: row.sendingStartedAt ?? new Date() },
			});
		});
		return {
			id: row.id,
			status: "sent" as const,
			message: "Gmail confirma que el correo se envió.",
		};
	}
}
