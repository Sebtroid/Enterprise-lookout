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
  range: string;
  spreadsheetId: string;
};

export function getPastoralSheetsConfig(env: EnvLike = process.env) {
  return {
    range: (env.PASTORAL_CONTACT_SHEET_RANGE ?? PASTORAL_CONTACT_SHEET_RANGE).trim(),
    spreadsheetId: (env.PASTORAL_CONTACT_SHEET_ID ?? PASTORAL_CONTACT_SHEET_ID).trim(),
  } satisfies PastoralSheetsConfig;
}

export function isPastoralSheetsConfigured(
  config = getPastoralSheetsConfig(),
) {
  return Boolean(config.spreadsheetId && config.range);
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
  if (!accessToken) {
    throw new Error(
      "Falta token OAuth de Google. Reconecta Google para autorizar lectura y escritura de Sheets.",
    );
  }

  const response = await fetcher(buildValuesUrl(config), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await readGoogleJson(response);
  if (!response.ok) {
    throw new Error(formatGoogleSheetsError(data, response.status, "leer"));
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
  if (!accessToken) {
    return {
      ok: false as const,
      error:
        "Falta token OAuth de Google. Reconecta Google para autorizar lectura y escritura de Sheets.",
    };
  }

  const response = await fetcher(`${buildValuesUrl(config)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  const data = await readGoogleJson(response);
  if (!response.ok) {
    return {
      ok: false as const,
      error: formatGoogleSheetsError(data, response.status, "registrar el contacto en"),
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

function normalizeSheetName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

async function readGoogleJson(response: Response) {
  return response.json().catch(() => ({}));
}

function formatGoogleSheetsError(
  data: Record<string, unknown>,
  status: number,
  action: string,
) {
  const message = readGoogleErrorMessage(data);
  if (status === 401 || status === 403 || /insufficient|permission|scope/i.test(message)) {
    return `${message || `No pude ${action} Sheets (${status}).`} Reconecta Google desde la app para autorizar el permiso de Sheets con tu misma cuenta.`;
  }
  return message || `No pude ${action} Sheets (${status}).`;
}

function readGoogleErrorMessage(data: Record<string, unknown>) {
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}
