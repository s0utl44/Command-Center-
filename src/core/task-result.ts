/** Wynik zadania widoczny w UI. `simulated` = wynik pochodzi z mocka i NIE potwierdza prawdziwego działania. */
export interface TaskResult {
  summary: string;
  simulated: boolean;
  report?: string;
  verification?: { expected: number | null; actual: number | null; passed: boolean };
  /** Link do wyniku (np. folder „obrobione” na Drive), jeśli Hermes go podał. */
  link?: string;
  /** Rzeczywista nazwa folderu dopasowanego przez Hermesa (użytkownik mógł podać fragment). */
  resolvedFolder?: string;
  /** Opis problemu dla stanów needs_attention / failed. */
  problem?: string;
  /** Pytanie od Hermesa (clarify/approval), na razie obsługiwane jako needs_attention. */
  question?: string;
}
