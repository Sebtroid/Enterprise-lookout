import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  draft: "Borrador",
  paused: "Pausada",
  archived: "Archivada",
  new: "Nuevo",
  needs_research: "Investigar",
  qualified: "Calificado",
  ready_to_draft: "Listo para borrador",
  draft_ready: "Borrador listo",
  approved_to_send: "Aprobado",
  sent: "Enviado",
  replied: "Respondió",
  followup_due: "Follow-up",
  closed_positive: "Cerrado positivo",
  closed_negative: "Cerrado negativo",
  needs_review: "Por revisar",
  approved: "Aprobado",
  rejected: "Rechazado",
  failed: "Falló",
  do_not_contact: "No contactar",
  not_evaluated: "Sin evaluar",
  uploaded: "Subido",
  parsed: "Parseado",
  applied: "Aplicado",
};

const STATUS_CLASSNAMES: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  approved_to_send: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sent: "border-sky-200 bg-sky-50 text-sky-700",
  replied: "border-cyan-200 bg-cyan-50 text-cyan-700",
  needs_review: "border-amber-200 bg-amber-50 text-amber-800",
  needs_research: "border-amber-200 bg-amber-50 text-amber-800",
  followup_due: "border-orange-200 bg-orange-50 text-orange-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  do_not_contact: "border-rose-200 bg-rose-50 text-rose-700",
  paused: "border-slate-200 bg-slate-50 text-slate-700",
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  not_evaluated: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={STATUS_CLASSNAMES[status] ?? "border-border bg-muted"}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
