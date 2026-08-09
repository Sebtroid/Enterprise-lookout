import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodType } from "zod";

import { ENTERPRISE_TOOL_DEFINITIONS, executeEnterpriseTool, type ToolActor } from "@/lib/v2/tool-service";

export async function handleEnterpriseMcpRequest(request: Request, actor: ToolActor) {
  const server = new McpServer(
    { name: "enterprise-lookout", version: "2.0.0" },
    { instructions: "Consulta el contexto antes de mutar. Solo procesa investigación aprobada. Nunca envíes correo; crea borradores para revisión. Toda mutación requiere idempotencyKey." },
  );

  const registerTool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: { title: string; description: string; inputSchema: Record<string, ZodType>; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean } },
    handler: (input: Record<string, unknown>) => Promise<CallToolResult>,
  ) => void;

  for (const definition of ENTERPRISE_TOOL_DEFINITIONS) {
    registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.schema.shape,
        annotations: {
          readOnlyHint: !definition.mutates,
          destructiveHint: false,
          openWorldHint: definition.name === "save_research_report",
        },
      },
      async (input) => {
        try {
          const result = await executeEnterpriseTool(definition.name, input, actor);
          return {
            structuredContent: result,
            content: [{ type: "text" as const, text: toolResultSummary(definition.name, result) }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: error instanceof Error ? error.message : "No fue posible completar la herramienta" }],
          };
        }
      },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

function toolResultSummary(name: string, result: Record<string, unknown>) {
  if (name === "list_projects") return `Se encontraron ${(result.projects as unknown[] | undefined)?.length ?? 0} proyectos visibles.`;
  if (name === "list_approved_research") return `Hay ${(result.jobs as unknown[] | undefined)?.length ?? 0} investigaciones aprobadas pendientes.`;
  if (name === "upsert_draft") return "Borrador guardado para revisión humana; no se envió ningún correo.";
  return "Enterprise Lookout guardó el resultado con atribución y controles de acceso.";
}
