export type ProjectAccess = {
  canApprove: boolean;
  canEdit: boolean;
  canView: boolean;
  relation: "owner" | "teammate" | "none";
};

export function getProjectAccess(
  project: {
    accessMode: "personal" | "shared";
    ownerUserId: string;
    workspaceId: string;
  },
  actor: { userId: string; workspaceIds: string[] },
): ProjectAccess {
  if (!actor.workspaceIds.includes(project.workspaceId)) {
    return { canApprove: false, canEdit: false, canView: false, relation: "none" };
  }

  if (actor.userId === project.ownerUserId) {
    return { canApprove: true, canEdit: true, canView: true, relation: "owner" };
  }

  const canCollaborate = project.accessMode === "shared";
  return {
    canApprove: canCollaborate,
    canEdit: canCollaborate,
    canView: true,
    relation: "teammate",
  };
}

export function evaluateFollowupReadiness(input: {
  approvedFollowups: number;
  complianceAlerts: number;
  sentFollowups: number;
  steps: Array<{ approved: boolean; intervalDays: number; stepNumber: number }>;
}) {
  const reasons: string[] = [];

  if (input.approvedFollowups < 10) reasons.push("Faltan 10 follow-ups aprobados");
  if (input.sentFollowups < 5) reasons.push("Faltan 5 follow-ups enviados");
  if (input.steps.length === 0 || input.steps.some((step) => !step.approved)) {
    reasons.push("La secuencia debe estar aprobada");
  }
  if (input.steps.some((step) => step.stepNumber > 3 || step.intervalDays < 7)) {
    reasons.push("La secuencia no cumple la cadencia segura");
  }
  if (input.complianceAlerts > 0) reasons.push("Hay alertas de compliance pendientes");

  return { eligible: reasons.length === 0, reasons };
}

export function buildFinanceSummary(input: {
  goal: number;
  contributions: Array<{
    committedValue: number;
    receivedValue: number;
    kind: "cash" | "in_kind";
  }>;
  expenses: Array<{ actualValue: number }>;
}) {
  const committed = input.contributions.reduce((sum, item) => sum + item.committedValue, 0);
  const received = input.contributions.reduce((sum, item) => sum + item.receivedValue, 0);
  const inKind = input.contributions
    .filter((item) => item.kind === "in_kind")
    .reduce((sum, item) => sum + item.receivedValue, 0);
  const expenses = input.expenses.reduce((sum, item) => sum + item.actualValue, 0);

  return {
    committed,
    expenses,
    goal: input.goal,
    inKind,
    netReceived: received - expenses,
    received,
    remaining: Math.max(input.goal - received, 0),
  };
}

export function evaluateAiBudget(spentUsd: number, limitUsd: number) {
  const percent = limitUsd <= 0 ? 100 : Math.min(Math.round((spentUsd / limitUsd) * 100), 100);
  const state = spentUsd >= limitUsd ? "paused" : percent >= 80 ? "warning" : "available";
  return { percent, state };
}

export function buildResearchQuestions(input: {
  category: string | null;
  eventDate: string | null;
  institution: string | null;
  needs: string[];
  valueProposition: string | null;
}) {
  const questions: string[] = [];
  if (!input.category) questions.push("¿Qué tipo de empresas o marcas necesitas investigar?");
  if (!input.eventDate) questions.push("¿Para qué fecha necesitas tener resuelta esta gestión?");
  if (!input.institution) questions.push("¿Qué institución o equipo organiza el evento?");
  if (input.needs.length === 0) questions.push("¿Qué necesitas concretamente de las marcas?");
  if (!input.valueProposition) questions.push("¿Qué puedes ofrecerles a cambio?");
  return questions;
}

export function getSenderSelection(
  senders: Array<{ active: boolean; id: string }>,
  defaultSenderId: string | null,
) {
  const active = senders.filter((sender) => sender.active);
  const preferred = active.find((sender) => sender.id === defaultSenderId);

  if (preferred) return { selectedId: preferred.id, requiresChoice: false };
  if (active.length === 1) return { selectedId: active[0].id, requiresChoice: false };
  return { selectedId: null, requiresChoice: active.length > 1 };
}
