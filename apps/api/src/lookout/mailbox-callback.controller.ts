import { BadRequestException, Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { LookoutMailboxService } from "../mailbox/lookout-mailbox.service";
import { assertHumanSession } from "../trpc/middlewares/session-only.middleware";
import { createBaseTrpcContext } from "../trpc/trpc.context";

const callbackSchema = z.object({
	state: z.string().min(20).max(200),
	code: z.string().min(1).max(4096),
});

@Controller("google/mailbox")
export class MailboxCallbackController {
	constructor(private readonly mailbox: LookoutMailboxService) {}

	@Get("callback")
	async callback(@Req() req: Request, @Res() res: Response) {
		res.setHeader("Cache-Control", "no-store");
		res.setHeader("Referrer-Policy", "no-referrer");
		try {
			const ctx = await createBaseTrpcContext(req);
			assertHumanSession(ctx);
			const result = callbackSchema.safeParse(req.query);
			if (!result.success || !ctx.session?.user)
				throw new BadRequestException(
					"La autorización se canceló o venció. Conecta Gmail nuevamente desde la app.",
				);
			await this.mailbox.finish(
				ctx.session.user.id,
				result.data.state,
				result.data.code,
			);
			return res.redirect(await this.mailbox.returnUrl("connected"));
		} catch (error) {
			const message =
				error instanceof BadRequestException
					? error.message
					: "No se pudo conectar Gmail. Revisa la cuenta elegida y vuelve a intentarlo desde la app.";
			return res.redirect(await this.mailbox.returnUrl("error", message));
		}
	}
}
