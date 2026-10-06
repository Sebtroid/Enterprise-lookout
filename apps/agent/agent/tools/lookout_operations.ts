import { db } from "@crm/db";
import { readLookoutOperations } from "@crm/db/lookout-operations";
import { operationsOutput } from "@crm/validation/lookout";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { lookoutAccess } from "../lib/lookout";
import { lookoutChat } from "../lib/lookout-chat";

export default defineTool({
	description:
		"Read today's sponsorship operations: follow-ups due within 24 hours, drafts awaiting human review/send, upcoming benefits, companies ready to contact, and the current user's received emails related to this work. No unread-email inference and no automatic event attribution. Read-only.",
	inputSchema: z.object({}),
	outputSchema: operationsOutput,
	async execute(_input, ctx) {
		const { userId, conversationId, scope } = lookoutChat(ctx);
		await lookoutAccess(db, userId, conversationId, scope);
		return operationsOutput.parse(
			await readLookoutOperations(db, userId, scope),
		);
	},
});
