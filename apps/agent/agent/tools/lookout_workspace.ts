import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { lookoutContext } from "../lib/lookout";
import { attribute, purposeOf, requireAttribute } from "../lib/session-purpose";

export default defineTool({
	description:
		"Read the selected Enterprise Lookout work and event, sponsorships, contacts, budgets, contributions, follow-ups and drafts. Call this before answering sponsorship questions. Free. It preserves the chat's selected section and work.",
	inputSchema: z.object({}),
	async execute(_input, ctx) {
		if (purposeOf(ctx) !== "builder")
			throw new Error("Esta herramienta pertenece al chat privado de Dom.");
		const result = await lookoutContext(
			db,
			requireAttribute(ctx, "userId"),
			requireAttribute(ctx, "conversationId"),
			{
				ownerId: attribute(ctx, "lookoutOwnerId") ?? undefined,
				workAreaId: attribute(ctx, "lookoutWorkId") ?? undefined,
				eventId: attribute(ctx, "lookoutEventId") ?? undefined,
			},
		);
		return JSON.parse(JSON.stringify(result));
	},
});
