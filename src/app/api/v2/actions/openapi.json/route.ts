import { buildV2ActionsOpenApi } from "@/lib/v2/actions-openapi";

export function GET(request: Request) { return Response.json(buildV2ActionsOpenApi(new URL(request.url).origin)); }
