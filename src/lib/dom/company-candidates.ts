import { z } from "zod";

import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
} from "@/lib/prospecting/normalize";

export const DOM_COMPANY_CANDIDATE_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "needs_more_research",
] as const;

export type DomCompanyCandidateStatus =
  (typeof DOM_COMPANY_CANDIDATE_STATUSES)[number];

export type NormalizedDomContactCandidate = {
  name: string;
  role: string | null;
  email: string | null;
  confidence: number;
  source: string | null;
};

export type NormalizedDomCompanyCandidate = {
  name: string;
  normalizedName: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  region: string | null;
  description: string | null;
  evidenceUrls: string[];
  suggestedContacts: NormalizedDomContactCandidate[];
  fitScore: number;
  fitReason: string | null;
  qualityRating: number;
  qualityReason: string | null;
};

const rawContactCandidateSchema = z
  .object({
    name: z.unknown().optional(),
    full_name: z.unknown().optional(),
    role: z.unknown().optional(),
    email: z.unknown().optional(),
    confidence: z.unknown().optional(),
    source: z.unknown().optional(),
  })
  .passthrough();

const rawCompanyCandidateSchema = z
  .object({
    name: z.unknown().optional(),
    canonical_name: z.unknown().optional(),
    domain: z.unknown().optional(),
    website: z.unknown().optional(),
    industry: z.unknown().optional(),
    region: z.unknown().optional(),
    description: z.unknown().optional(),
    evidence_urls: z.unknown().optional(),
    source_urls: z.unknown().optional(),
    suggested_contacts: z.unknown().optional(),
    contacts: z.unknown().optional(),
    fit_score: z.unknown().optional(),
    fit_reason: z.unknown().optional(),
    quality_rating: z.unknown().optional(),
    quality_reason: z.unknown().optional(),
  })
  .passthrough();

export function normalizeDomCompanyCandidates(payload: unknown) {
  const body = asRecord(payload);
  const rawCandidates = Array.isArray(body.company_candidates)
    ? body.company_candidates
    : Array.isArray(body.companies_added)
      ? body.companies_added
      : [];

  return rawCandidates
    .map((candidate) => normalizeDomCompanyCandidate(candidate))
    .filter((candidate): candidate is NormalizedDomCompanyCandidate =>
      Boolean(candidate),
    );
}

export function normalizeDomCompanyCandidate(
  value: unknown,
): NormalizedDomCompanyCandidate | null {
  const parsed = rawCompanyCandidateSchema.safeParse(value);
  if (!parsed.success) return null;

  const name = textValue(parsed.data.name) ?? textValue(parsed.data.canonical_name);
  if (!name) return null;

  const website = textValue(parsed.data.website);
  const domain =
    normalizeDomain(parsed.data.domain as string | null | undefined) ??
    normalizeDomain(website);
  const evidenceUrls = stringArrayValue(
    parsed.data.evidence_urls ?? parsed.data.source_urls,
  );
  const suggestedContacts = Array.isArray(parsed.data.suggested_contacts)
    ? parsed.data.suggested_contacts
    : Array.isArray(parsed.data.contacts)
      ? parsed.data.contacts
      : [];

  return {
    name,
    normalizedName: normalizeCompanyName(name),
    domain,
    website,
    industry: textValue(parsed.data.industry),
    region: textValue(parsed.data.region),
    description: textValue(parsed.data.description),
    evidenceUrls,
    suggestedContacts: suggestedContacts
      .map(normalizeContactCandidate)
      .filter((contact): contact is NormalizedDomContactCandidate =>
        Boolean(contact),
      ),
    fitScore: clampInteger(parsed.data.fit_score, 0, 100, 50),
    fitReason: textValue(parsed.data.fit_reason),
    qualityRating: clampInteger(parsed.data.quality_rating, 1, 5, 3),
    qualityReason: textValue(parsed.data.quality_reason),
  };
}

function normalizeContactCandidate(
  value: unknown,
): NormalizedDomContactCandidate | null {
  const parsed = rawContactCandidateSchema.safeParse(value);
  if (!parsed.success) return null;

  const name = textValue(parsed.data.name) ?? textValue(parsed.data.full_name);
  const email = normalizeEmail(textValue(parsed.data.email));
  if (!name && !email) return null;

  return {
    name: name ?? email ?? "Contacto sugerido",
    role: textValue(parsed.data.role),
    email,
    confidence: clampNumber(parsed.data.confidence, 0, 1, 0.5),
    source: textValue(parsed.data.source),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text || null;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map(textValue)
        .filter((item): item is string => Boolean(item)),
    ),
  ];
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
