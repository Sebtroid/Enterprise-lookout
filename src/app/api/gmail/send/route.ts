import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAllowedUser } from "@/lib/auth/request";
import { isAllowedEmail } from "@/lib/auth/allowed-emails";
import { sendAgentEvent } from "@/lib/agent/events";
import {
  buildGmailSendBody,
  buildMimeMessage,
  encodeRawMessage,
} from "@/lib/gmail/mime";
import { decryptToken, encryptToken } from "@/lib/gmail/token-crypto";
import { PASTORAL_CAMPAIGN_SLUG } from "@/lib/pastoral/config";
import { getPastoralBenefitAttachments } from "@/lib/pastoral/attachments";
import {
  preparePastoralInitialSendGuard,
  type PastoralSendGuardMessage,
} from "@/lib/pastoral/send-guard";
import { getPostgresClient } from "@/lib/supabase/postgres";

const sendBodySchema = z.object({
  messageId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAllowedUser({ allowDemoUser: true, request: req });
    const sql = getPostgresClient();
    if (!user || !sql) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = sendBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid messageId" },
        { status: 400 },
      );
    }
    const { messageId } = parsed.data;

    const messageRows = await sql`
      select
        m.id::text as id,
        m.thread_id,
        m.kind::text as kind,
        m.status::text as status,
        m.campaign_id,
        c.slug as campaign_slug,
        m.company_id,
        m.contact_id,
        sa.email::text as sender_email,
        sa.display_name as sender_display_name,
        sa.account_type,
        sa.status::text as sender_status,
        ct.email::text as to_email,
        ct.full_name as contact_name,
        co.canonical_name as company_name,
        coalesce(m.subject_final, m.subject_draft) as subject,
        coalesce(m.body_final, m.body_draft) as email_body,
        coalesce(m.gmail_thread_id, t.gmail_thread_id) as gmail_thread_id,
        coalesce(co.do_not_contact, false) as company_do_not_contact,
        coalesce(ct.do_not_contact, false) as contact_do_not_contact
      from messages m
      join campaigns c on c.id = m.campaign_id
      join sender_accounts sa on sa.id = m.sender_account_id
      left join threads t on t.id = m.thread_id
      left join companies co on co.id = m.company_id
      left join contacts ct on ct.id = m.contact_id
      where m.id = ${messageId}
        and m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
      limit 1
    `;
    const message = messageRows[0];

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message not found" },
        { status: 404 },
      );
    }

    if (message.status !== "approved") {
      return NextResponse.json(
        {
          ok: false,
          error: "Only approved messages can be sent",
          currentStatus: message.status,
        },
        { status: 409 },
      );
    }

    if (
      message.account_type !== "gmail" ||
      message.sender_status !== "active" ||
      !isAllowedEmail(message.sender_email)
    ) {
      return NextResponse.json(
        { ok: false, error: "Sender is not an active allowed Gmail sender" },
        { status: 403 },
      );
    }

    if (message.company_do_not_contact || message.contact_do_not_contact) {
      return NextResponse.json(
        { ok: false, error: "Blocked by do_not_contact" },
        { status: 409 },
      );
    }

    if (!message.to_email || !message.subject || !message.email_body) {
      return NextResponse.json(
        { ok: false, error: "Message is missing recipient, subject, or body" },
        { status: 400 },
      );
    }

    const isPastoralInitialMail =
      message.campaign_slug === PASTORAL_CAMPAIGN_SLUG &&
      message.kind === "outbound_initial";
    const isPastoralOutreachMail =
      message.campaign_slug === PASTORAL_CAMPAIGN_SLUG &&
      (message.kind === "outbound_initial" || message.kind === "outbound_followup");

    const tokenRows = await sql`
      select access_token, refresh_token, expires_at
      from gmail_tokens
      where user_email = ${message.sender_email}
      limit 1
    `;

    if (!tokenRows[0]) {
      return NextResponse.json(
        {
          ok: false,
          error: `No Gmail token found for ${message.sender_email}. Connect Gmail first.`,
        },
        { status: 401 },
      );
    }

    const { expires_at } = tokenRows[0];
    let access_token = decryptToken(tokenRows[0].access_token);
    const refresh_token = decryptToken(tokenRows[0].refresh_token);

    if (new Date(expires_at) < new Date()) {
      const refreshed = await refreshAccessToken(refresh_token);
      if (!refreshed) {
        return NextResponse.json(
          { ok: false, error: "Token expired and refresh failed. Reconnect Gmail." },
          { status: 401 },
        );
      }
      access_token = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await sql`
        update gmail_tokens
        set access_token = ${encryptToken(access_token)},
            expires_at = ${newExpiresAt},
            updated_at = now()
        where user_email = ${message.sender_email}
      `;
    }

    const attachments = isPastoralOutreachMail
      ? await getPastoralBenefitAttachments({ baseUrl: req.nextUrl.origin })
      : [];

    const pastoralGuard = isPastoralInitialMail
      ? await preparePastoralInitialSendGuard({
          accessToken: access_token,
          message: message as PastoralSendGuardMessage,
          sql,
        })
      : null;

    if (pastoralGuard && !pastoralGuard.ok) {
      return NextResponse.json(
        { ok: false, error: pastoralGuard.error },
        { status: pastoralGuard.status },
      );
    }

    const encodedMessage = encodeRawMessage(
      buildMimeMessage({
        attachments,
        body: message.email_body,
        from: message.sender_email,
        subject: message.subject,
        to: message.to_email,
      }),
    );
    const sendThreadId =
      message.kind === "outbound_reply" ? message.gmail_thread_id : null;

    const sendResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildGmailSendBody({
            raw: encodedMessage,
            threadId: sendThreadId,
          }),
        ),
      }
    );

    const sendResult = await sendResponse.json();

    if (!sendResponse.ok) {
      console.error("Gmail send error:", sendResult);
      if (pastoralGuard?.ok) {
        await pastoralGuard.markFailed({
          error: sendResult.error?.message || "Gmail API error",
          stage: "gmail_send",
        });
      }
      return NextResponse.json(
        { ok: false, error: sendResult.error?.message || "Gmail API error" },
        { status: 500 },
      );
    }

    const gmailMessageId =
      typeof sendResult.id === "string" ? sendResult.id : null;
    const gmailThreadId =
      typeof sendResult.threadId === "string" ? sendResult.threadId : null;

    await sql.begin(async (tx) => {
      const updated = await tx`
        update messages
        set
          status = 'sent',
          sent_at = now(),
          gmail_message_id = ${gmailMessageId},
          gmail_thread_id = coalesce(${gmailThreadId}, ${sendThreadId}, gmail_thread_id),
          future_note = concat_ws(' ', nullif(future_note, ''), 'Enviado vía Gmail API.'),
          updated_at = now()
        where id = ${messageId}
          and status = 'approved'
        returning id, thread_id, campaign_id, company_id, contact_id, sender_account_id, gmail_thread_id
      `;

      if (updated[0]) {
        const sentThreadId = gmailThreadId ?? sendThreadId ?? null;
        let threadId = updated[0].thread_id;

        if (!threadId && sentThreadId) {
          const existingThread = await tx`
            select id
            from threads
            where campaign_id = ${updated[0].campaign_id}
              and gmail_thread_id = ${sentThreadId}
            order by created_at desc
            limit 1
          `;
          threadId = existingThread[0]?.id ?? null;
        }

        if (!threadId) {
          const insertedThread = await tx`
            insert into threads (
              campaign_id,
              company_id,
              contact_id,
              sender_account_id,
              gmail_thread_id,
              subject,
              status,
              last_message_at
            ) values (
              ${updated[0].campaign_id},
              ${updated[0].company_id},
              ${updated[0].contact_id},
              ${updated[0].sender_account_id},
              ${sentThreadId},
              ${message.subject},
              'open',
              now()
            )
            returning id
          `;
          threadId = insertedThread[0]?.id ?? null;
        }

        if (threadId) {
          await tx`
            update threads
            set
              gmail_thread_id = coalesce(${sentThreadId}, gmail_thread_id),
              status = 'open',
              last_message_at = now()
            where id = ${threadId}
          `;

          await tx`
            update messages
            set thread_id = ${threadId}
            where id = ${updated[0].id}
          `;
        }

        await tx`
          update campaign_contacts cc
          set
            status = 'sent',
            last_contacted_at = now(),
            updated_at = now()
          where cc.campaign_id = ${updated[0].campaign_id}
            and cc.company_id = ${updated[0].company_id}
            and (cc.contact_id = ${updated[0].contact_id} or cc.contact_id is null)
        `;
      }
    });

    await sendAgentEvent({
      event: "mail_sent",
      campaignId: String(message.campaign_id),
      companyId: String(message.company_id ?? ""),
      contactId: String(message.contact_id ?? ""),
      messageId,
      data: {
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId ?? sendThreadId ?? null,
        sender_email: String(message.sender_email),
        recipient_email: String(message.to_email),
        subject: String(message.subject),
        same_gmail_thread: Boolean(sendThreadId),
      },
      priority: "normal",
      source: "gmail_send_api",
    });

    if (pastoralGuard?.ok) {
      await pastoralGuard.markSent({
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId ?? sendThreadId ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      gmailMessageId,
      threadId: gmailThreadId,
    });
  } catch (err) {
    console.error("Gmail send error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
  const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return null;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    if (data.error) return null;
    return { access_token: data.access_token, expires_in: data.expires_in };
  } catch {
    return null;
  }
}
