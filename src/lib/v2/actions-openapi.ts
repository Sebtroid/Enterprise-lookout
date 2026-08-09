import { z } from "zod";

import { ENTERPRISE_TOOL_DEFINITIONS } from "@/lib/v2/tool-service";

export function buildV2ActionsOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: { title: "Enterprise Lookout V2 Tools", version: "2.0.0", description: "Herramientas autenticadas para proyectos, investigación, conocimiento y borradores." },
    servers: [{ url: origin }],
    paths: Object.fromEntries(ENTERPRISE_TOOL_DEFINITIONS.map((tool) => [`/api/v2/tools/${tool.name}`, { post: { operationId: tool.name, summary: tool.title, description: tool.description, security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(tool.schema) } } }, responses: { "200": { description: "Resultado estructurado de Enterprise Lookout", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "401": { description: "Conexión no autorizada" }, "403": { description: "Scope o proyecto no permitido" } } } }])),
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" } } },
  };
}
