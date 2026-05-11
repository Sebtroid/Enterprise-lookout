import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { DOM_TASK_STATUSES } from "@/lib/dom/status";
import { getPostgresClient } from "@/lib/supabase/postgres";

const progressSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(DOM_TASK_STATUSES),
  step: z.string().trim().max(120).nullable().optional(),
  message: z.string().trim().max(2_000).nullable().optional(),
  percent: z.number().min(0).max(100).nullable().optional(),
  result_preview: z.string().trim().max(2_000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = progressSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid progress payload" },
      { status: 400 },
    );
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  const progress = {
    status: parsed.data.status,
    step: parsed.data.step ?? null,
    message: parsed.data.message ?? null,
    percent: parsed.data.percent ?? null,
    result_preview: parsed.data.result_preview ?? null,
    reported_at: new Date().toISOString(),
  };

  const rows = await sql`
    update dom_tasks
    set
      status = ${parsed.data.status}::dom_task_status,
      progress_step = ${progress.step},
      progress_message = ${progress.message},
      progress_percent = ${progress.percent},
      result_preview = ${progress.result_preview},
      last_progress_at = now(),
      context = coalesce(context, '{}'::jsonb) || ${sql.json({ latest_progress: progress })}::jsonb,
      updated_at = now()
    where id = ${parsed.data.task_id}
    returning id::text as id, status::text as status, updated_at
  `;

  if (!rows[0]) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    task_id: rows[0].id,
    status: rows[0].status,
    updated_at: rows[0].updated_at,
  });
}
