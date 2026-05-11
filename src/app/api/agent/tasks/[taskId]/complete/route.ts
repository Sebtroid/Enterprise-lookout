import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { normalizeDomCompanyCandidates } from "@/lib/dom/company-candidates";
import { getPostgresClient } from "@/lib/supabase/postgres";

const completeSchema = z.object({
  result: z.unknown().optional(),
  company_candidates: z.array(z.unknown()).optional(),
  companies_added: z.array(z.unknown()).optional(),
  contacts_added: z.array(z.unknown()).optional(),
  drafts_created: z.array(z.unknown()).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return NextResponse.json({ ok: false, error: "Invalid task id" }, { status: 400 });
  }

  const parsed = completeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid completion payload" },
      { status: 400 },
    );
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  const completion = {
    result: parsed.data.result ?? null,
    company_candidates: parsed.data.company_candidates ?? [],
    companies_added: parsed.data.companies_added ?? [],
    contacts_added: parsed.data.contacts_added ?? [],
    drafts_created: parsed.data.drafts_created ?? [],
    completed_at: new Date().toISOString(),
  };
  const completionContext = toJsonValue({ completion }) as Parameters<
    typeof sql.json
  >[0];
  const resultText = stringifyResult(parsed.data.result);
  const candidates = normalizeDomCompanyCandidates(parsed.data);

  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      update dom_tasks
      set
        status = 'completed'::dom_task_status,
        result = ${resultText},
        progress_percent = 100,
        last_progress_at = now(),
        context = coalesce(context, '{}'::jsonb) || ${tx.json(completionContext)}::jsonb,
        updated_at = now()
      where id = ${taskId}
      returning
        id::text as id,
        campaign_id::text as campaign_id,
        status::text as status,
        updated_at
    `;

    const task = rows[0];
    if (!task) return null;

    for (const candidate of candidates) {
      await tx`
        insert into dom_task_company_candidates (
          task_id,
          campaign_id,
          name,
          normalized_name,
          domain,
          website,
          industry,
          region,
          description,
          evidence_urls,
          suggested_contacts,
          fit_score,
          fit_reason,
          quality_rating,
          quality_reason,
          status
        ) values (
          ${taskId},
          ${task.campaign_id},
          ${candidate.name},
          ${candidate.normalizedName},
          ${candidate.domain},
          ${candidate.website},
          ${candidate.industry},
          ${candidate.region},
          ${candidate.description},
          ${candidate.evidenceUrls},
          ${tx.json(candidate.suggestedContacts as Parameters<typeof tx.json>[0])},
          ${candidate.fitScore},
          ${candidate.fitReason},
          ${candidate.qualityRating},
          ${candidate.qualityReason},
          'pending'
        )
        on conflict (task_id, normalized_name) do update
        set
          domain = excluded.domain,
          website = excluded.website,
          industry = excluded.industry,
          region = excluded.region,
          description = excluded.description,
          evidence_urls = excluded.evidence_urls,
          suggested_contacts = excluded.suggested_contacts,
          fit_score = excluded.fit_score,
          fit_reason = excluded.fit_reason,
          quality_rating = excluded.quality_rating,
          quality_reason = excluded.quality_reason,
          updated_at = now()
      `;
    }

    return {
      task,
      candidateCount: candidates.length,
    };
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    task_id: result.task.id,
    status: result.task.status,
    candidate_count: result.candidateCount,
    updated_at: result.task.updated_at,
  });
}

function stringifyResult(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
