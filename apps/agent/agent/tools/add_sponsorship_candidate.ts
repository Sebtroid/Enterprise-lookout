import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { addLookoutCandidate, candidateInput } from "../lib/lookout-candidate";
import { lookoutChat } from "../lib/lookout-chat";

export default defineTool({
	description:
		"Save a sourced company as a sponsorship candidate in the current user's active work/event, after an explicit request to work with/find/contact brands. Reuses shared companies by normalized domain and prevents duplicate event candidates. Does not mark contacted or send mail.",
	inputSchema: candidateInput,
	async execute(input, ctx) {
		const { userId, conversationId, scope } = lookoutChat(ctx);
		return addLookoutCandidate(db, userId, conversationId, scope, input);
	},
});
