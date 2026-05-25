import { pastoralFundraisingGoals } from "@/lib/pastoral/config";

export function getCurrentPastoralGoal(now = new Date()) {
  return (
    pastoralFundraisingGoals.find(
      (goal) => getPastoralGoalDeadline(goal.date).getTime() >= now.getTime(),
    ) ?? pastoralFundraisingGoals[pastoralFundraisingGoals.length - 1]
  );
}

export function formatPastoralGoalDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function getPastoralGoalDeadline(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}
