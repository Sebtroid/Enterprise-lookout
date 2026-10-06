import {
	actionInput,
	commandOutput,
	contactSearchInput,
	contactSearchOutput,
	mailboxConnectInput,
	mailboxConnectOutput,
	mailboxStatusOutput,
	operationsInput,
	operationsOutput,
	profileInput,
	profileSchema,
	runtimeStatusOutput,
	sendDraftInput,
	sendDraftOutput,
	snapshotInput,
	snapshotOutput,
	usageInput,
	usageOutput,
} from "@crm/validation/lookout";
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { LookoutMailboxService } from "../mailbox/lookout-mailbox.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	assertHumanSession,
	SessionOnlyMiddleware,
} from "../trpc/middlewares/session-only.middleware";
import { restMeta } from "../trpc/openapi";
import { LookoutService } from "./lookout.service";
import { LookoutMailService } from "./lookout-mail.service";

@Router({ alias: "lookout" })
@UseMiddlewares(AuthMiddleware)
export class LookoutRouter {
	constructor(
		@Inject(LookoutService) private readonly lookout: LookoutService,
		@Inject(LookoutMailService) private readonly mail: LookoutMailService,
		@Inject(LookoutMailboxService)
		private readonly mailbox: LookoutMailboxService,
	) {}
	@Query({
		output: mailboxStatusOutput,
		meta: restMeta("GET", "/lookout/mailbox", ["Auspicios"]),
	})
	mailboxStatus(@Ctx() ctx: AuthedTrpcContext) {
		return this.mailbox.status(ctx.user.id);
	}
	@Mutation({
		input: mailboxConnectInput,
		output: mailboxConnectOutput,
		meta: restMeta("POST", "/lookout/mailbox/connect", ["Auspicios"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	connectMailbox(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof mailboxConnectInput>,
	) {
		return this.mailbox.begin(ctx.user.id, input.email);
	}
	@Mutation({
		output: mailboxStatusOutput,
		meta: restMeta("POST", "/lookout/mailbox/disconnect", ["Auspicios"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	disconnectMailbox(@Ctx() ctx: AuthedTrpcContext) {
		return this.mailbox.disconnect(ctx.user.id);
	}
	@Mutation({
		input: sendDraftInput,
		output: sendDraftOutput,
		meta: restMeta("POST", "/lookout/drafts/send", ["Auspicios"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	sendDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendDraftInput>,
	) {
		return this.mail.send(ctx.user.id, input);
	}
	@Mutation({
		input: sendDraftInput.pick({ id: true, eventId: true }),
		output: sendDraftOutput,
		meta: restMeta("POST", "/lookout/drafts/check", ["Auspicios"]),
	})
	@UseMiddlewares(SessionOnlyMiddleware)
	checkDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: { id: string; eventId: string },
	) {
		return this.mail.check(ctx.user.id, input);
	}
	@Query({
		output: runtimeStatusOutput,
		meta: restMeta("GET", "/lookout/runtime", ["Auspicios"]),
	})
	runtimeStatus() {
		return this.lookout.runtimeStatus();
	}
	@Query({
		input: operationsInput,
		output: operationsOutput,
		meta: restMeta("GET", "/lookout/operations", ["Auspicios"]),
	})
	operations(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof operationsInput>,
	) {
		return this.lookout.operations(ctx.user.id, input);
	}
	@Query({
		input: snapshotInput,
		output: snapshotOutput,
		meta: restMeta("GET", "/lookout/workspace", ["Auspicios"]),
	})
	snapshot(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof snapshotInput>,
	) {
		return this.lookout.snapshot(ctx.user.id, input);
	}
	@Query({
		input: profileInput,
		output: profileSchema,
		meta: restMeta("GET", "/lookout/profile", ["Auspicios"]),
	})
	profile(@Input() input: z.infer<typeof profileInput>) {
		return this.lookout.profile(input.entity, input.id);
	}
	@Query({
		input: usageInput,
		output: usageOutput,
		meta: restMeta("GET", "/lookout/usage", ["Auspicios"]),
	})
	usage(@Input() input: z.infer<typeof usageInput>) {
		return this.lookout.usage(input);
	}
	@Query({
		input: contactSearchInput,
		output: contactSearchOutput,
		meta: restMeta("GET", "/lookout/contacts", ["Auspicios"]),
	})
	searchContacts(@Input() input: z.infer<typeof contactSearchInput>) {
		return this.lookout.searchContacts(input);
	}
	@Mutation({
		input: actionInput,
		output: commandOutput,
		meta: restMeta("POST", "/lookout/actions", ["Auspicios"]),
	})
	command(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof actionInput>,
	) {
		if (input.command.action === "approveDraft") assertHumanSession(ctx);
		return this.lookout.command(ctx.user.id, input.command);
	}
}
