import { ENTERPRISE_TOOL_DEFINITIONS, authenticateToolRequest, executeEnterpriseTool } from "@/lib/v2/tool-service";

export async function POST(request: Request, { params }: { params: Promise<{ toolName: string }> }) {
  const actor = await authenticateToolRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { toolName } = await params;
  const definition = ENTERPRISE_TOOL_DEFINITIONS.find((tool) => tool.name === toolName);
  if (!definition) return Response.json({ error: "not_found" }, { status: 404 });
  try { return Response.json(await executeEnterpriseTool(definition.name, await request.json(), actor)); }
  catch (error) { const message = error instanceof Error ? error.message : "No se pudo ejecutar la herramienta"; const status = /scope|puede modificar|workspace/.test(message) ? 403 : 400; return Response.json({ error: "tool_error", message }, { status }); }
}
