import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { PASTORAL_CAMPAIGN_SLUG } from "@/lib/pastoral/config";
import { normalizeEmail } from "@/lib/prospecting/normalize";
import { getPostgresClient } from "@/lib/supabase/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(100),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json(
      { ok: false, error: "Missing database configuration" },
      { status: 500 },
    );
  }

  const results = [];
  for (const rawEmail of parsed.data.emails) {
    const email = normalizeEmail(rawEmail);
    const rows = await sql`
      select
        co.canonical_name as company_name,
        ct.email::text as email,
        m.id::text as message_id,
        m.status::text as status,
        m.gmail_message_id,
        m.gmail_thread_id,
        m.sent_at,
        m.created_at
      from messages m
      join campaigns c on c.id = m.campaign_id
      left join companies co on co.id = m.company_id
      left join contacts ct on ct.id = m.contact_id
      where c.slug = ${PASTORAL_CAMPAIGN_SLUG}
        and m.kind = 'outbound_initial'
        and lower(ct.email::text) = ${email}
      order by m.created_at desc
      limit 3
    `;

    results.push({
      email,
      latest: rows[0] ?? null,
      history: rows,
      sent: rows.some((row) => row.status === "sent" && row.gmail_message_id),
    });
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((result) => result.sent).length,
    missing: results.filter((result) => !result.sent).map((result) => result.email),
    results,
  });
}
