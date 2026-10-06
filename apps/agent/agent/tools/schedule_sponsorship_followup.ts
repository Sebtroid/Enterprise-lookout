import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { editableLookoutChat } from "../lib/lookout-chat";

export default defineTool({
	description:
		"Set a follow-up date for a sponsorship in the current user's active work/event, only when explicitly requested. Saves a pending task; does not send a follow-up email.",
	inputSchema: z.object({
		sponsorshipId: z.string().min(1).max(160),
		nextFollowupAt: z.string().datetime(),
	}),
	async execute(input, ctx) {
		const { scope, work } = await editableLookoutChat(ctx);
		const result = await db.sponsorship.updateMany({
			where: {
				id: input.sponsorshipId,
				event: {
					workAreaId: work.id,
					status: { in: ["planning", "active"] },
					...(scope.eventId ? { id: scope.eventId } : {}),
				},
				company: { archivedAt: null },
			},
			data: { nextFollowupAt: new Date(input.nextFollowupAt) },
		});
		if (result.count !== 1)
			throw new Error("Auspicio fuera del contexto activo.");
		return {
			saved: true,
			nextFollowupAt: input.nextFollowupAt,
			note: "Seguimiento guardado. No se ha enviado correo.",
		};
	},
});
