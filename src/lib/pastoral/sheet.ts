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
  }

  const normalizedName = normalizeName(companyName);
  if (normalizedName) {
    const match = sheetContacts.find(
      (contact) => normalizeName(contact.name) === normalizedName,
    );
    if (match) return { contact: match, reason: "name" };
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

export async function reservePastoralSheetContact({
  comments,
  contactedBy,
  email,
  name,
  status = "Contactado",
}: {
  comments: string;
  contactedBy: string;
  email: string;
  name: string;
  status?: string;
}) {
  const webhookUrl = process.env.PASTORAL_CONTACT_SHEET_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "Falta PASTORAL_CONTACT_SHEET_WEBHOOK_URL para registrar el contacto en Sheets antes de enviar.",
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      row: buildPastoralSheetRow({
        comments,
        contactedBy,
        email,
        name,
        status,
      }),
      secret: process.env.PASTORAL_CONTACT_SHEET_WEBHOOK_SECRET ?? null,
      source: "enterprise-lookout",
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `No pude registrar el contacto en Sheets (${response.status}).`,
    };
  }

  return { ok: true };
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
      /\b(sociedad anonima|s p a|spa|s a|sa|ltda|limitada|chile)\b/g,
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

const COMMON_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "outlook.com",
  "uc.cl",
  "yahoo.com",
]);
