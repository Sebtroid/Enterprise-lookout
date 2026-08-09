"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { buildFinanceSummary } from "@/lib/v2/domain";

type Summary = ReturnType<typeof buildFinanceSummary>;
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function FinancePanel({ projectId, initial }: { projectId: string; initial: Summary }) {
  const [summary, setSummary] = useState(initial);
  const [mode, setMode] = useState<"contribution" | "expense" | "goal">("contribution");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch(`/api/v2/projects/${projectId}/finance`, { cache: "no-store" });
    if (response.ok) setSummary((await response.json()).summary);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/projects/${projectId}/finance`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ summary: Summary }> : null)
      .then((result) => { if (!cancelled && result) setSummary(result.summary); });
    return () => { cancelled = true; };
  }, [projectId]);

  async function submit(formData: FormData) {
    setBusy(true); setMessage("");
    let payload: Record<string, unknown>;
    if (mode === "goal") payload = { type: "goal", fundraisingGoal: Number(formData.get("goal") || 0), expenseBudget: Number(formData.get("budget") || 0) };
    else if (mode === "expense") payload = { type: "expense", description: String(formData.get("description") || ""), category: String(formData.get("category") || ""), budgetedValue: Number(formData.get("budgeted") || 0), actualValue: Number(formData.get("actual") || 0), evidenceUrl: String(formData.get("evidence") || "") || undefined };
    else { const value = Number(formData.get("value") || 0); const status = String(formData.get("status") || "requested"); payload = { type: "contribution", kind: String(formData.get("kind") || "cash"), status, description: String(formData.get("description") || ""), requestedValue: status === "requested" ? value : 0, committedValue: ["committed", "received"].includes(status) ? value : 0, receivedValue: status === "received" ? value : 0, evidenceUrl: String(formData.get("evidence") || "") || undefined }; }
    const response = await fetch(`/api/v2/projects/${projectId}/finance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!response.ok) { setMessage("No tienes permiso o faltan datos válidos."); return; }
    setMessage("Cambio financiero guardado con actor y fecha."); await refresh();
  }

  return <div className="space-y-6">
    <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3"><Metric label="Meta" value={money.format(summary.goal)} /><Metric label="Comprometido" value={money.format(summary.committed)} /><Metric label="Recibido neto" value={money.format(summary.netReceived)} /></section>
    <div className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
      <section className="rounded-lg border border-border bg-card p-5"><div className="flex items-center gap-2"><CircleDollarSign className="size-4 text-primary" /><h2 className="font-semibold">Resumen financiero</h2></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Small label="Valor en especie" value={money.format(summary.inKind)} /><Small label="Gastos reales" value={money.format(summary.expenses)} /><Small label="Falta para la meta" value={money.format(summary.remaining)} /><Small label="Moneda" value="CLP" /></dl><p className="mt-5 text-xs text-muted-foreground">Sin conexión bancaria. Los comprobantes se conservan como enlaces.</p></section>
      <section className="rounded-lg border border-border bg-card p-5"><div className="flex flex-wrap gap-1">{(["contribution", "expense", "goal"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={`rounded-md px-2.5 py-1.5 text-xs ${mode === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{item === "contribution" ? "Aporte" : item === "expense" ? "Gasto" : "Meta"}</button>)}</div><form action={submit} className="mt-4 space-y-3">
        {mode === "goal" ? <><Field name="goal" label="Meta de recaudación" type="number" /><Field name="budget" label="Presupuesto de gastos" type="number" /></> : mode === "expense" ? <><Field name="description" label="Descripción" /><Field name="category" label="Categoría" /><div className="grid grid-cols-2 gap-3"><Field name="budgeted" label="Presupuestado" type="number" /><Field name="actual" label="Real" type="number" /></div><Field name="evidence" label="Enlace comprobante" type="url" /></> : <><Field name="description" label="Aporte" /><div className="grid grid-cols-2 gap-3"><Select name="kind" label="Tipo" options={[['cash','Dinero'],['in_kind','Producto / servicio']]} /><Select name="status" label="Estado" options={[['requested','Solicitado'],['committed','Comprometido'],['received','Recibido']]} /></div><Field name="value" label="Valor CLP" type="number" /><Field name="evidence" label="Enlace respaldo" type="url" /></>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Guardar</Button>{message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
      </form></section>
    </div>
  </div>;
}

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) { return <label className="block text-xs font-medium text-muted-foreground">{label}<input name={name} type={type} min={type === "number" ? 0 : undefined} required={name === "description"} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>; }
function Select({ name, label, options }: { name: string; label: string; options: string[][] }) { return <label className="block text-xs font-medium text-muted-foreground">{label}<select name={name} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground">{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="bg-card p-5"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums">{value}</div></div>; }
function Small({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>; }
