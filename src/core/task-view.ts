import type { ApprovalReason } from "./policy";
import type { TaskStatus, TodayGroup } from "./task";
import type { TaskResult } from "./task-result";

/** Zadanie w kształcie dla UI. Bez danych wewnętrznych (dzierżawa, sesja Hermesa). */
export interface TaskView {
  id: string;
  status: TaskStatus;
  statusLabel: string;
  group: TodayGroup;
  processKey: string;
  processName: string;
  processVersion: number;
  utterance: string;
  params: { name: string; label: string; value: string }[];
  missing: { name: string; label: string; question: string; options?: string[] }[];
  approvalReasons: { reason: ApprovalReason; label: string }[];
  result: TaskResult | null;
  attempts: number;
  canContinue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppModes {
  hermes: "mock" | "real";
  stt: "mock" | "real";
}

export interface Snapshot {
  modes: AppModes;
  tasks: TaskView[];
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  needs_input: "Potrzebuję informacji",
  awaiting_approval: "Czeka na zgodę",
  queued: "W kolejce",
  running: "Wykonuję",
  verifying: "Sprawdzam wynik",
  succeeded: "Gotowe",
  failed: "Nie udało się",
  needs_attention: "Wymaga uwagi",
  cancelled: "Anulowane",
};
