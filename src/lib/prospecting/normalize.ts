const COMPANY_SUFFIXES = [
  "s a",
  "sa",
  "s p a",
  "spa",
  "ltda",
  "limitada",
  "inc",
  "corp",
  "corporation",
  "company",
  "co",
];

export function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

export function normalizeCompanyName(name: string) {
  const ascii = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  const wordsOnly = ascii
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return COMPANY_SUFFIXES.reduce((current, suffix) => {
    const suffixPattern = new RegExp(`\\s+${suffix.replace(/\s+/g, "\\s+")}$`);
    return current.replace(suffixPattern, "").trim();
  }, wordsOnly);
}

export function normalizeDomain(domain: string | null | undefined) {
  if (!domain) return null;

  const cleaned = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^mailto:/, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/:\d+$/, "");

  return cleaned || null;
}

export function extractDomain(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  const emailDomain = trimmed.includes("@") ? trimmed.split("@").at(-1) : null;

  return normalizeDomain(emailDomain ?? trimmed);
}
