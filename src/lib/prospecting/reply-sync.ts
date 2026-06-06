import type { AppReply } from "./demo-data";
import {
  getContextSlugFromScope,
  isContextScope,
  slugifyContextName,
} from "./context";

export type GmailReplyCandidate = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
};

export type SentMessageMatchInput = {
  id: string;
  campaignId: string;
  companyId: string;
  contactId: string;
  contactEmail: string;
  contactName: string;
  companyDomain?: string;
  companyName?: string;
  senderId: string;
  senderEmail: string;
  subject: string;
  sentAt: string;
  gmailThreadId: string | null;
};

export type ReplyMatchReason =
  | "gmail_thread_id"
  | "bounce_recipient"
  | "bounce_subject"
  | "contact_email_subject"
  | "contact_email_recent"
  | "contact_domain_subject"
  | "contact_domain_recent"
  | "known_contact_email"
  | "known_contact_domain";

export type ReplyMatch = {
  message: SentMessageMatchInput;
  reason: ReplyMatchReason;
  confidence: number;
};

export type ReplySyncCampaignScopeInput = {
  organization: string;
  slug: string;
};

export type ReplySyncScope =
  | { kind: "all" }
  | { kind: "campaign"; slug: string }
  | { kind: "organizations"; organizations: string[] };

export const REPLY_SYNC_OUTBOUND_STATUSES = ["sent", "approved"] as const;

export type ReplyContactMatchInput = {
  campaignId: string;
  companyId: string;
  contactId: string;
  contactEmail: string;
  contactName: string;
  companyDomain?: string;
  companyName?: string;
  senderId: string;
  senderEmail: string;
};

export type GmailThreadReplyReviewState = {
  hasLaterSenderReply: boolean;
  latestSenderReplyAt: string | null;
  hasNewerInboundReply: boolean;
  latestInboundMessageId: string | null;
  latestInboundReplyAt: string | null;
};

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.cl",
  "outlook.com",
  "outlook.cl",
  "live.com",
  "live.cl",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "me.com",
  "msn.com",
]);

export type PreparedInboundReply = {
  campaignId: string;
  companyId: string;
  contactId: string;
  senderId: string;
  originalMessageId: string;
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string;
  kind: "inbound_reply";
  status: "needs_review";
  classification: AppReply["classification"];
  body: string;
  draftResponse: string;
  receivedAt: string;
  futureNote: string;
};

export function normalizeEmailSubject(subject: string) {
  return subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveReplySyncScope(
  scope: string,
  campaigns: ReplySyncCampaignScopeInput[] = [],
): ReplySyncScope {
  if (scope === "all") return { kind: "all" };

  if (!isContextScope(scope)) {
    return { kind: "campaign", slug: scope };
  }

  const contextSlug = getContextSlugFromScope(scope);
  const organizations = campaigns
    .filter(
      (campaign) => slugifyContextName(campaign.organization) === contextSlug,
    )
    .map((campaign) => campaign.organization)
    .filter(Boolean);

  return {
    kind: "organizations",
    organizations: Array.from(new Set(organizations)),
  };
}

export function shouldSyncOutboundForReplies({
  connectedEmail,
  contactEmail,
  senderEmail,
  status,
}: {
  connectedEmail: string;
  contactEmail: string | null;
  senderEmail: string;
  status: string;
}) {
  return (
    REPLY_SYNC_OUTBOUND_STATUSES.includes(
      status as (typeof REPLY_SYNC_OUTBOUND_STATUSES)[number],
    ) &&
    Boolean(contactEmail) &&
    normalizeEmail(senderEmail) === normalizeEmail(connectedEmail)
  );
}

export function matchInboundReply(
  candidate: GmailReplyCandidate,
  sentMessages: SentMessageMatchInput[],
): ReplyMatch | null {
  const receivedAt = new Date(candidate.receivedAt);
  const eligible = sentMessages
    .filter((message) => isBeforeOrSame(message.sentAt, candidate.receivedAt))
    .sort((a, b) => newestFirst(a.sentAt, b.sentAt));
  const subject = normalizeEmailSubject(candidate.subject);

  if (isBounceReply(candidate)) {
    const bounceRecipientMatch = eligible.find((message) =>
      normalizeSearch(candidate.body).includes(normalizeSearch(message.contactEmail)),
    );

    if (bounceRecipientMatch) {
      return {
        message: bounceRecipientMatch,
        reason: "bounce_recipient",
        confidence: 0.95,
      };
    }

    const bounceSubjectMatch = eligible.find((message) =>
      subjectsMatch(subject, normalizeEmailSubject(message.subject)),
    );

    if (bounceSubjectMatch) {
      return {
        message: bounceSubjectMatch,
        reason: "bounce_subject",
        confidence: 0.72,
      };
    }
  }

  const threadMatch = eligible.find(
    (message) =>
      Boolean(candidate.gmailThreadId) &&
      message.gmailThreadId === candidate.gmailThreadId,
  );

  if (threadMatch) {
    return { message: threadMatch, reason: "gmail_thread_id", confidence: 1 };
  }

  const fromEmail = normalizeEmail(candidate.fromEmail);

  const emailSubjectMatch = eligible.find(
    (message) =>
      normalizeEmail(message.contactEmail) === fromEmail &&
      subjectsMatch(subject, normalizeEmailSubject(message.subject)),
  );

  if (emailSubjectMatch) {
    return {
      message: emailSubjectMatch,
      reason: "contact_email_subject",
      confidence: 0.9,
    };
  }

  const contactEmailMatch = eligible.find(
    (message) => normalizeEmail(message.contactEmail) === fromEmail,
  );

  if (contactEmailMatch) {
    return {
      message: contactEmailMatch,
      reason: "contact_email_recent",
      confidence: isRecentEnough(contactEmailMatch.sentAt, receivedAt) ? 0.78 : 0.62,
    };
  }

  const candidateDomain = getEmailDomain(fromEmail);
  const domainSubjectMatch = eligible.find(
    (message) =>
      domainMatchesCandidate(message, candidateDomain) &&
      subjectsMatch(subject, normalizeEmailSubject(message.subject)),
  );

  if (domainSubjectMatch) {
    return {
      message: domainSubjectMatch,
      reason: "contact_domain_subject",
      confidence: 0.66,
    };
  }

  const domainRecentMatch = pickSingleCompanyDomainMatch(
    eligible.filter(
      (message) =>
        domainMatchesCandidate(message, candidateDomain) &&
        isRecentEnough(message.sentAt, receivedAt),
    ),
  );

  if (domainRecentMatch) {
    return {
      message: domainRecentMatch,
      reason: "contact_domain_recent",
      confidence: 0.7,
    };
  }

  return null;
}

export function matchInboundReplyToKnownContact(
  candidate: GmailReplyCandidate,
  contacts: ReplyContactMatchInput[],
): ReplyMatch | null {
  if (isBounceReply(candidate)) return null;

  const fromEmail = normalizeEmail(candidate.fromEmail);
  const contact = contacts.find(
    (item) => normalizeEmail(item.contactEmail) === fromEmail,
  );

  if (contact) {
    return {
      message: {
        ...contact,
        id: `gmail-contact:${candidate.gmailMessageId}`,
        subject: candidate.subject,
        sentAt: candidate.receivedAt,
        gmailThreadId: candidate.gmailThreadId,
      },
      reason: "known_contact_email",
      confidence: 0.82,
    };
  }

  const candidateDomain = getEmailDomain(fromEmail);
  const domainContact = pickSingleCompanyDomainMatch(
    contacts.filter((item) => domainMatchesCandidate(item, candidateDomain)),
  );

  if (!domainContact) return null;

  return {
    message: {
      ...domainContact,
      id: `gmail-contact:${candidate.gmailMessageId}`,
      subject: candidate.subject,
      sentAt: candidate.receivedAt,
      gmailThreadId: candidate.gmailThreadId,
    },
    reason: "known_contact_domain",
    confidence: 0.72,
  };
}

export function classifyInboundReply(body: string): AppReply["classification"] {
  const normalized = normalizeSearch(body);

  if (
    includesAny(normalized, [
      "address not found",
      "delivery status notification",
      "delivery incomplete",
      "delivery has failed",
      "message not delivered",
      "recipient address rejected",
      "undelivered mail",
      "550 5.1.1",
      "5.1.1",
      "no existe",
      "usuario desconocido",
    ])
  ) {
    return "bounced";
  }

  if (
    includesAny(normalized, [
      "no corresponde",
      "no nos interesa",
      "no estamos interesados",
      "no podremos",
      "por ahora no",
      "no por ahora",
      "mas adelante",
      "más adelante",
      "el proximo ano",
      "el próximo año",
    ])
  ) {
    return "not_now";
  }

  if (
    includesAny(normalized, [
      "te copio",
      "copio a",
      "derivo",
      "derivar",
      "contacta a",
      "habla con",
      "la persona encargada",
    ])
  ) {
    return "referred";
  }

  if (
    includesAny(normalized, [
      "presentacion",
      "presentación",
      "monto",
      "propuesta",
      "mas informacion",
      "más información",
      "detalle",
      "revisar internamente",
    ])
  ) {
    return "needs_info";
  }

  if (
    includesAny(normalized, [
      "me interesa",
      "nos interesa",
      "conversemos",
      "agenda",
      "reunion",
      "reunión",
      "llamada",
    ])
  ) {
    return "interested";
  }

  return "needs_info";
}

export function buildInboundReplyDraft(candidate: GmailReplyCandidate) {
  const classification = isBounceReply(candidate)
    ? "bounced"
    : classifyInboundReply(candidate.body);

  if (classification === "bounced") {
    return [
      "No responder este rebote.",
      "",
      "Buscar o probar otro patrón de email en un mail nuevo, sin usar este hilo.",
    ].join("\n");
  }

  if (classification === "not_now") {
    return [
      "Hola,",
      "",
      "Muchas gracias por responder y por avisarnos. Lo dejamos registrado para no insistir con este tema.",
      "",
      "Saludos,",
      "Sebastian",
    ].join("\n");
  }

  if (classification === "referred") {
    return [
      "Hola,",
      "",
      "Muchas gracias por la orientación. Tomo el contacto y le escribo con el contexto breve para revisar si existe calce.",
      "",
      "Saludos,",
      "Sebastian",
    ].join("\n");
  }

  return [
    "Hola,",
    "",
    "Muchas gracias por responder. Te comparto una presentación breve, una propuesta y el contexto del proyecto para que lo puedan revisar internamente.",
    "",
    "Quedo atento a cualquier formato o información adicional que necesiten.",
    "",
    "Saludos,",
    "Sebastian",
  ].join("\n");
}

export function prepareInboundReplyRecord(
  candidate: GmailReplyCandidate,
  sentMessage: SentMessageMatchInput,
): PreparedInboundReply {
  const classification = isBounceReply(candidate)
    ? "bounced"
    : classifyInboundReply(candidate.body);

  return {
    campaignId: sentMessage.campaignId,
    companyId: sentMessage.companyId,
    contactId: sentMessage.contactId,
    senderId: sentMessage.senderId,
    originalMessageId: sentMessage.id,
    gmailMessageId: candidate.gmailMessageId,
    gmailThreadId: candidate.gmailThreadId,
    subject: candidate.subject,
    kind: "inbound_reply",
    status: "needs_review",
    classification,
    body: candidate.body,
    draftResponse: buildInboundReplyDraft(candidate),
    receivedAt: candidate.receivedAt,
    futureNote: [
      `Reply detectado automáticamente desde Gmail.`,
      `Clasificación: ${classification}.`,
      `Mensaje original: ${sentMessage.id}.`,
    ].join(" "),
  };
}

export function shouldIngestReply(
  candidate: GmailReplyCandidate,
  {
    existingGmailMessageIds,
    senderEmail,
  }: {
    existingGmailMessageIds: Set<string>;
    senderEmail: string;
  },
) {
  if (!candidate.gmailMessageId) return false;
  if (existingGmailMessageIds.has(candidate.gmailMessageId)) return false;
  if (normalizeEmail(candidate.fromEmail) === normalizeEmail(senderEmail)) {
    return false;
  }

  return true;
}

export function analyzeGmailThreadForReplyReview({
  candidate,
  senderEmail,
  threadMessages,
}: {
  candidate: GmailReplyCandidate;
  senderEmail: string;
  threadMessages: GmailReplyCandidate[];
}): GmailThreadReplyReviewState {
  const candidateTime = new Date(candidate.receivedAt).getTime();
  if (Number.isNaN(candidateTime)) {
    return {
      hasLaterSenderReply: false,
      latestSenderReplyAt: null,
      hasNewerInboundReply: false,
      latestInboundMessageId: null,
      latestInboundReplyAt: null,
    };
  }

  const normalizedSender = normalizeEmail(senderEmail);
  let latestSenderReply: GmailReplyCandidate | null = null;
  let latestInboundReply: GmailReplyCandidate | null = null;

  for (const message of threadMessages) {
    if (message.gmailMessageId === candidate.gmailMessageId) continue;

    const messageTime = new Date(message.receivedAt).getTime();
    if (Number.isNaN(messageTime) || messageTime <= candidateTime) continue;

    const fromSender = normalizeEmail(message.fromEmail) === normalizedSender;
    const toSender = normalizeEmail(message.toEmail) === normalizedSender;

    if (fromSender) {
      if (
        !latestSenderReply ||
        messageTime > new Date(latestSenderReply.receivedAt).getTime()
      ) {
        latestSenderReply = message;
      }
      continue;
    }

    if (
      toSender ||
      (candidate.gmailThreadId && message.gmailThreadId === candidate.gmailThreadId)
    ) {
      if (
        !latestInboundReply ||
        messageTime > new Date(latestInboundReply.receivedAt).getTime()
      ) {
        latestInboundReply = message;
      }
    }
  }

  return {
    hasLaterSenderReply: Boolean(latestSenderReply),
    latestSenderReplyAt: latestSenderReply?.receivedAt ?? null,
    hasNewerInboundReply: Boolean(latestInboundReply),
    latestInboundMessageId: latestInboundReply?.gmailMessageId ?? null,
    latestInboundReplyAt: latestInboundReply?.receivedAt ?? null,
  };
}

export function buildGmailReplySearchQuery(message: SentMessageMatchInput) {
  const sentAt = new Date(message.sentAt);
  const after = Number.isNaN(sentAt.getTime())
    ? null
    : sentAt.toISOString().slice(0, 10).replaceAll("-", "/");

  return [
    "in:anywhere",
    `to:${message.senderEmail}`,
    `-from:${message.senderEmail}`,
    after ? `after:${after}` : "newer_than:30d",
    `"${message.subject.replaceAll("\"", "")}"`,
  ]
    .filter(Boolean)
    .join(" ");
}

function subjectsMatch(replySubject: string, originalSubject: string) {
  if (!replySubject || !originalSubject) return false;
  return (
    replySubject === originalSubject ||
    replySubject.includes(originalSubject) ||
    originalSubject.includes(replySubject)
  );
}

function isBeforeOrSame(a: string, b: string) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return true;
  return left <= right;
}

function newestFirst(a: string, b: string) {
  return new Date(b).getTime() - new Date(a).getTime();
}

function isRecentEnough(sentAt: string, receivedAt: Date) {
  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime()) || Number.isNaN(receivedAt.getTime())) {
    return false;
  }

  return receivedAt.getTime() - sent.getTime() <= 45 * 86_400_000;
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(normalizeSearch(needle)));
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getEmailDomain(email: string) {
  return normalizeEmail(email).split("@")[1] ?? "";
}

function domainMatchesCandidate(
  item: Pick<ReplyContactMatchInput, "contactEmail" | "companyDomain">,
  candidateDomain: string,
) {
  if (!candidateDomain || GENERIC_EMAIL_DOMAINS.has(candidateDomain)) return false;

  const contactDomain = getEmailDomain(item.contactEmail);
  const companyDomain = normalizeDomain(item.companyDomain ?? "");

  return candidateDomain === contactDomain || candidateDomain === companyDomain;
}

function normalizeDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/^@/, "");
}

function pickSingleCompanyDomainMatch<
  T extends { companyId: string; sentAt?: string },
>(matches: T[]) {
  if (!matches.length) return null;

  const companyIds = new Set(matches.map((match) => match.companyId));
  if (companyIds.size > 1) return null;

  return [...matches].sort((a, b) => newestFirst(a.sentAt ?? "", b.sentAt ?? ""))[0] ?? null;
}

export function isBounceReply(candidate: GmailReplyCandidate) {
  const from = normalizeEmail(candidate.fromEmail);
  const subject = normalizeSearch(candidate.subject);
  const body = normalizeSearch(candidate.body);

  return (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    subject.includes("delivery status notification") ||
    subject.includes("undelivered") ||
    subject.includes("message not delivered") ||
    body.includes("address not found") ||
    body.includes("delivery incomplete") ||
    body.includes("delivery has failed") ||
    body.includes("recipient address rejected") ||
    body.includes("550 5.1.1") ||
    body.includes("usuario desconocido")
  );
}

export function shouldResolveReplySenderContact(candidate: GmailReplyCandidate) {
  return !isBounceReply(candidate);
}
