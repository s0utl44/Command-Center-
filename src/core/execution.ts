/**
 * Porty wykonania. Kształt odpowiada potwierdzonemu kontraktowi Hermesa
 * (session.create / prompt.submit / session.status + session.history) — patrz docs/ARCHITECTURE.md.
 */

export type AdapterMode = "mock" | "real";

/** Stan uruchomienia odczytany z Hermesa (status + historia), a nie ze strumienia zdarzeń. */
export type RunState =
  | { kind: "running" }
  | { kind: "completed"; report: string }
  | { kind: "failed"; error: string }
  | { kind: "clarify"; requestId: string; question: string }
  | { kind: "approval"; description: string }
  /** Sesja istnieje, ale nie widać w niej naszego zlecenia — NIE wolno automatycznie ponawiać. */
  | { kind: "not-received" }
  /** Hermes nie zna już tej sesji. */
  | { kind: "lost" };

export interface HermesGateway {
  readonly mode: AdapterMode;
  createSession(): Promise<{ sessionId: string }>;
  /** Wysyła zlecenie. Wywoływane najwyżej raz na sesję — brak idempotencji po stronie Hermesa. */
  submitPrompt(sessionId: string, prompt: string): Promise<void>;
  /** Odtwarza stan sesji (po rozłączeniu / restarcie workera). `marker` identyfikuje nasze zlecenie w historii. */
  inspect(sessionId: string, marker: string): Promise<RunState>;
}

/** Niezależny odczyt do weryfikacji — nie korzysta z raportu agenta. */
export interface FileCounter {
  readonly mode: AdapterMode;
  /** Liczba plików w folderze; `null` gdy folder nie istnieje. */
  countFiles(accountAlias: string, path: string): Promise<number | null>;
}

export function taskMarker(taskId: string): string {
  return `[zlecenie:${taskId}]`;
}

export interface PromptInput {
  taskId: string;
  processKey: string;
  processVersion: number;
  accountAlias: string;
  instruction: string;
  params: Readonly<Record<string, string>>;
}

/**
 * Zlecenie dla Hermesa: znacznik (do odnalezienia w historii po rozłączeniu), instrukcja z procesu
 * oraz parametry w formie maszynowej.
 */
export function buildPrompt(input: PromptInput): string {
  const meta = {
    task: input.taskId,
    process: input.processKey,
    version: input.processVersion,
    account: input.accountAlias,
    params: input.params,
  };
  return [taskMarker(input.taskId), input.instruction, "", `Parametry zlecenia (JSON): ${JSON.stringify(meta)}`].join("\n");
}

export function parsePromptMeta(prompt: string): { task: string; account: string; params: Record<string, string> } | null {
  const line = prompt.split("\n").find((l) => l.startsWith("Parametry zlecenia (JSON): "));
  if (!line) return null;
  try {
    return JSON.parse(line.slice("Parametry zlecenia (JSON): ".length)) as { task: string; account: string; params: Record<string, string> };
  } catch {
    return null;
  }
}
