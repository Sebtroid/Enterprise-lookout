import Papa from "papaparse";

import { PASTORAL_CONTACT_SHEET_CSV_URL } from "./config";

export type PastoralSheetContact = {
  comments: string;
  contactedBy: string;
  email: string;
  name: string;
  status: string;
};

export type PastoralDuplicate =
  | {
      contact: PastoralSheetContact;
      reason: "domain" | "email" | "name";
    }
  | null;

export function parsePastoralContactsCsv(csv: string): PastoralSheetContact[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data
    .map((row) => {
      const name = readCell(row, "-", "", "Nombre", "Empresa");
      const email = readCell(row, "Mail de contacto", "Email", "Correo");

      return {
        name,
        email,
        contactedBy: readCell(row, "Contactado por", "Responsable"),
        status: readCell(row, "Estado"),
        comments: readCell(row, "Comentarios", "Comentario"),
      };
    })
    .filter((row) => row.name || row.email);
}

export async function fetchPastoralSheetContacts({
  fetcher = fetch,
}: {
  fetcher?: typeof fetch;
} = {}) {
  const response = await fetcher(PASTORAL_CONTACT_SHEET_CSV_URL, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`No pude leer el Sheets de Pastoral (${response.status}).`);
  }
  return parsePastoralContactsCsv(await response.text());
}

export function findPastoralDuplicate({
  companyName,
  email,
  sheetContacts,
}: {
  companyName: string | null | undefined;
  email: string | null | undefined;
  sheetContacts: PastoralSheetContact[];
}): PastoralDuplicate {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const match = sheetContacts.find(
      (contact) => normalizeEmail(contact.email) === normalizedEmail,
    );
    if (match) return { contact: match, reason: "email" };
  }

  const domain = getEmailDomain(email);
  if (domain && !COMMON_EMAIL_DOMAINS.has(domain)) {
    const match = sheetContacts.find(
      (contact) => getEmailDomain(contact.email) === domain,
    );
    if (match) return { contact: match, reason: "domain" };

    const domainTokens = getDomainIdentityTokens(domain);
    const relatedDomainMatch = sheetContacts.find((contact) => {
      const contactDomain = getEmailDomain(contact.email);
      if (!contactDomain || COMMON_EMAIL_DOMAINS.has(contactDomain)) return false;
      return hasIdentityOverlap(
        domainTokens,
        getDomainIdentityTokens(contactDomain),
      );
    });
    if (relatedDomainMatch) {
      return { contact: relatedDomainMatch, reason: "domain" };
    }
  }

  const normalizedName = normalizeName(companyName);
  if (normalizedName) {
    const match = sheetContacts.find(
      (contact) => normalizeName(contact.name) === normalizedName,
    );
    if (match) return { contact: match, reason: "name" };

    const nameTokens = getOrganizationIdentityTokens(companyName);
    const relatedNameMatch = sheetContacts.find((contact) =>
      hasIdentityOverlap(nameTokens, getOrganizationIdentityTokens(contact.name)),
    );
    if (relatedNameMatch) return { contact: relatedNameMatch, reason: "name" };

    const relatedDomainMatch = sheetContacts.find((contact) => {
      const contactDomain = getEmailDomain(contact.email);
      if (!contactDomain || COMMON_EMAIL_DOMAINS.has(contactDomain)) return false;
      return hasIdentityOverlap(nameTokens, getDomainIdentityTokens(contactDomain));
    });
    if (relatedDomainMatch) {
      return { contact: relatedDomainMatch, reason: "name" };
    }
  }

  return null;
}

export function buildPastoralSheetRow({
  comments,
  contactedBy,
  email,
  name,
  status,
}: PastoralSheetContact) {
  return [name, email, contactedBy, status, comments, ""];
}

function readCell(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeName(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

  return normalized
    .replace(
      /\b(sociedad anonima|s p a|spa|s a|sa|ltda|limitada|empresa|empresas|grupo|holding|corporacion|corporation|corp|corporativo|corporativa|compania|cia|chile)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function getEmailDomain(value: string | null | undefined) {
  const email = normalizeEmail(value);
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return "";
  return email.slice(atIndex + 1);
}

function getDomainIdentityTokens(domain: string) {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  const labels = host.split(".").filter(Boolean);
  const registrableLabel =
    labels.length >= 2 ? labels[labels.length - 2] : labels[0] ?? "";
  return getOrganizationIdentityTokens(registrableLabel.replace(/[-_]/g, " "));
}

function getOrganizationIdentityTokens(value: string | null | undefined) {
  const tokens = normalizeName(value)
    .split(" ")
    .map(normalizeIdentityToken)
    .filter(isUsefulIdentityToken);

  return new Set(tokens);
}

function normalizeIdentityToken(value: string) {
  let token = value.replace(/[^a-z0-9]/g, "");

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of GENERIC_IDENTITY_PREFIXES) {
      if (token.startsWith(prefix) && token.length > prefix.length + 2) {
        token = token.slice(prefix.length);
        changed = true;
      }
    }
    for (const suffix of GENERIC_IDENTITY_SUFFIXES) {
      if (token.endsWith(suffix) && token.length > suffix.length + 2) {
        token = token.slice(0, -suffix.length);
        changed = true;
      }
    }
  }

  return token;
}

function isUsefulIdentityToken(token: string) {
  if (!token || GENERIC_IDENTITY_TERMS.has(token)) return false;
  return token.length >= 4 || STRONG_SHORT_BRAND_TOKENS.has(token);
}

function hasIdentityOverlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return false;
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

const GENERIC_IDENTITY_PREFIXES = [
  "empresas",
  "empresa",
  "grupo",
  "holding",
];

const GENERIC_IDENTITY_SUFFIXES = [
  "chile",
  "corp",
  "corporativo",
  "corporativa",
  "corporacion",
  "corporation",
];

const GENERIC_IDENTITY_TERMS = new Set([
  "a",
  "agri",
  "agricola",
  "agricolas",
  "agro",
  "agroindustrial",
  "agroindustria",
  "and",
  "anonima",
  "biobio",
  "bio",
  "banco",
  "cl",
  "centro",
  "chillan",
  "cia",
  "comercial",
  "compania",
  "company",
  "contacto",
  "corp",
  "corporacion",
  "corporation",
  "corporativa",
  "corporativo",
  "correo",
  "de",
  "del",
  "donaciones",
  "el",
  "empresa",
  "empresas",
  "equipo",
  "export",
  "exportacion",
  "exportaciones",
  "exportadora",
  "exportadores",
  "forestal",
  "fruta",
  "frutas",
  "fruit",
  "fruticola",
  "ganadera",
  "grupo",
  "holding",
  "info",
  "industrial",
  "industria",
  "industrias",
  "insumos",
  "itata",
  "la",
  "las",
  "limitada",
  "los",
  "ltda",
  "mail",
  "nativa",
  "nativo",
  "norte",
  "nuble",
  "p",
  "productos",
  "s",
  "sa",
  "san",
  "santa",
  "sociedad",
  "sur",
  "spa",
  "the",
  "ventas",
  "viejo",
  "y",
]);

const STRONG_SHORT_BRAND_TOKENS = new Set([
  "3m",
  "bci",
  "dhl",
  "ibm",
  "sap",
  "wom",
]);

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
  "yahoo.es",
  "yahoo.com",
]);
