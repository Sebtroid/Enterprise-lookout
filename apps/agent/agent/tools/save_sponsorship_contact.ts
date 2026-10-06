import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { editableLookoutChat } from "../lib/lookout-chat";
import { contactInput, saveLookoutContact } from "../lib/lookout-contact";

export default defineTool({
	description:
		"Save a sourced business contact and select it for an existing event candidate after the user requests contacting that company. Reuses an existing email, requires source evidence, leaves verification unverified, and never sends or approves an email. Do not invent names or addresses.",
	inputSchema: contactInput,
	async execute(input, ctx) {
		const { userId, work, scope } = await editableLookoutChat(ctx);
		return saveLookoutContact(
			db,
			{ userId, workAreaId: work.id, eventId: scope.eventId },
			input,
		);
	},
});
