import { extractDomain, normalizeDomain, normalizeEmail } from "./normalize";

export type ContactVerificationStatus =
  | "unverified"
  | "verified"
  | "bounced"
  | "invalid"
  | string
  | null
  | undefined;

export type ContactQualityInput = {
  confidence: number | null | undefined;
  email: string | null | undefined;
  fullName: string | null | undefined;
  isDecisionMaker: boolean | null | undefined;
  role: string | null | undefined;
  source: string | null | undefined;
  verificationStatus: ContactVerificationStatus;
};

export type ContactQualityBlocker =
  | "bounced_or_invalid"
  | "generic_inbox"
  | "missing_email"
  | "missing_named_contact"
  | "unverified_email";

export type ContactQualityAssessment = {
  blockers: ContactQualityBlocker[];
  directHumanContact: boolean;
  genericInbox: boolean;
  score: number;
  sendReady: boolean;
  summary: string;
  warnings: string[];
};

export type EmailCandidate = {
  email: string;
  pattern: string;
  confidence: number;
};

export function evaluateContactQuality(
  input: ContactQualityInput,
): ContactQualityAssessment {
  const email = normalizeEmail(input.email);
  const verificationStatus = normalizeVerificationStatus(input.verificationStatus);
  const genericInbox = isGenericInboxEmail(email);
  const namedContact = isNamedHumanContact(input.fullName);
  const relevantRole = isRelevantOutreachRole(input.role);
  const hasSource = Boolean(input.source?.trim());
  const confidence = clamp(input.confidence ?? 0, 0, 1);
  const directHumanContact = Boolean(email && namedContact && !genericInbox);
  const blockers: ContactQualityBlocker[] = [];
  const warnings: string[] = [];

  if (!email) blockers.push("missing_email");
  if (verificationStatus === "bounced" || verificationStatus === "invalid") {
    blockers.push("bounced_or_invalid");
  }
  if (genericInbox) blockers.push("generic_inbox");
  if (!namedContact) blockers.push("missing_named_contact");
  if (verificationStatus !== "verified") blockers.push("unverified_email");
  if (!relevantRole) warnings.push("cargo_no_prioritario");
  if (!hasSource) warnings.push("sin_fuente");

  let score = 0;
  if (email) score += 15;
  if (!genericInbox) score += 20;
  if (namedContact) score += 15;
  if (relevantRole) score += 20;
  if (input.isDecisionMaker) score += 15;
  if (hasSource) score += 10;
  if (verificationStatus === "verified") score += 25;
  if (verificationStatus === "bounced" || verificationStatus === "invalid") {
    score -= 100;
  }
  score += Math.round(confidence * 10);
  score = clamp(Math.round(score), 0, 100);

  const sendReady = blockers.length === 0 && score >= 75;

  return {
    blockers,
    directHumanContact,
    genericInbox,
    score,
    sendReady,
    summary: summarizeContactQuality({ blockers, score, sendReady, warnings }),
    warnings,
  };
}

export function getPastoralInitialContactSendReadiness(
  input: ContactQualityInput,
):
  | { ok: true; assessment: ContactQualityAssessment; message: string }
  | { ok: false; assessment: ContactQualityAssessment; message: string } {
  const assessment = evaluateContactQuality(input);
  if (assessment.sendReady) {
    return {
      ok: true,
      assessment,
      message: "Contacto directo verificado.",
    };
  }

  return {
    ok: false,
    assessment,
    message: assessment.summary,
  };
}

export function isGenericInboxEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return false;
  const localPart = normalized.split("@")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
  return GENERIC_LOCAL_PARTS.has(localPart);
}

export function inferEmailCandidates({
  domain,
  fullName,
}: {
  domain: string | null | undefined;
  fullName: string | null | undefined;
}): EmailCandidate[] {
  const normalizedDomain = normalizeDomain(domain);
  const nameParts = normalizePersonNameParts(fullName);
  if (
    !normalizedDomain ||
    COMMON_EMAIL_DOMAINS.has(normalizedDomain) ||
    nameParts.length < 2
  ) {
    return [];
  }

  const first = nameParts[0];
  const second = nameParts[1];
  const last = nameParts[nameParts.length - 1];
  const firstCompound = first && second ? `${first}${second}` : first;
  const initial = first?.[0] ?? "";
  const patterns = [
    { confidence: 0.72, local: `${first}.${last}`, pattern: "first.last" },
    {
      confidence: 0.68,
      local: `${firstCompound}.${last}`,
      pattern: "firstcompound.last",
    },
    { confidence: 0.62, local: `${initial}${last}`, pattern: "flast" },
    { confidence: 0.58, local: `${first}${last}`, pattern: "firstlast" },
    { confidence: 0.46, local: `${first}.${second}`, pattern: "first.second" },
    { confidence: 0.35, local: first, pattern: "first" },
  ];

  const seen = new Set<string>();
  return patterns
    .map((candidate) => ({
      confidence: candidate.confidence,
      email: `${candidate.local}@${normalizedDomain}`,
      pattern: candidate.pattern,
    }))
    .filter((candidate) => {
      if (seen.has(candidate.email)) return false;
      seen.add(candidate.email);
      return true;
    });
}

export function inferCandidatesFromKnownCompanyEmail({
  companyEmail,
  fullName,
}: {
  companyEmail: string | null | undefined;
  fullName: string | null | undefined;
}) {
  return inferEmailCandidates({
    domain: extractDomain(companyEmail),
    fullName,
  });
}

function summarizeContactQuality({
  blockers,
  score,
  sendReady,
  warnings,
}: {
  blockers: ContactQualityBlocker[];
  score: number;
  sendReady: boolean;
  warnings: string[];
}) {
  if (sendReady) return `Contacto listo para enviar (${score}/100).`;

  const labels = blockers.map((blocker) => BLOCKER_LABELS[blocker]);
  if (warnings.length) {
    labels.push(...warnings.map((warning) => WARNING_LABELS[warning] ?? warning));
  }
  return `No enviar todavía (${score}/100): ${labels.join("; ")}.`;
}

function normalizeVerificationStatus(value: ContactVerificationStatus) {
  return String(value ?? "unverified")
    .trim()
    .toLowerCase();
}

function isNamedHumanContact(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  return !tokens.some((token) => GENERIC_NAME_TOKENS.has(token));
}

function isRelevantOutreachRole(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return RELEVANT_ROLE_TERMS.some((term) => normalized.includes(term));
}

function normalizePersonNameParts(value: string | null | undefined) {
  return normalizeText(value)
    .split(" ")
    .filter((part) => part && !PERSON_NAME_STOP_WORDS.has(part));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const BLOCKER_LABELS: Record<ContactQualityBlocker, string> = {
  bounced_or_invalid: "email rebotado o invalido",
  generic_inbox: "mail generico",
  missing_email: "falta email",
  missing_named_contact: "falta nombre de persona",
  unverified_email: "email no verificado",
};

const WARNING_LABELS: Record<string, string> = {
  cargo_no_prioritario: "cargo no prioritario para donaciones",
  sin_fuente: "falta fuente/evidencia",
};

const COMMON_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.cl",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "outlook.cl",
  "outlook.com",
  "uc.cl",
  "yahoo.com",
  "yahoo.es",
]);

const GENERIC_LOCAL_PARTS = new Set([
  "administracion",
  "alianzas",
  "comercial",
  "comunicaciones",
  "contact",
  "contacto",
  "contactos",
  "csr",
  "donaciones",
  "equipo",
  "fundacion",
  "hello",
  "hola",
  "info",
  "informaciones",
  "marketing",
  "office",
  "prensa",
  "rse",
  "rrhh",
  "servicioalcliente",
  "soporte",
  "sustentabilidad",
  "ventas",
]);

const GENERIC_NAME_TOKENS = new Set([
  "area",
  "comercial",
  "comunicaciones",
  "contacto",
  "equipo",
  "fundacion",
  "general",
  "marketing",
  "prensa",
  "rse",
  "ventas",
]);

const PERSON_NAME_STOP_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
]);

const RELEVANT_ROLE_TERMS = [
  "asuntos corporativos",
  "brand",
  "comunicaciones",
  "comunicacion",
  "csr",
  "director",
  "directora",
  "donaciones",
  "esg",
  "fundacion",
  "gerente",
  "head",
  "jefe",
  "jefa",
  "manager",
  "marketing",
  "partnership",
  "relaciones institucionales",
  "responsabilidad social",
  "rse",
  "sostenibilidad",
  "sustentabilidad",
];
