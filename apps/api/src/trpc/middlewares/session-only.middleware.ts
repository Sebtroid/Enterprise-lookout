import { API_KEY_HEADER } from "@crm/auth";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import type { BaseTrpcContext } from "../context.types";

export function assertHumanSession(ctx: BaseTrpcContext) {
	if (!ctx.session?.user || ctx.req?.headers[API_KEY_HEADER])
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Esta acción requiere una sesión humana en la app.",
		});
}

@Injectable()
export class SessionOnlyMiddleware implements TRPCMiddleware {
	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		assertHumanSession(ctx);
		return opts.next();
	}
}
