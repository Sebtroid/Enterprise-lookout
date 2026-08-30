import { processDueFollowups } from "@/lib/v2/followup-worker";
import { authorizeWorkspaceCronRequest, listWorkspaceIds } from "@/lib/v2/runtime-config";

export async function POST(request: Request) { try { const workspaces = await authorizeWorkspaceCronRequest(request.headers.get("authorization"), await listWorkspaceIds()); if (workspaces.length === 0) return Response.json({ error: "unauthorized" }, { status: 401 }); const results = await processDueFollowups(10, workspaces); return Response.json({ processed: results.length, results }); } catch { return Response.json({ error: "worker_unavailable" }, { status: 503 }); } }
