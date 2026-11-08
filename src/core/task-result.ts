/** Wynik zadania widoczny w UI. `simulated` = wynik pochodzi z mocka i NIE potwierdza prawdziwego działania. */
export interface TaskResult {
  summary: string;
  simulated: boolean;
  report?: string;
  verification?: { expected: number | null; actual: number | null; passed: boolean };
  /** Opis problemu dla stanów needs_attention / failed. */
  problem?: string;
  /** Pytanie od Hermesa (clarify/approval), na razie obsługiwane jako needs_attention. */
  question?: string;
}
