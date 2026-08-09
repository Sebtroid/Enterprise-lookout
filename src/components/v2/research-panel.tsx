"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, LoaderCircle, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Candidate = { id: string; name: string; domain?: string | null; summary?: string | null; fit_reason?: string | null; source_urls?: string[]; status: string };
type ResearchState = { brief: { id: string; request_text: string; confirmed_context?: Record<string, unknown>; estimated_context?: Record<string, unknown>; unknown_context?: string[]; status: string } | null; candidates: Candidate[] };

const demoCandidates: Candidate[] = [
  { id: "10000000-0000-4000-8000-000000000001", name: "PF Alimentos", domain: "pfalimentos.cl", fit_reason: "Portafolio directo y presencia nacional", source_urls: ["https://www.pfalimentos.cl"], status: "proposed" },
  { id: "10000000-0000-4000-8000-000000000002", name: "La Preferida", domain: "lapreferida.cl", fit_reason: "Categoría exacta y activaciones de marca", source_urls: ["https://www.lapreferida.cl"], status: "proposed" },
];

export function ResearchPanel({ projectId }: { projectId: string }) {
  const [request, setRequest] = useState("");
  const [date, setDate] = useState("");
  const [attendance, setAttendance] = useState("");
  const [need, setNeed] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "queued" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/projects/${encodeURIComponent(projectId)}/research`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("research_unavailable");
        return response.json() as Promise<ResearchState>;
      })
      .then((data) => {
        if (cancelled) return;
        setRequest(data.brief?.request_text ?? "");
        setCandidates(data.candidates);
        setSelected(new Set(data.candidates.filter((item) => item.status === "selected").map((item) => item.id)));
        setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        if (process.env.NEXT_PUBLIC_APP_MODE === "demo") {
          setRequest("Investiga marcas para este proyecto");
          setCandidates(demoCandidates);
          setStatus("idle");
        } else {
          setMessage("No fue posible cargar la investigación.");
          setStatus("error");
        }
      });
    return () => { cancelled = true; };
  }, [projectId]);

  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function discover() {
    if (request.trim().length < 10) { setMessage("Describe con un poco más de detalle lo que necesitas."); return; }
    setStatus("saving"); setMessage("");
    if (process.env.NEXT_PUBLIC_APP_MODE === "demo") { setCandidates(demoCandidates); setStatus("idle"); setMessage("Descubrimiento de demostración actualizado."); return; }
    const response = await fetch(`/api/v2/projects/${encodeURIComponent(projectId)}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discover", request, confirmed: { date: date || undefined, need: need || undefined }, estimated: { attendance: attendance || undefined }, unknown: restrictions ? [] : ["restricciones"], restrictions: restrictions || undefined }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus("error"); setMessage(result.error ?? "No se pudo crear el descubrimiento."); return; }
    setStatus("queued"); setMessage("ChatGPT puede reclamar el descubrimiento. Los candidatos aparecerán aquí al terminar.");
  }

  async function approve() {
    if (!selected.size) return;
    setStatus("saving"); setMessage("");
    if (process.env.NEXT_PUBLIC_APP_MODE === "demo") { setStatus("queued"); setMessage("Investigación profunda aprobada en modo demostración."); return; }
    const response = await fetch(`/api/v2/projects/${encodeURIComponent(projectId)}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_candidates", candidateIds: [...selected] }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus("error"); setMessage(result.error ?? "No se pudo aprobar la investigación."); return; }
    setStatus("queued"); setMessage(`${result.selected} candidato(s) aprobados. No se enviará ningún correo.`);
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-semibold">Brief guiado</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Confirma lo conocido y deja explícito lo estimado o desconocido.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="research-request">¿Qué necesitas investigar?</label>
      <Textarea id="research-request" value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Ej.: marcas de salchichas para un asado universitario" className="mt-2 min-h-24" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BriefInput label="Fecha confirmada" value={date} onChange={setDate} placeholder="18 septiembre 2026" />
        <BriefInput label="Asistencia estimada" value={attendance} onChange={setAttendance} placeholder="100 estudiantes" />
        <BriefInput label="Necesidad confirmada" value={need} onChange={setNeed} placeholder="Productos para asado" />
        <BriefInput label="Restricciones" value={restrictions} onChange={setRestrictions} placeholder="Por definir" />
      </div>
      <Button variant="outline" className="mt-4 w-full" disabled={status === "loading" || status === "saving"} onClick={discover}>{status === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}Iniciar descubrimiento superficial</Button>
    </section>

    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Candidatos encontrados</h2><p className="mt-1 text-sm text-muted-foreground">Selecciona cuáles merecen investigación profunda.</p></div><span className="text-sm font-medium">{selected.size} seleccionados</span></div>
      {status === "loading" ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Cargando investigación</div> : candidates.length ? <div className="mt-5 divide-y divide-border border-y border-border">
        {candidates.map((candidate) => <label key={candidate.id} className="flex cursor-pointer items-start gap-3 py-4">
          <input type="checkbox" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} className="mt-1 size-4 accent-[var(--primary)]" />
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="text-sm">{candidate.name}</strong><span className="text-xs text-muted-foreground">{candidate.domain ?? "Dominio por verificar"}</span></span><span className="mt-1 block text-sm text-muted-foreground">{candidate.fit_reason ?? candidate.summary ?? "Requiere revisión"}</span><span className="mt-1 block text-xs text-muted-foreground">{candidate.source_urls?.length ?? 0} fuente(s)</span></span>
        </label>)}
      </div> : <p className="mt-5 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Inicia un descubrimiento para recibir candidatos. Ninguna investigación profunda comenzará sola.</p>}
      <Button className="mt-5 w-full" disabled={selected.size === 0 || status === "saving" || status === "queued"} onClick={approve}>{status === "queued" ? <><Check className="size-4" />Trabajo en cola</> : <>Aprobar investigación profunda <ChevronRight className="size-4" /></>}</Button>
      {message ? <p role="status" className={`mt-3 text-center text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{message}</p> : null}
    </section>
  </div>;
}

function BriefInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-xs font-medium text-muted-foreground">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}
