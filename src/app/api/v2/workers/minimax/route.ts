import { processMinimaxQueue } from "@/lib/v2/ai-worker";
import { authorizeWorkspaceCronRequest, listWorkspaceIds } from "@/lib/v2/runtime-config";

export async function POST(request: Request) {
  try {
    const workspaces = await authorizeWorkspaceCronRequest(request.headers.get("authorization"), await listWorkspaceIds());
    if (workspaces.length === 0) return Response.json({ error: "unauthorized" }, { status: 401 });
    const jobs = await processMinimaxQueue(5, workspaces); return Response.json({ processed: jobs.length, jobs });
  } catch { return Response.json({ error: "worker_unavailable" }, { status: 503 }); }
}
