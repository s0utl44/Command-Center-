/** Stany zadania i dozwolone przejścia. Jedyne źródło prawdy dla workera i UI. */

export const TASK_STATUSES = [
  "needs_input",
  "awaiting_approval",
  "queued",
  "running",
  "verifying",
  "succeeded",
  "failed",
  "needs_attention",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  needs_input: ["needs_input", "awaiting_approval", "queued", "cancelled"],
  awaiting_approval: ["queued", "needs_input", "cancelled"],
  queued: ["running", "cancelled"],
  // running → queued tylko gdy prompt NIE został jeszcze wysłany do Hermesa (patrz ARCHITECTURE.md)
  running: ["verifying", "needs_input", "awaiting_approval", "failed", "needs_attention", "queued", "cancelled"],
  verifying: ["succeeded", "failed", "needs_attention"],
  succeeded: [],
  failed: [],
  needs_attention: ["queued", "succeeded", "failed", "cancelled"],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: TaskStatus,
    readonly to: TaskStatus,
  ) {
    super(`Niedozwolone przejście zadania: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(status: TaskStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Grupy ekranu „Dzisiaj”. „Zaplanowane” pojawi się wraz z harmonogramem. */
export type TodayGroup = "running" | "waiting" | "scheduled" | "done" | "problems";

export function todayGroup(status: TaskStatus): TodayGroup {
  switch (status) {
    case "queued":
    case "running":
    case "verifying":
      return "running";
    case "needs_input":
    case "awaiting_approval":
      return "waiting";
    case "succeeded":
    case "cancelled":
      return "done";
    case "failed":
    case "needs_attention":
      return "problems";
  }
}
