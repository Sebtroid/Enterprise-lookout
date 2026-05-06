type MimeMessageInput = {
  body: string;
  from: string;
  subject: string;
  to: string;
};

export function buildMimeMessage({ body, from, subject, to }: MimeMessageInput) {
  const lines = [
    `To: ${sanitizeHeader(to)}`,
    `From: ${sanitizeHeader(from)}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ];

  return lines.join("\r\n");
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
