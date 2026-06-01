type MimeMessageInput = {
  attachments?: MimeAttachmentInput[];
  body: string;
  from: string;
  inReplyTo?: string | null;
  references?: string | null;
  subject: string;
  to: string;
};

export type MimeAttachmentInput = {
  content: Buffer | Uint8Array | string;
  contentType: string;
  filename: string;
};

export function buildMimeMessage({
  attachments = [],
  body,
  from,
  inReplyTo,
  references,
  subject,
  to,
}: MimeMessageInput) {
  const headers = [
    `To: ${sanitizeHeader(to)}`,
    `From: ${sanitizeHeader(from)}`,
    `Subject: ${encodeSubject(subject)}`,
    ...(inReplyTo ? [`In-Reply-To: ${sanitizeHeader(inReplyTo)}`] : []),
    ...(references ? [`References: ${sanitizeHeader(references)}`] : []),
    "MIME-Version: 1.0",
  ];

  if (!attachments.length) {
    return [
      ...headers,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
    ].join("\r\n");
  }

  const boundary = `----=_EnterpriseLookout_${crypto.randomUUID()}`;
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    ...attachments.flatMap((attachment) => [
      `--${boundary}`,
      `Content-Type: ${sanitizeHeader(attachment.contentType)}; name="${encodeHeaderParameter(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodeHeaderParameter(attachment.filename)}"`,
      "",
      wrapBase64(attachment.content),
    ]),
    `--${boundary}--`,
  ];

  return lines.join("\r\n");
}

export function buildGmailSendBody({
  raw,
  threadId,
}: {
  raw: string;
  threadId?: string | null;
}) {
  return threadId ? { raw, threadId } : { raw };
}

export function encodeRawMessage(mimeMessage: string) {
  return Buffer.from(mimeMessage, "utf8").toString("base64url");
}

function sanitizeHeader(value: string) {
  return value.split(/[\r\n]/)[0]?.trim() ?? "";
}

function encodeSubject(subject: string) {
  const sanitized = sanitizeHeader(subject);
  if (/^[\x00-\x7F]*$/.test(sanitized)) {
    return sanitized;
  }

  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function encodeHeaderParameter(value: string) {
  return sanitizeHeader(value).replace(/["\\]/g, "_");
}

function wrapBase64(value: Buffer | Uint8Array | string) {
  const buffer = Buffer.isBuffer(value)
    ? value
    : typeof value === "string"
      ? Buffer.from(value, "utf8")
      : Buffer.from(value);
  return buffer.toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}
