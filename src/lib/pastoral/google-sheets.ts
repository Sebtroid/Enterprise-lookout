import { createSign } from "node:crypto";

import {
  PASTORAL_CONTACT_SHEET_ID,
  PASTORAL_CONTACT_SHEET_RANGE,
} from "@/lib/pastoral/config";
import {
  type PastoralSheetContact,
  buildPastoralSheetRow,
  parsePastoralContactsCsv,
} from "@/lib/pastoral/sheet";

type EnvLike = Record<string, string | undefined>;

export type PastoralSheetsConfig = {
  clientEmail: string;
  privateKey: string;
  range: string;
  spreadsheetId: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

export function getPastoralSheetsConfig(env: EnvLike = process.env) {
  return {
    clientEmail: env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() ?? "",
    privateKey: normalizePrivateKey(env.GOOGLE_SHEETS_PRIVATE_KEY ?? ""),
    range: (env.PASTORAL_CONTACT_SHEET_RANGE ?? PASTORAL_CONTACT_SHEET_RANGE).trim(),
    spreadsheetId: (env.PASTORAL_CONTACT_SHEET_ID ?? PASTORAL_CONTACT_SHEET_ID).trim(),
  } satisfies PastoralSheetsConfig;
}

export function isPastoralSheetsConfigured(
  config = getPastoralSheetsConfig(),
) {
  return Boolean(config.clientEmail && config.privateKey && config.spreadsheetId && config.range);
}

export async function getPastoralSheetsAccessToken({
  config = getPastoralSheetsConfig(),
  fetcher = fetch,
}: {
  config?: PastoralSheetsConfig;
  fetcher?: typeof fetch;
} = {}) {
  if (!isPastoralSheetsConfigured(config)) {
    throw new Error(
      "Faltan credenciales de Google Sheets: GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, PASTORAL_CONTACT_SHEET_ID y PASTORAL_CONTACT_SHEET_RANGE.",
    );
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const jwt = signServiceAccountJwt(config);
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion: jwt,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "No pude autenticar Google Sheets.");
  }

  tokenCache = {
    accessToken: String(data.access_token),
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.accessToken;
}

export async function fetchPastoralSheetContactsFromApi({
  accessToken,
  config = getPastoralSheetsConfig(),
  fetcher = fetch,
}: {
  accessToken: string;
  config?: PastoralSheetsConfig;
  fetcher?: typeof fetch;
}) {
  const response = await fetcher(buildValuesUrl(config), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? `No pude leer Sheets (${response.status}).`);
  }
  return parsePastoralSheetValues(Array.isArray(data.values) ? data.values : []);
}

export async function appendPastoralSheetContact({
  accessToken,
  config = getPastoralSheetsConfig(),
  fetcher = fetch,
  row,
}: {
  accessToken: string;
  config?: PastoralSheetsConfig;
  fetcher?: typeof fetch;
  row: ReturnType<typeof buildPastoralSheetRow>;
}) {
  const response = await fetcher(`${buildValuesUrl(config)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false as const,
      error: data.error?.message ?? `No pude registrar el contacto en Sheets (${response.status}).`,
    };
  }
  return { ok: true as const };
}

export function parsePastoralSheetValues(values: unknown[][]) {
  if (!values.length) return [];
  const [headers, ...rows] = values;
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
  return parsePastoralContactsCsv(csv);
}

export function verifyPastoralSheetContact({
  contacts,
  email,
  name,
}: {
  contacts: PastoralSheetContact[];
  email: string;
  name: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = normalizeSheetName(name);
  return contacts.some(
    (contact) =>
      contact.email.trim().toLowerCase() === normalizedEmail ||
      normalizeSheetName(contact.name) === normalizedName,
  );
}

export function buildPastoralSheetContactRow(input: PastoralSheetContact) {
  return buildPastoralSheetRow(input);
}

function buildValuesUrl(config: PastoralSheetsConfig) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(config.range)}`;
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trimEnd();
}

function signServiceAccountJwt(config: PastoralSheetsConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(config.privateKey))}`;
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function normalizeSheetName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
