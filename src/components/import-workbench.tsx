"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  applyImportAction,
  type ActionState,
} from "@/features/prospecting/actions";
import { findDuplicateCompanies } from "@/lib/prospecting/dedupe";
import { companies as allCompanies } from "@/lib/prospecting/demo-data";
import type { AppCampaign, AppCompany } from "@/lib/prospecting/demo-data";
import { extractDomain, normalizeCompanyName } from "@/lib/prospecting/normalize";

type ParsedRow = {
  companyName: string;
  contactName: string;
  role: string;
  email: string;
  isDecisionMaker: boolean;
  source: string;
};

const COMPANY_KEYS = ["empresa", "company", "organizacion", "organización"];
const CONTACT_KEYS = ["nombre", "contacto", "persona", "name"];
const ROLE_KEYS = ["cargo", "role", "puesto"];
const EMAIL_KEYS = ["email", "correo", "mail"];
const DECIDER_KEYS = ["decisor", "decision maker", "is_decision_maker"];
const initialActionState: ActionState = { ok: false, message: "" };

export function ImportWorkbench({
  campaigns,
  companies = allCompanies,
  scope,
}: {
  campaigns: AppCampaign[];
  companies?: AppCompany[];
  scope: string;
}) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    applyImportAction,
    initialActionState,
  );
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const duplicateCount = rows.filter(
    (row) => getDuplicateMatch(row).length > 0,
  ).length;

  useEffect(() => {
    if (actionState.ok) {
      router.refresh();
    }
  }, [actionState, router]);

  async function handleFile(file: File) {
    setFileName(file.name);

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
      setRows(json.map(mapRow).filter((row) => row.companyName || row.email));
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(
          result.data.map(mapRow).filter((row) => row.companyName || row.email),
        );
      },
    });
  }

  function getDuplicateMatch(row: ParsedRow) {
    return findDuplicateCompanies(
      {
        name: row.companyName,
        domain: extractDomain(row.email),
      },
      companies.map((company) => ({
        id: company.id,
        name: company.name,
        domain: company.domain,
      })),
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-8 text-center transition-colors hover:border-primary/50">
        <Upload className="mb-3 size-6 text-muted-foreground" />
        <span className="text-sm font-medium">CSV, XLSX o XLS</span>
        <span className="mt-1 text-xs text-muted-foreground">
          Notion, Google Sheets y Excel exportados
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{fileName ?? "Sin archivo cargado"}</span>
        <span>·</span>
        <span>{rows.length} filas parseadas</span>
        <span>·</span>
        <span>{duplicateCount} duplicados probables</span>
        <form action={formAction}>
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="sourceName" value={fileName ?? "Import"} />
          <input type="hidden" name="rowsJson" value={JSON.stringify(rows)} />
          <Button
            size="sm"
            type="submit"
            variant="outline"
            disabled={!rows.length || isPending}
          >
            {isPending ? "Aplicando" : "Aplicar import"}
          </Button>
        </form>
      </div>
      {actionState.message ? <ActionMessage state={actionState} /> : null}
      {scope === "all" && campaigns.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          En la vista “Todas”, el import crea contactos globales sin linkearlos a
          un proyecto. Para Pastoral, importa desde el proyecto Pastoral.
        </div>
      ) : null}

      {rows.length ? (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Resolución</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 12).map((row, index) => {
                const duplicates = getDuplicateMatch(row);
                return (
                  <TableRow key={`${row.email}-${index}`}>
                    <TableCell className="font-medium">
                      {row.companyName || "Sin empresa"}
                    </TableCell>
                    <TableCell>{row.contactName || "Sin nombre"}</TableCell>
                    <TableCell>{row.role || "Sin cargo"}</TableCell>
                    <TableCell>{row.email || "Sin email"}</TableCell>
                    <TableCell>
                      {duplicates.length
                        ? `Linkear con ${duplicates[0].companyId}`
                        : "Crear nuevo"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  return (
    <div
      className={
        state.ok
          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
      }
    >
      {state.message}
    </div>
  );
}

function mapRow(row: Record<string, unknown>): ParsedRow {
  return {
    companyName: readAny(row, COMPANY_KEYS),
    contactName: readAny(row, CONTACT_KEYS),
    role: readAny(row, ROLE_KEYS),
    email: readAny(row, EMAIL_KEYS).toLowerCase(),
    isDecisionMaker: parseBoolean(readAny(row, DECIDER_KEYS)),
    source: "import",
  };
}

function readAny(row: Record<string, unknown>, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    normalizeCompanyName(key),
    value,
  ]);

  const match = keys
    .map(normalizeCompanyName)
    .map((key) => normalizedEntries.find(([entryKey]) => entryKey === key))
    .find(Boolean);

  return String(match?.[1] ?? "").trim();
}

function parseBoolean(value: string) {
  return ["true", "si", "sí", "yes", "1", "x"].includes(
    value.trim().toLowerCase(),
  );
}
