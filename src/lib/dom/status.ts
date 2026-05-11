import type { DomTaskStatus } from "./types";

export const DOM_TASK_STATUSES = [
  "pending",
  "received",
  "in_progress",
  "researching",
  "drafting",
  "reviewing",
  "completed",
  "failed",
] as const satisfies readonly DomTaskStatus[];

const ACTIVE_DOM_TASK_STATUSES = new Set<DomTaskStatus>([
  "pending",
  "received",
  "in_progress",
  "researching",
  "drafting",
  "reviewing",
]);

export function isDomTaskStatus(value: unknown): value is DomTaskStatus {
  return DOM_TASK_STATUSES.includes(value as DomTaskStatus);
}

export function normalizeDomTaskStatus(value: unknown): DomTaskStatus {
  if (value === "blocked") return "failed";
  if (isDomTaskStatus(value)) return value;
  return "pending";
}

export function isActiveDomTaskStatus(status: DomTaskStatus) {
  return ACTIVE_DOM_TASK_STATUSES.has(status);
}
