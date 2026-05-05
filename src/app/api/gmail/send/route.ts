import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_DB_URL!, {
  ssl: "require",
  prepare: false,
  max: 1,
});

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

interface SendBody {
  to: string;
  subject: string;
  body: string;
  fromEmail: string;
  messageId?: string;
  campaignId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: SendBody = await req.json();
    const { to, subject, body: emailBody, fromEmail, messageId } = body;

    if (!to || !subject || !emailBody || !fromEmail) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: to, subject, body, fromEmail" },
        { status: 400 }
      );
    }

    // 1. Get token from DB
    const tokenRows = await sql`
      select access_token, refresh_token, expires_at
      from gmail_tokens
      where user_email = ${fromEmail}
      limit 1
    `;

    if (!tokenRows[0]) {
      return NextResponse.json(
        { ok: false, error: `No Gmail token found for ${fromEmail}. Connect Gmail first.` },
        { status: 401 }
      );
    }

    let { access_token, refresh_token, expires_at } = tokenRows[0];

    // 2. Refresh if expired
    if (new Date(expires_at) < new Date()) {
      const refreshed = await refreshAccessToken(refresh_token);
      if (!refreshed) {
        return NextResponse.json(
          { ok: false, error: "Token expired and refresh failed. Reconnect Gmail." },
          { status: 401 }
        );
      }
      access_token = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await sql`
        update gmail_tokens
        set access_token = ${access_token},
            expires_at = ${newExpiresAt},
            updated_at = now()
        where user_email = ${fromEmail}
      `;
    }

    // 3. Build MIME message and encode as base64url
    const mimeMessage = buildMimeMessage({ to, from: fromEmail, subject, body: emailBody });
    const encodedMessage = btoa(mimeMessage)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // 4. Send via Gmail API
    const sendResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    const sendResult = await sendResponse.json();

    if (!sendResponse.ok) {
      console.error("Gmail send error:", sendResult);
      return NextResponse.json(
        { ok: false, error: sendResult.error?.message || "Gmail API error" },
        { status: 500 }
      );
    }

    // 5. Update DB if messageId provided
    if (messageId) {
      await sql.begin(async (tx) => {
        const updated = await tx`
          update messages
          set
            status = 'sent',
            sent_at = now(),
            gmail_message_id = ${sendResult.id},
            future_note = coalesce(future_note, '') || ' Enviado vía Gmail API.',
            updated_at = now()
          where id = ${messageId}
            and status = 'approved'
          returning campaign_id, company_id, contact_id
        `;

        if (updated[0]) {
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
    }

    return NextResponse.json({
      ok: true,
      gmailMessageId: sendResult.id,
      threadId: sendResult.threadId,
    });
  } catch (err) {
    console.error("Gmail send error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GMAIL_CLIENT_ID || "",
        client_secret: GMAIL_CLIENT_SECRET || "",
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

function buildMimeMessage({
  to,
  from,
  subject,
  body,
}: {
  to: string;
  from: string;
  subject: string;
  body: string;
}) {
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ];
  return lines.join("\r\n");
}
