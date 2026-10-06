import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { LookoutRouter } from "./lookout.router";
import { LookoutService } from "./lookout.service";
import { LookoutMailService } from "./lookout-mail.service";
import { MailboxCallbackController } from "./mailbox-callback.controller";
@Module({
	imports: [TrpcModule, MailboxModule],
	controllers: [MailboxCallbackController],
	providers: [LookoutService, LookoutRouter, LookoutMailService],
})
export class LookoutModule {}
