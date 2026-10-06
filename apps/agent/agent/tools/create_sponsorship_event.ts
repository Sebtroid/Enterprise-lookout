import { createHash } from "node:crypto";
import { db } from "@crm/db";
import { eventInput } from "@crm/validation/lookout";
import { defineTool } from "eve/tools";
import { editableLookoutChat } from "../lib/lookout-chat";

export default defineTool({
	description:
		"Create an event in the current user's selected work after an explicit request to create that event. Keep unknown date, location and budget unset. Does not change existing events or another work.",
	inputSchema: eventInput,
	async execute(input, ctx) {
		const { userId, work } = await editableLookoutChat(ctx);
		const id = `dom-event-${createHash("sha256").update(`${userId}:${ctx.callId}`).digest("hex")}`;
		return db.sponsorEvent.upsert({
			where: { id },
			update: {},
			create: {
				...input,
				id,
				workAreaId: work.id,
				date: input.date ? new Date(input.date) : null,
				startsOn: input.startsOn ? new Date(input.startsOn) : null,
				endsOn: input.endsOn ? new Date(input.endsOn) : null,
			},
			select: { id: true, name: true, workAreaId: true },
		});
	},
});
