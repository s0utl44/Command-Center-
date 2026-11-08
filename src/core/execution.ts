import { z } from "zod";

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
  /** Wysyła zlecenie. Wywoływane najwyżej raz na próbę — brak idempotencji po stronie Hermesa. */
  submitPrompt(sessionId: string, prompt: string): Promise<void>;
  /** Odtwarza stan sesji (po rozłączeniu / restarcie workera). `marker` identyfikuje zlecenie w historii. */
  inspect(sessionId: string, marker: string): Promise<RunState>;
}

/** Folder do niezależnej weryfikacji: ścieżka zawsze, ID jeśli Hermes je zwrócił. */
export interface FolderRef {
  path: string;
  id?: string;
}

/** Niezależny odczyt do weryfikacji — nie korzysta z raportu agenta jako dowodu. */
export interface FileCounter {
  readonly mode: AdapterMode;
  /** Liczba zdjęć bezpośrednio w folderze (bez podfolderów, bez kosza); `null` gdy folder nie istnieje. */
  countFiles(accountAlias: string, folder: FolderRef): Promise<number | null>;
}

/** Znacznik zlecenia w historii Hermesa. Osobny dla każdej próby, żeby kontynuacja nie myliła się z poprzednią. */
export function taskMarker(taskId: string, attempt: number): string {
  return `[zlecenie:${taskId}#${attempt}]`;
}

export interface PromptInput {
  taskId: string;
  attempt: number;
  processKey: string;
  processVersion: number;
  accountAlias: string;
  instruction: string;
  params: Readonly<Record<string, string>>;
  /** Kontynuacja w tej samej sesji po świadomym „Dokończ” użytkownika. */
  continuation?: boolean;
}

export const PROMPT_META_PREFIX = "Parametry zlecenia (JSON): ";

export const CONTINUATION_TEXT =
  "To jest kontynuacja wcześniejszego zlecenia w tej samej sesji. Najpierw odtwórz stan z Drive i manifestu, nie powtarzaj ukończonych etapów, dokończ tylko brakujące.";

/** Zlecenie dla Hermesa: znacznik, instrukcja z procesu oraz parametry w formie maszynowej. */
export function buildPrompt(input: PromptInput): string {
  const meta = {
    task: input.taskId,
    attempt: input.attempt,
    process: input.processKey,
    version: input.processVersion,
    account: input.accountAlias,
    params: input.params,
  };
  return [
    taskMarker(input.taskId, input.attempt),
    ...(input.continuation ? [CONTINUATION_TEXT, ""] : []),
    input.instruction,
    "",
    `${PROMPT_META_PREFIX}${JSON.stringify(meta)}`,
  ].join("\n");
}

const PromptMetaSchema = z.object({
  task: z.string(),
  attempt: z.number(),
  account: z.string(),
  params: z.record(z.string(), z.string()),
});

export function parsePromptMeta(prompt: string): z.infer<typeof PromptMetaSchema> | null {
  const line = prompt.split("\n").find((l) => l.startsWith(PROMPT_META_PREFIX));
  if (!line) return null;
  try {
    return PromptMetaSchema.parse(JSON.parse(line.slice(PROMPT_META_PREFIX.length)));
  } catch {
    return null;
  }
}

export const RESULT_LINE_PREFIX = "WYNIK (JSON):";

const ReportResultSchema = z.object({
  source_folder_name: z.string().min(1).optional(),
  source_folder_id: z.string().min(1).optional(),
  destination_folder_id: z.string().min(1).optional(),
  destination_url: z.string().url().optional(),
  source_count: z.number().int().nonnegative().optional(),
  verified_count: z.number().int().nonnegative().optional(),
});
export type ReportResult = z.infer<typeof ReportResultSchema>;

/**
 * Odczytuje ostatnią linię `WYNIK (JSON): {...}` z raportu Hermesa. Dane służą tylko do wskazania,
 * GDZIE weryfikować (ID folderów) i do linku — liczby z raportu nie są dowodem sukcesu.
 */
export function parseReportResult(report: string): ReportResult | null {
  const line = report
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith(RESULT_LINE_PREFIX))
    .at(-1);
  if (!line) return null;
  try {
    const parsed = ReportResultSchema.safeParse(JSON.parse(line.slice(RESULT_LINE_PREFIX.length).trim()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
