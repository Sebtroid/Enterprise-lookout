import {
  CompanyCandidate,
  ContactPriorityInput,
  ContactProfile,
  DuplicateMatch,
} from "./types";
import {
  extractDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
} from "./normalize";

const HIGH_VALUE_ROLE_TERMS = [
  "sostenibilidad",
  "rse",
  "responsabilidad social",
  "asuntos corporativos",
  "comunicaciones",
  "marketing",
  "fundacion",
  "gerent",
  "director",
  "jef",
  "alianzas",
  "comunidad",
];

export function findDuplicateCompanies(
  candidate: CompanyCandidate,
  existing: CompanyCandidate[],
): DuplicateMatch[] {
  const candidateDomain = normalizeDomain(candidate.domain);
  const candidateName = normalizeCompanyName(candidate.name);

  return existing.flatMap((company): DuplicateMatch[] => {
    const companyId = company.id;
    if (!companyId) return [];

    const existingDomain = normalizeDomain(company.domain);
    if (
      candidateDomain &&
      existingDomain &&
      (candidateDomain === existingDomain ||
        candidateDomain.endsWith(`.${existingDomain}`) ||
        existingDomain.endsWith(`.${candidateDomain}`))
    ) {
      return [{ companyId, reason: "domain", confidence: 0.98 }];
    }

    if (candidateName && candidateName === normalizeCompanyName(company.name)) {
      return [{ companyId, reason: "name", confidence: 0.9 }];
    }

    return [];
  });
}

export function mergeContactProfiles(
  current: ContactProfile,
  incoming: ContactProfile,
): ContactProfile {
  const currentSources = new Set(current.sources);
  incoming.sources.forEach((source) => currentSources.add(source));

  const notes = [current.notes, incoming.notes]
    .filter((note): note is string => Boolean(note?.trim()))
    .join("\n");

  return {
    name: incoming.name || current.name,
    role: chooseRicherValue(current.role, incoming.role),
    email:
      normalizeEmail(current.email) === normalizeEmail(incoming.email)
        ? normalizeEmail(current.email)
        : normalizeEmail(incoming.email) ?? normalizeEmail(current.email),
    isDecisionMaker: current.isDecisionMaker || incoming.isDecisionMaker,
    notes: notes || null,
    sources: Array.from(currentSources),
  };
}

export function scoreContactPriority(contact: ContactPriorityInput) {
  const role = normalizeCompanyName(contact.role ?? "");
  const roleScore = HIGH_VALUE_ROLE_TERMS.reduce((score, term) => {
    return role.includes(normalizeCompanyName(term)) ? score + 12 : score;
  }, 0);

  return Math.round(
    contact.confidence * 40 + roleScore + (contact.isDecisionMaker ? 35 : 0),
  );
}

export function inferDomainFromContact(contact: Pick<ContactProfile, "email">) {
  return extractDomain(contact.email);
}

function chooseRicherValue(
  current: string | null,
  incoming: string | null,
): string | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming.length > current.length ? incoming : current;
}
