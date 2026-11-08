import type { TodayGroup } from "./task";
import type { TaskView } from "./task-view";

export const TODAY_GROUPS: readonly { group: TodayGroup; label: string; empty: string }[] = [
  { group: "running", label: "Wykonywane", empty: "Nic się teraz nie wykonuje." },
  { group: "waiting", label: "Czeka na mnie", empty: "Nic nie czeka na Twoją decyzję." },
  { group: "scheduled", label: "Zaplanowane", empty: "Brak zaplanowanych zadań — harmonogram pojawi się później." },
  { group: "done", label: "Zakończone", empty: "Dziś nic jeszcze nie zakończono." },
  { group: "problems", label: "Problemy", empty: "Brak problemów." },
];

function sameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Grupy ekranu Dzisiaj. Wykonywane, czekające i problemy — niezależnie od daty (wymagają uwagi);
 * zakończone — tylko z dzisiaj.
 */
export function groupForToday(tasks: readonly TaskView[], now: Date = new Date()): Record<TodayGroup, TaskView[]> {
  const out: Record<TodayGroup, TaskView[]> = { running: [], waiting: [], scheduled: [], done: [], problems: [] };
  for (const task of tasks) {
    if (task.group === "done" && !sameLocalDay(task.updatedAt, now)) continue;
    out[task.group].push(task);
  }
  return out;
}

/** Nagłówek pozycji: folder, jeśli jest; inaczej treść polecenia (nie wartości domyślne parametrów). */
export function taskHeadline(task: TaskView): string {
  return task.params.find((p) => p.name === "folder")?.value ?? task.utterance;
}
