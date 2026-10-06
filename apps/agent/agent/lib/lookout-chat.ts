import { db } from "@crm/db";
import { lookoutAccess } from "./lookout";
import { attribute, purposeOf, requireAttribute } from "./session-purpose";

type Context = Parameters<typeof purposeOf>[0];

export function lookoutChat(ctx: Context) {
	if (purposeOf(ctx) !== "builder" || attribute(ctx, "commandType") !== "CHAT")
		throw new Error("Esta acción requiere un chat privado con Dom.");
	return {
		userId: requireAttribute(ctx, "userId"),
		conversationId: requireAttribute(ctx, "conversationId"),
		scope: {
			ownerId: attribute(ctx, "lookoutOwnerId") ?? undefined,
			workAreaId: attribute(ctx, "lookoutWorkId") ?? undefined,
			eventId: attribute(ctx, "lookoutEventId") ?? undefined,
		},
	};
}

export async function editableLookoutChat(ctx: Context, eventId?: string) {
	const chat = lookoutChat(ctx);
	if (eventId && chat.scope.eventId && eventId !== chat.scope.eventId)
		throw new Error("El evento no corresponde al contexto de este chat.");
	const scope = { ...chat.scope, ...(eventId ? { eventId } : {}) };
	const access = await lookoutAccess(
		db,
		chat.userId,
		chat.conversationId,
		scope,
	);
	if (!access.work || !access.canEdit)
		throw new Error("Solo puedes modificar eventos de tu trabajo activo.");
	return { ...chat, ...access, scope, work: access.work };
}
