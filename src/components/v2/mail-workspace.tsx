"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Inbox, Lightbulb, Mail, RefreshCw, Send, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { V2InboxThread } from "@/lib/v2/types";

export function MailWorkspace({ threads, initialThreadId }: { threads: V2InboxThread[]; initialThreadId?: string }) {
  const initial = threads.find((thread) => thread.id === initialThreadId) ?? threads[0];
  const [activeId, setActiveId] = useState(initial?.id ?? "");
  const active = threads.find((thread) => thread.id === activeId) ?? initial;
  const [draft, setDraft] = useState(active?.suggestedReply ?? "");
  const [approved, setApproved] = useState(active?.draftStatus === "approved");
  const [sent, setSent] = useState(active?.draftStatus === "sent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAiChange, setShowAiChange] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [showList, setShowList] = useState(false);
  const accounts = useMemo(() => [...new Set(threads.map((thread) => thread.account))], [threads]);

  function selectThread(thread: V2InboxThread) { setActiveId(thread.id); setDraft(thread.suggestedReply); setApproved(thread.draftStatus === "approved"); setSent(thread.draftStatus === "sent"); setError(""); setShowAiChange(false); setAiInstruction(""); setShowList(false); }
  async function approveDraft() {
    if (!active.draftId) { setApproved(true); return; }
    setBusy(true); setError("");
    const saved = await fetch(`/api/v2/mail/drafts/${active.draftId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: active.subject, body: draft }) });
    if (!saved.ok) { setError("No se pudo guardar el borrador."); setBusy(false); return; }
    const response = await fetch("/api/v2/mail/drafts/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftIds: [active.draftId] }) });
    setBusy(false);
    if (!response.ok) { setError("No tienes permiso para aprobar este borrador."); return; }
    setApproved(true);
  }
  async function sendDraft() {
    if (!approved) return;
    if (!active.draftId) { setSent(true); return; }
    setBusy(true); setError("");
    const response = await fetch(`/api/v2/mail/drafts/${active.draftId}/send`, { method: "POST" });
    setBusy(false);
    if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error ?? "No se pudo enviar."); return; }
    setSent(true);
  }
  async function requestAiChange() {
    if (!aiInstruction.trim()) return;
    if (!active.draftId) { setMessageForDemo(); return; }
    setBusy(true); setError("");
    const response = await fetch(`/api/v2/mail/drafts/${active.draftId}/ai-revision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: aiInstruction }) });
    setBusy(false);
    if (!response.ok) { setError("No se pudo dejar la revisión en la cola."); return; }
    setShowAiChange(false); setAiInstruction(""); setError("Cambio solicitado. ChatGPT actualizará el borrador sin enviarlo.");
  }
  function setMessageForDemo() { setShowAiChange(false); setAiInstruction(""); setError("Cambio solicitado en modo demostración."); }
  if (!active) return <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">No hay conversaciones vinculadas al CRM.</div>;

  return <div className="-mx-4 -my-6 flex min-h-[calc(100vh-4rem)] flex-col sm:-mx-6 lg:-mx-8 lg:-my-8">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
      <div><h1 className="text-xl font-semibold tracking-tight">Correo</h1><p className="text-xs text-muted-foreground">Inbox unificado · {accounts.length} cuenta{accounts.length === 1 ? "" : "s"} activa{accounts.length === 1 ? "" : "s"}</p></div>
      <div className="flex items-center gap-2"><Button variant="outline" size="sm"><RefreshCw className="size-3.5" />Sincronizar ahora</Button><Button size="sm"><Mail className="size-3.5" />Nuevo correo</Button></div>
    </header>
    <div className="border-b border-border px-4 py-2 lg:hidden"><button onClick={() => setShowList((value) => !value)} className="flex w-full items-center justify-between text-sm font-medium">Conversaciones <ChevronDown className="size-4" /></button></div>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[19rem_minmax(24rem,1fr)_22rem]">
      <aside className={cn("border-r border-border bg-card", showList ? "block" : "hidden lg:block")}>
        <div className="border-b border-border p-3"><div className="flex gap-1 rounded-lg bg-muted p-1 text-xs"><button className="flex-1 rounded-md bg-background px-2 py-1.5 font-medium shadow-sm">Todas</button><button className="flex-1 rounded-md px-2 py-1.5 text-muted-foreground">No leídas</button><button className="flex-1 rounded-md px-2 py-1.5 text-muted-foreground">Borradores</button></div></div>
        <div className="divide-y divide-border">{threads.map((thread) => <button key={thread.id} onClick={() => selectThread(thread)} className={cn("w-full p-4 text-left transition-colors hover:bg-muted/60", thread.id === active.id && "bg-secondary/70")}><div className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className={cn("size-2 shrink-0 rounded-full", thread.unread ? "bg-primary" : "bg-transparent")} /><strong className="truncate text-sm">{thread.company}</strong></span><span className="shrink-0 text-[11px] text-muted-foreground">{thread.receivedAt}</span></div><p className="mt-1 truncate text-xs font-medium">{thread.subject}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{thread.snippet}</p><Badge variant="outline" className="mt-2 max-w-full truncate text-[10px]">{thread.account}</Badge></button>)}</div>
      </aside>

      <main className="min-w-0 border-r border-border bg-background">
        <div className="border-b border-border px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{active.subject}</h2><p className="mt-1 text-xs text-muted-foreground">{active.contact} · {active.company} · {active.project}</p></div><Badge variant="outline">Vinculado al CRM</Badge></div></div>
        <div className="space-y-4 p-4 sm:p-6">{active.messages.length ? active.messages.map((message, index) => <article key={`${message.date}-${index}`} className={cn("max-w-[90%] rounded-lg border border-border p-4 text-sm leading-6", message.direction === "outbound" ? "ml-auto bg-secondary/60" : "bg-card")}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><strong>{message.author}</strong><span className="text-muted-foreground">{message.date}</span></div><p className="whitespace-pre-wrap">{message.body}</p></article>) : <div className="rounded-lg border border-dashed border-border p-6 text-center"><Inbox className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Primer contacto</p><p className="mt-1 text-xs text-muted-foreground">Este correo requiere aprobación antes de enviarse.</p></div>}
          <section className="rounded-lg border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />Borrador propuesto</div><label className="flex items-center gap-2 text-xs text-muted-foreground">Desde<select aria-label="Remitente" className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground"><option>{active.account}</option></select></label></div><div className="p-4"><Textarea aria-label="Borrador de respuesta" value={draft} disabled={sent} onChange={(event) => { setDraft(event.target.value); setApproved(false); setError(""); }} className="min-h-52 resize-y border-0 p-0 leading-6 shadow-none focus-visible:ring-0" />{showAiChange ? <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3"><label className="text-xs font-medium">Indica el cambio<Textarea value={aiInstruction} onChange={(event) => setAiInstruction(event.target.value)} placeholder="Ej.: hazlo más corto y pregunta por una reunión" className="mt-2 min-h-20 bg-background" /></label><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setShowAiChange(false)}>Cancelar</Button><Button size="sm" disabled={busy || aiInstruction.trim().length < 3} onClick={requestAiChange}>Solicitar cambio</Button></div></div> : null}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">{sent ? "Correo enviado y registrado." : "No se enviará automáticamente."}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || sent} onClick={() => setShowAiChange(true)}>Pedir cambio a la IA</Button>{approved && !sent ? <Button size="sm" disabled={busy} onClick={sendDraft}><Send className="size-4" />Enviar ahora</Button> : <Button size="sm" disabled={busy || sent || !draft.trim()} onClick={approveDraft}>{sent || approved ? <><Check className="size-4" />{sent ? "Enviado" : "Aprobado"}</> : <><Check className="size-4" />Aprobar borrador</>}</Button>}</div></div>{error ? <p role="status" className="mt-3 text-xs text-muted-foreground">{error}</p> : null}</div></section>
        </div>
      </main>

      <aside className="bg-card p-5"><div className="flex items-center gap-2"><Lightbulb className="size-4 text-amber-600" /><h2 className="font-semibold">Consejo de la IA</h2></div><ul className="mt-4 space-y-3">{active.advice.map((advice) => <li key={advice} className="flex gap-2 text-sm leading-5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{advice}</li>)}</ul><div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-semibold">Contexto disponible</h3><dl className="mt-3 space-y-3 text-xs"><div><dt className="text-muted-foreground">Empresa</dt><dd className="mt-1 font-medium">{active.company}</dd></div><div><dt className="text-muted-foreground">Proyecto</dt><dd className="mt-1 font-medium">{active.project}</dd></div><div><dt className="text-muted-foreground">Calidad del contacto</dt><dd className="mt-1 font-medium">Respondió · rol por confirmar</dd></div></dl></div></aside>
    </div>
  </div>;
}
