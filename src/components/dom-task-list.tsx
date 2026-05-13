"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ClipboardCheck,
  FileText,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  applyProjectContextSuggestionAction,
  requestProjectContextRevisionAction,
  reviewDomCandidateAction,
  type ActionState,
} from "@/features/prospecting/actions";
import { shouldReplaceDomCollection } from "@/lib/dom/chat-state";
import {
  getProjectContextProposalFromTask,
  isProjectContextRefinementTask,
  type DomProjectContextProposal,
} from "@/lib/dom/project-context";
import { isActiveDomTaskStatus } from "@/lib/dom/status";
import type {
  DomCompanyCandidate,
  DomCompanyCandidateStatus,
  DomTask,
  DomTaskStatus,
} from "@/lib/dom/types";

const TASK_STATUS_VISUAL: Record<
  DomTaskStatus,
  { emoji: string; label: string }
> = {
  pending: { emoji: "📥", label: "Pendiente" },
  received: { emoji: "📥", label: "Recibido" },
  in_progress: { emoji: "⏳", label: "En proceso" },
  researching: { emoji: "🔍", label: "Investigando" },
  drafting: { emoji: "✍️", label: "Redactando" },
  reviewing: { emoji: "🔎", label: "Revisando" },
  completed: { emoji: "✅", label: "Completado" },
  failed: { emoji: "❌", label: "Error" },
};

type CandidateReviewIntent = "accept" | "reject" | "research";
type DomTaskSectionId =
  | "all"
  | "company_search"
  | "mail"
  | "project_context"
  | "research"
  | "other";

const TASK_SECTIONS: Array<{ id: DomTaskSectionId; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "company_search", label: "Búsqueda de empresas" },
  { id: "mail", label: "Mails" },
  { id: "project_context", label: "Contexto" },
  { id: "research", label: "Investigación" },
  { id: "other", label: "Otras" },
];

export function DomTaskList({
  initialCandidates,
  initialTasks,
  scope,
}: {
  initialCandidates: DomCompanyCandidate[];
  initialTasks: DomTask[];
  scope: string;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [candidateMessages, setCandidateMessages] = useState<
    Record<string, ActionState>
  >({});
  const [projectContextMessages, setProjectContextMessages] = useState<
    Record<string, ActionState>
  >({});
  const [pendingCandidateIds, setPendingCandidateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingProjectContextTaskIds, setPendingProjectContextTaskIds] =
    useState<Set<string>>(() => new Set());
  const [selectedSection, setSelectedSection] =
    useState<DomTaskSectionId>("all");
  const [tasks, setTasks] = useState(initialTasks);
  const activeCount = useMemo(
    () => tasks.filter((task) => isActiveDomTaskStatus(task.status)).length,
    [tasks],
  );
  const sectionCounts = useMemo(() => getTaskSectionCounts(tasks), [tasks]);
  const visibleTasks = useMemo(
    () =>
      selectedSection === "all"
        ? tasks
        : tasks.filter((task) => getDomTaskSection(task) === selectedSection),
    [selectedSection, tasks],
  );
  const candidatesByTask = useMemo(() => {
    const groups = new Map<string, DomCompanyCandidate[]>();
    for (const candidate of candidates) {
      const taskCandidates = groups.get(candidate.taskId) ?? [];
      taskCandidates.push(candidate);
      groups.set(candidate.taskId, taskCandidates);
    }
    return groups;
  }, [candidates]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/agent/tasks?scope=${encodeURIComponent(scope)}`);
      const data = await response.json().catch(() => null);
      if (data?.ok && Array.isArray(data.tasks)) {
        setTasks((current) =>
          shouldReplaceDomCollection(current, data.tasks) ? data.tasks : current,
        );
      }
      if (data?.ok && Array.isArray(data.companyCandidates)) {
        setCandidates((current) =>
          shouldReplaceDomCollection(current, data.companyCandidates)
            ? data.companyCandidates
            : current,
        );
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [scope]);

  async function handleCandidateReview(
    candidateId: string,
    intent: CandidateReviewIntent,
    formData: FormData,
  ) {
    formData.set("candidateId", candidateId);
    formData.set("intent", intent);
    setPendingCandidateIds((current) => new Set(current).add(candidateId));
    setCandidateMessages((current) => {
      const next = { ...current };
      delete next[candidateId];
      return next;
    });

    const result = await reviewDomCandidateAction({ ok: false, message: "" }, formData);
    setCandidateMessages((current) => ({ ...current, [candidateId]: result }));

    if (result.ok) {
      const nextStatus: DomCompanyCandidateStatus =
        intent === "accept"
          ? "accepted"
          : intent === "reject"
            ? "rejected"
            : "needs_more_research";
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                status: nextStatus,
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      );
      router.refresh();
    }

    setPendingCandidateIds((current) => {
      const next = new Set(current);
      next.delete(candidateId);
      return next;
    });
  }

  async function handleProjectContextApply(taskId: string, formData: FormData) {
    await runProjectContextAction(
      taskId,
      formData,
      applyProjectContextSuggestionAction,
    );
  }

  async function handleProjectContextRevision(taskId: string, formData: FormData) {
    await runProjectContextAction(
      taskId,
      formData,
      requestProjectContextRevisionAction,
    );
  }

  async function runProjectContextAction(
    taskId: string,
    formData: FormData,
    action: (
      previousState: ActionState,
      formData: FormData,
    ) => Promise<ActionState>,
  ) {
    setPendingProjectContextTaskIds((current) => new Set(current).add(taskId));
    setProjectContextMessages((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });

    const result = await action({ ok: false, message: "" }, formData);
    setProjectContextMessages((current) => ({ ...current, [taskId]: result }));
    if (result.ok) router.refresh();

    setPendingProjectContextTaskIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="size-4" />
            Tareas de Dom
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedidos concretos para Dom, con estado y último avance.
          </p>
        </div>
        <Badge variant="outline">
          {activeCount} activa{activeCount === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="border-b border-border px-5 py-3">
        <div className="flex flex-wrap gap-2" aria-label="Filtrar tareas de Dom">
          {TASK_SECTIONS.map((section) => {
            const selected = section.id === selectedSection;
            const count = sectionCounts[section.id] ?? 0;

            return (
              <Button
                key={section.id}
                aria-pressed={selected}
                size="sm"
                type="button"
                variant={selected ? "default" : "outline"}
                onClick={() => setSelectedSection(section.id)}
              >
                <span>{section.label}</span>
                <span
                  className={
                    selected
                      ? "rounded-md bg-primary-foreground/15 px-1.5 text-[0.7rem]"
                      : "rounded-md bg-muted px-1.5 text-[0.7rem] text-muted-foreground"
                  }
                >
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-border">
        {visibleTasks.map((task, index) => (
          <DomTaskItem
            key={task.id}
            candidateMessages={candidateMessages}
            candidates={candidatesByTask.get(task.id) ?? []}
            index={index}
            onReviewCandidate={handleCandidateReview}
            onProjectContextApply={handleProjectContextApply}
            onProjectContextRevision={handleProjectContextRevision}
            pendingCandidateIds={pendingCandidateIds}
            pendingProjectContextTaskIds={pendingProjectContextTaskIds}
            projectContextMessage={projectContextMessages[task.id]}
            task={task}
          />
        ))}
        {!tasks.length ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">
              Sin tareas para Dom todavía.
            </div>
            <p className="mt-1 max-w-[48ch]">
              Crea una tarea corta y accionable. Dom la verá con el contexto
              de este proyecto.
            </p>
          </div>
        ) : null}
        {tasks.length && !visibleTasks.length ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">
              No hay tareas en esta sección.
            </div>
            <p className="mt-1 max-w-[48ch]">
              Cambia de sección para revisar otros pedidos o avances de Dom.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DomTaskItem({
  candidateMessages,
  candidates,
  index,
  onReviewCandidate,
  onProjectContextApply,
  onProjectContextRevision,
  pendingCandidateIds,
  pendingProjectContextTaskIds,
  projectContextMessage,
  task,
}: {
  candidateMessages: Record<string, ActionState>;
  candidates: DomCompanyCandidate[];
  index: number;
  onReviewCandidate: (
    candidateId: string,
    intent: CandidateReviewIntent,
    formData: FormData,
  ) => Promise<void>;
  onProjectContextApply: (taskId: string, formData: FormData) => Promise<void>;
  onProjectContextRevision: (taskId: string, formData: FormData) => Promise<void>;
  pendingCandidateIds: Set<string>;
  pendingProjectContextTaskIds: Set<string>;
  projectContextMessage?: ActionState;
  task: DomTask;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [projectContextReviewOpen, setProjectContextReviewOpen] = useState(false);
  const visual = TASK_STATUS_VISUAL[task.status];
  const percent = getTaskPercent(task);
  const progressText =
    task.progressMessage || task.resultPreview || task.result || progressFallback(task);
  const pendingCandidates = candidates.filter(
    (candidate) => candidate.status === "pending",
  );
  const reviewedCandidates = candidates.length - pendingCandidates.length;
  const projectContextProposal = getProjectContextProposalFromTask(task);
  const projectContextPending = pendingProjectContextTaskIds.has(task.id);

  return (
    <article
      className="group grid min-w-0 gap-3 px-5 py-4 transition-all duration-200 animate-in fade-in-0 slide-in-from-bottom-1 hover:bg-muted/35 md:grid-cols-[minmax(0,1fr)_auto]"
      style={{ animationDelay: `${Math.min(index * 45, 180)}ms` }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <span className="text-xs font-medium text-muted-foreground">
            {task.campaignName ?? "Sin proyecto"}
          </span>
        </div>
        <h2 className="mt-2 max-w-[68ch] text-[0.98rem] font-semibold leading-6 break-words text-foreground [overflow-wrap:anywhere]">
          {task.description}
        </h2>
        <div className="mt-3 rounded-lg border border-border bg-background/70 px-3 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 text-sm font-medium text-foreground">
              <span aria-hidden="true">{visual.emoji}</span>{" "}
              {visual.label}
              {task.progressStep ? (
                <span className="text-muted-foreground"> · {task.progressStep}</span>
              ) : null}
            </div>
            {percent !== null ? (
              <div className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {percent}%
              </div>
            ) : null}
          </div>
          <p className="mt-2 max-w-[72ch] text-sm leading-6 break-words text-muted-foreground [overflow-wrap:anywhere]">
            {progressText}
          </p>
          {percent !== null ? (
            <Progress className="mt-3" value={percent} />
          ) : null}
          {candidates.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Badge variant={pendingCandidates.length ? "outline" : "secondary"}>
                {pendingCandidates.length} pendiente
                {pendingCandidates.length === 1 ? "" : "s"}
              </Badge>
              {reviewedCandidates > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {reviewedCandidates} revisada
                  {reviewedCandidates === 1 ? "" : "s"}
                </span>
              ) : null}
              {pendingCandidates.length ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => setReviewOpen((current) => !current)}
                >
                  Revisar resultados
                </Button>
              ) : null}
            </div>
          ) : null}
          {projectContextProposal ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Badge variant="outline">Propuesta de contexto</Badge>
              <span className="text-xs text-muted-foreground">
                Revísala antes de cambiar el proyecto.
              </span>
              <Button
                size="sm"
                type="button"
                onClick={() => setProjectContextReviewOpen((current) => !current)}
              >
                Revisar propuesta
              </Button>
            </div>
          ) : null}
          <div
            className="mt-2 text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            Ultima actualizacion: {formatRelative(task.lastProgressAt ?? task.updatedAt)}
          </div>
          {reviewOpen ? (
            <CandidateReviewPanel
              candidateMessages={candidateMessages}
              candidates={pendingCandidates}
              onReviewCandidate={onReviewCandidate}
              pendingCandidateIds={pendingCandidateIds}
            />
          ) : null}
          {projectContextReviewOpen && projectContextProposal ? (
            <ProjectContextReviewPanel
              message={projectContextMessage}
              onApply={onProjectContextApply}
              onRequestRevision={onProjectContextRevision}
              pending={projectContextPending}
              proposal={projectContextProposal}
              task={task}
            />
          ) : null}
        </div>
      </div>
      <div className="grid content-start gap-2 text-xs text-muted-foreground md:min-w-40 md:text-right">
        <div>
          <span className="font-medium text-foreground">Creada</span>
          <div suppressHydrationWarning>{formatDomDate(task.createdAt)}</div>
        </div>
        <div>
          <span className="font-medium text-foreground">Ultima accion</span>
          <div suppressHydrationWarning>{formatDomDate(task.updatedAt)}</div>
        </div>
      </div>
    </article>
  );
}

function CandidateReviewPanel({
  candidateMessages,
  candidates,
  onReviewCandidate,
  pendingCandidateIds,
}: {
  candidateMessages: Record<string, ActionState>;
  candidates: DomCompanyCandidate[];
  onReviewCandidate: (
    candidateId: string,
    intent: CandidateReviewIntent,
    formData: FormData,
  ) => Promise<void>;
  pendingCandidateIds: Set<string>;
}) {
  if (!candidates.length) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
        No quedan candidatos pendientes en esta tarea.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-foreground">
          Resultados propuestos por Dom
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Revisa antes de guardar en la base. Puedes ajustar fit, calidad y feedback.
        </p>
      </div>
      {candidates.map((candidate) => (
        <CandidateCard
          key={candidate.id}
          candidate={candidate}
          message={candidateMessages[candidate.id]}
          onReviewCandidate={onReviewCandidate}
          pending={pendingCandidateIds.has(candidate.id)}
        />
      ))}
    </div>
  );
}

function ProjectContextReviewPanel({
  message,
  onApply,
  onRequestRevision,
  pending,
  proposal,
  task,
}: {
  message?: ActionState;
  onApply: (taskId: string, formData: FormData) => Promise<void>;
  onRequestRevision: (taskId: string, formData: FormData) => Promise<void>;
  pending: boolean;
  proposal: DomProjectContextProposal;
  task: DomTask;
}) {
  const campaignSlug = task.campaignId ?? "";

  function handleApplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onApply(task.id, new FormData(event.currentTarget));
  }

  function handleRevisionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onRequestRevision(task.id, new FormData(event.currentTarget));
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-semibold text-foreground">
            Propuesta para ordenar el proyecto
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Puedes editar antes de aplicar, o pedir otra versión con feedback.
          </p>
        </div>
      </div>

      <form className="mt-4 space-y-3" onSubmit={handleApplySubmit}>
        <input name="taskId" type="hidden" value={task.id} />
        <input name="campaignSlug" type="hidden" value={campaignSlug} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Nombre</span>
            <Input name="name" defaultValue={proposal.name ?? ""} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Organización/contexto</span>
            <Input
              name="organization"
              defaultValue={proposal.organization ?? ""}
            />
          </label>
        </div>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Qué es el proyecto</span>
          <Textarea
            className="min-h-28"
            name="description"
            defaultValue={proposal.description ?? ""}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Qué se necesita conseguir</span>
          <Textarea
            className="min-h-24"
            name="valueProposition"
            defaultValue={proposal.valueProposition ?? ""}
          />
        </label>

        {proposal.notes ? (
          <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Notas: </span>
            {proposal.notes}
          </div>
        ) : null}

        {proposal.missingInfo.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="font-medium">Información que la IA cree que falta</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {proposal.missingInfo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={pending || !campaignSlug} type="submit">
            <ClipboardCheck className="size-4" />
            {pending ? "Aplicando" : "Aplicar al proyecto"}
          </Button>
        </div>
      </form>

      <form
        className="mt-4 border-t border-border pt-4"
        onSubmit={handleRevisionSubmit}
      >
        <input name="taskId" type="hidden" value={task.id} />
        <input name="campaignSlug" type="hidden" value={campaignSlug} />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Feedback para otra versión</span>
          <Textarea
            className="min-h-20"
            name="feedback"
            placeholder="Ej: más corto, más enfocado en premios en especie, menos formal..."
          />
        </label>
        <div className="mt-3 flex justify-end">
          <Button
            disabled={pending || !campaignSlug}
            type="submit"
            variant="outline"
          >
            <RotateCcw className="size-4" />
            {pending ? "Creando tarea" : "Pedir nueva versión"}
          </Button>
        </div>
      </form>

      {message?.message ? (
        <div
          className={
            message.ok
              ? "mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              : "mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          }
        >
          {message.message}
        </div>
      ) : null}
    </div>
  );
}

function CandidateCard({
  candidate,
  message,
  onReviewCandidate,
  pending,
}: {
  candidate: DomCompanyCandidate;
  message?: ActionState;
  onReviewCandidate: (
    candidateId: string,
    intent: CandidateReviewIntent,
    formData: FormData,
  ) => Promise<void>;
  pending: boolean;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter as HTMLButtonElement | null;
    const intent = submitter?.value;
    if (!isCandidateReviewIntent(intent)) return;
    void onReviewCandidate(
      candidate.id,
      intent,
      new FormData(event.currentTarget),
    );
  }

  return (
    <form
      className="rounded-lg border border-border bg-background p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {candidate.name}
            </h3>
            <QualityStars value={candidate.qualityRating} />
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {candidate.domain ? <span>{candidate.domain}</span> : null}
            {candidate.industry ? <span>{candidate.industry}</span> : null}
            {candidate.region ? <span>{candidate.region}</span> : null}
            {candidate.website ? (
              <a
                className="font-medium text-primary"
                href={candidate.website}
                rel="noreferrer"
                target="_blank"
              >
                Sitio
              </a>
            ) : null}
          </div>
        </div>
        <div className="min-w-36">
          <Progress value={candidate.fitScore} className="h-1.5" />
          <div className="mt-1 text-xs text-muted-foreground">
            Fit proyecto: {candidate.fitScore}/100
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {candidate.description ?? "Dom no dejó descripción para este candidato."}
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <CandidateInfoBlock
          title="Por qué calza"
          body={candidate.fitReason ?? "Sin razón de fit."}
        />
        <CandidateInfoBlock
          title="Calidad global"
          body={candidate.qualityReason ?? "Sin razón de calidad."}
        />
      </div>

      {candidate.evidenceUrls.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.evidenceUrls.slice(0, 4).map((url) => (
            <a
              key={url}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-primary"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              Evidencia
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Contactos sugeridos
        </div>
        {candidate.suggestedContacts.length ? (
          <div className="mt-2 grid gap-2">
            {candidate.suggestedContacts.map((contact, index) => (
              <div
                key={`${contact.email ?? contact.name}-${index}`}
                className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="font-medium">{contact.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[contact.role, contact.email, `${Math.round(contact.confidence * 100)}%`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Sin contactos suficientes todavía.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[8rem_9rem_1fr]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Fit</span>
          <Input
            defaultValue={candidate.fitScore}
            max={100}
            min={0}
            name="fitScore"
            type="number"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Calidad</span>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            defaultValue={candidate.qualityRating}
            name="qualityRating"
          >
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>
                {rating} estrella{rating === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Feedback para Dom</span>
          <Textarea
            className="min-h-20"
            name="feedback"
            placeholder="Ej: buen producto pero falta contacto de marketing; buscar decision maker."
          />
        </label>
      </div>

      {message?.message ? (
        <div
          className={
            message.ok
              ? "mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              : "mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          }
        >
          {message.message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          disabled={pending}
          name="intent"
          size="sm"
          type="submit"
          value="reject"
          variant="outline"
        >
          <Trash2 className="size-4" />
          Descartar
        </Button>
        <Button
          disabled={pending}
          name="intent"
          size="sm"
          type="submit"
          value="research"
          variant="outline"
        >
          <Search className="size-4" />
          Investigar contactos
        </Button>
        <Button
          disabled={pending}
          name="intent"
          size="sm"
          type="submit"
          value="research"
          variant="outline"
        >
          <RotateCcw className="size-4" />
          Pedir otra búsqueda
        </Button>
        <Button
          disabled={pending}
          name="intent"
          size="sm"
          type="submit"
          value="accept"
        >
          <Check className="size-4" />
          Guardar y usar
        </Button>
      </div>
    </form>
  );
}

function CandidateInfoBlock({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function QualityStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((rating) => (
        <Star
          key={rating}
          className={rating <= value ? "size-3 fill-current" : "size-3"}
        />
      ))}
    </span>
  );
}

function isCandidateReviewIntent(
  value: string | undefined,
): value is CandidateReviewIntent {
  return value === "accept" || value === "reject" || value === "research";
}

function progressFallback(task: DomTask) {
  if (task.status === "pending") return "Dom todavia no confirma recepcion.";
  if (task.status === "completed") return "Tarea terminada.";
  if (task.status === "failed") return "La tarea fallo. Revisa el detalle de Dom.";
  return "Dom esta trabajando en esta tarea.";
}

function getTaskSectionCounts(tasks: DomTask[]) {
  const counts = TASK_SECTIONS.reduce(
    (accumulator, section) => {
      accumulator[section.id] = 0;
      return accumulator;
    },
    {} as Record<DomTaskSectionId, number>,
  );

  counts.all = tasks.length;
  for (const task of tasks) {
    counts[getDomTaskSection(task)] += 1;
  }

  return counts;
}

function getDomTaskSection(task: DomTask): Exclude<DomTaskSectionId, "all"> {
  const description = normalizeTaskText(task.description);
  const context = normalizeTaskText(task.context);
  const combined = normalizeTaskText([
    task.description,
    task.progressStep,
    task.progressMessage,
    task.resultPreview,
    task.result,
    task.context,
  ]);

  if (isProjectContextRefinementTask(task)) return "project_context";

  if (
    description.includes("contacto") ||
    description.includes("contactos") ||
    context.includes("without_contact") ||
    context.includes("company_marked_investigate") ||
    context.includes("needs_more_research") ||
    description.includes("investigar si")
  ) {
    return "research";
  }

  if (
    context.includes("draft_needed") ||
    description.includes("redactar") ||
    description.includes("redaccion") ||
    description.includes("mail") ||
    description.includes("borrador") ||
    description.includes("rechazado")
  ) {
    return "mail";
  }

  if (
    task.candidateCount > 0 ||
    task.pendingCandidateCount > 0 ||
    description.includes("buscar empresas") ||
    description.includes("busca empresas") ||
    description.includes("sponsors") ||
    description.includes("marcas") ||
    description.includes("scraping") ||
    combined.includes("company_candidates")
  ) {
    return "company_search";
  }

  if (description.includes("investigar")) return "research";

  return "other";
}

function normalizeTaskText(value: unknown) {
  if (value == null) return "";
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getTaskPercent(task: DomTask) {
  if (typeof task.progressPercent === "number") {
    return Math.max(0, Math.min(100, Math.round(task.progressPercent)));
  }
  if (task.status === "completed") return 100;
  return null;
}

function formatDomDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return date.toLocaleString("es-CL", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
  });
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fecha";

  const diff = Date.now() - date.getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 10) return "recien";
  if (seconds < 60) return `hace ${seconds} seg`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
