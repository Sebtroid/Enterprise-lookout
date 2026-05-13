import type { DomTask } from "@/lib/dom/types";

export const PROJECT_CONTEXT_REFINEMENT_TASK_TYPE = "project_context_refinement";

export type DomProjectContextProposal = {
  name: string | null;
  organization: string | null;
  description: string | null;
  valueProposition: string | null;
  missingInfo: string[];
  notes: string | null;
};

export function isProjectContextRefinementTask(task: Pick<DomTask, "context" | "description">) {
  const context = task.context ?? {};
  const gpt = asRecord(context.gpt);
  const source = normalizeText(context.source);
  const requestedAction = normalizeText(context.requested_action);
  const taskType = normalizeText(context.task_type ?? gpt.task_type);
  const description = normalizeText(task.description);

  return (
    taskType === PROJECT_CONTEXT_REFINEMENT_TASK_TYPE ||
    source.includes("project_context_refinement") ||
    requestedAction === "refine_project_context" ||
    description.includes("ordenar contexto del proyecto") ||
    description.includes("reordenar contexto del proyecto")
  );
}

export function getProjectContextProposalFromTask(
  task: Pick<DomTask, "context" | "description" | "result">,
): DomProjectContextProposal | null {
  if (!isProjectContextRefinementTask(task) || !task.result) return null;

  const parsed = parseJsonLike(task.result);
  if (parsed == null) return null;

  const root = asRecord(parsed);
  const proposal =
    firstRecord(
      root.project_context,
      root.projectContext,
      root.proposed_context,
      root.proposedContext,
      root.proposal,
    ) ?? root;

  const description = firstText(
    proposal.description,
    proposal.project_description,
    proposal.projectDescription,
    proposal.what_is_it,
    proposal.whatIsIt,
  );
  const valueProposition = firstText(
    proposal.value_proposition,
    proposal.valueProposition,
    proposal.needs,
    proposal.goals,
    proposal.what_is_needed,
    proposal.whatIsNeeded,
  );

  if (!description && !valueProposition) return null;

  return {
    name: firstText(proposal.name, proposal.title, proposal.project_name),
    organization: firstText(proposal.organization, proposal.context, proposal.org),
    description,
    valueProposition,
    missingInfo: firstTextArray(
      proposal.missing_info,
      proposal.missingInfo,
      root.missing_info,
      root.missingInfo,
    ),
    notes: firstText(
      proposal.notes,
      proposal.rationale,
      proposal.summary,
      root.notes,
      root.rationale,
      root.summary,
    ),
  };
}

function parseJsonLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  for (const candidate of [
    trimmed,
    stripJsonCodeFence(trimmed),
    extractJsonObject(trimmed),
  ]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function stripJsonCodeFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return value.slice(start, end + 1);
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length) return record;
  }
  return null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = coerceText(value);
    if (text) return text;
  }
  return null;
}

function firstTextArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value
        .map((item) => coerceText(item))
        .filter((item): item is string => Boolean(item));
    }

    const text = coerceText(value);
    if (text) return [text];
  }

  return [];
}

function coerceText(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceText(item))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
