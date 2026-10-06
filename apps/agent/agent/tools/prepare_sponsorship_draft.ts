import { createHash } from "node:crypto";
import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { prepareLookoutDraft } from "../lib/lookout";
import { attribute, purposeOf, requireAttribute } from "../lib/session-purpose";

export default defineTool({
	description:
		"Prepare one sponsorship email draft for human review, only after the user asks for a draft. Use an inspected sponsorship id from lookout_workspace. Does not approve or send. The current user must own the work.",
	inputSchema: z.object({
		sponsorshipId: z.string().min(1).max(160),
		subject: z.string().trim().min(1).max(500),
		body: z.string().trim().min(1).max(5000),
	}),
	async execute(input, ctx) {
		if (
			purposeOf(ctx) !== "builder" ||
			attribute(ctx, "commandType") !== "CHAT"
		)
			throw new Error("Los borradores se preparan en un chat privado.");
		const userId = requireAttribute(ctx, "userId");
		const id = `dom-${createHash("sha256").update(`${userId}:${ctx.callId}`).digest("hex")}`;
		return prepareLookoutDraft(
			db,
			userId,
			requireAttribute(ctx, "conversationId"),
			{
				ownerId: attribute(ctx, "lookoutOwnerId") ?? undefined,
				workAreaId: attribute(ctx, "lookoutWorkId") ?? undefined,
				eventId: attribute(ctx, "lookoutEventId") ?? undefined,
			},
			{ ...input, id },
		);
	},
});
