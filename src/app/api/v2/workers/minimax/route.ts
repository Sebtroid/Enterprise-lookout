import { processMinimaxQueue } from "@/lib/v2/ai-worker";

export async function POST(request: Request) {
  const token = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || token !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { const jobs = await processMinimaxQueue(); return Response.json({ processed: jobs.length, jobs }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "worker_failed" }, { status: 500 }); }
}
