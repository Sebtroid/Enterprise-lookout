export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["workspace:read", "research:read", "research:write", "knowledge:write", "mail:read", "mail:draft", "jobs:write"],
    resource_documentation: `${origin}/privacy`,
  });
}
