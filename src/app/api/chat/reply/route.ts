import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDomChatMessages } from "@/lib/dom/repository";
import { getPostgresClient } from "@/lib/supabase/postgres";

type PostgresClient = NonNullable<ReturnType<typeof getPostgresClient>>;

const chatReplySchema = z.object({
  campaign_id: z.string().uuid(),
  message: z.string().min(1),
  reply_to_message_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedAgentRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = chatReplySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid chat reply payload" },
      { status: 400 },
    );
  }

  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  const { campaign_id: campaignId, message, reply_to_message_id: replyToMessageId } =
    parsed.data;

  const thread = replyToMessageId
    ? await findThreadByReplyTarget({ campaignId, replyToMessageId, sql })
    : await findThreadByCampaign({ campaignId, sql });

  if (!thread?.id) {
    return NextResponse.json(
      { ok: false, error: "Chat thread not found for campaign/reply target" },
      { status: 404 },
    );
  }

  const inserted = await sql.begin(async (tx) => {
    const rows = await tx`
      insert into chat_messages (
        thread_id,
        role,
        content,
        metadata
      ) values (
        ${thread.id},
        'dom',
        ${message},
        ${tx.json({
          source: "agent_reply",
          reply_to_message_id: replyToMessageId ?? null,
        })}
      )
      returning id::text as id, created_at
    `;

    await tx`
      update chat_threads
      set updated_at = now()
      where id = ${thread.id}
    `;

    return rows[0];
  });

  const messages = await getDomChatMessages(thread.id);

  return NextResponse.json({
    ok: true,
    message_id: inserted?.id,
    thread_id: thread.id,
    messages,
  });
}

async function findThreadByReplyTarget({
  campaignId,
  replyToMessageId,
  sql,
}: {
  campaignId: string;
  replyToMessageId: string;
  sql: PostgresClient;
}) {
  const rows = await sql`
    select
      ct.id::text as id
    from chat_messages cm
    join chat_threads ct on ct.id = cm.thread_id
    where cm.id = ${replyToMessageId}
      and ct.campaign_id = ${campaignId}
    limit 1
  `;

  return rows[0] ?? null;
}

async function findThreadByCampaign({
  campaignId,
  sql,
}: {
  campaignId: string;
  sql: PostgresClient;
}) {
  const rows = await sql`
    select id::text as id
    from chat_threads
    where campaign_id = ${campaignId}
    order by updated_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

function isAuthorizedAgentRequest(req: NextRequest) {
  const token = process.env.AGENT_API_TOKEN || process.env.DOM_API_TOKEN;
  const authorization = req.headers.get("authorization");
  return Boolean(token && authorization === `Bearer ${token}`);
}
