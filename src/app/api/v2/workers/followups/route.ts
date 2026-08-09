import { processDueFollowups } from "@/lib/v2/followup-worker";

export async function POST(request: Request) { if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: "unauthorized" }, { status: 401 }); try { const results = await processDueFollowups(); return Response.json({ processed: results.length, results }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "worker_failed" }, { status: 500 }); } }
