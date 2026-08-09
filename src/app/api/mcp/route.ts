import { authenticateToolRequest } from "@/lib/v2/tool-service";
import { handleEnterpriseMcpRequest } from "@/lib/v2/mcp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  const actor = await authenticateToolRequest(request);
  if (!actor) {
    const resource = new URL("/.well-known/oauth-protected-resource", request.url).toString();
    return Response.json(
      { error: "unauthorized", message: "Conecta tu perfil de Enterprise Lookout antes de usar herramientas." },
      { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resource}"` } },
    );
  }
  return handleEnterpriseMcpRequest(request, actor);
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
