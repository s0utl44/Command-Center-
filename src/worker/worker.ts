import { randomUUID } from "node:crypto";
import { resolveAccount } from "@/core/connections";
import { buildPrompt, parseReportResult, taskMarker, type FileCounter, type FolderRef, type HermesGateway } from "@/core/execution";
import { renderTemplate, type ProcessDefinition } from "@/core/process";
import type { TaskResult } from "@/core/task-result";
import type { ProcessRepository } from "@/server/db/processes";
import type { Task, TaskRepository } from "@/server/db/tasks";

export interface WorkerOptions {
  owner?: string;
  leaseMs?: number;
  /** Ile kolejnych błędów połączenia z Hermesem/Drive tolerujemy, zanim poprosimy człowieka. */
  maxTransientErrors?: number;
  /** Maksymalny czas wykonania po wysłaniu zlecenia. */
  maxRunMs?: number;
  now?: () => Date;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Worker wykonuje zadania krokami. Każdy `tick()` przejmuje zadania (dzierżawa), wykonuje jeden
 * krok każdego i zwalnia dzierżawę. Cały stan jest w bazie, więc restart workera w dowolnym
 * momencie jest bezpieczny. Zasada nadrzędna: `prompt.submit` najwyżej raz na sesję.
 */
export class Worker {
  readonly owner: string;
  private readonly leaseMs: number;
  private readonly maxTransientErrors: number;
  private readonly maxRunMs: number;
  private readonly now: () => Date;
  private readonly log: (message: string, data?: Record<string, unknown>) => void;

  constructor(
    private readonly tasks: TaskRepository,
    private readonly processes: ProcessRepository,
    private readonly hermes: HermesGateway,
    private readonly files: FileCounter,
    options: WorkerOptions = {},
  ) {
    this.owner = options.owner ?? `worker-${randomUUID()}`;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.maxTransientErrors = options.maxTransientErrors ?? 5;
    this.maxRunMs = options.maxRunMs ?? 2 * 60 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (() => undefined);
  }

  private get simulated(): boolean {
    return this.hermes.mode === "mock" || this.files.mode === "mock";
  }

  /** Jeden obrót pętli. Zwraca liczbę obsłużonych zadań. */
  async tick(): Promise<number> {
    const claimed = this.tasks.claimNext(this.owner, this.leaseMs);
    for (const task of claimed) {
      try {
        await this.step(task);
      } catch (error) {
        // Błąd logiki (nie połączenia) — nie zgadujemy, oddajemy człowiekowi.
        this.log("worker step error", { taskId: task.id, error: String(error) });
        this.toAttention(task.id, `Błąd wewnętrzny workera: ${String(error)}`);
      } finally {
        this.tasks.releaseLease(task.id, this.owner);
      }
    }
    return claimed.length;
  }

  private async step(claimed: Task): Promise<void> {
    let task = claimed;
    if (task.status === "queued") {
      this.tasks.incrementAttempts(task.id);
      task = this.tasks.transition(task.id, "queued", "running", "claimed", {}, { owner: this.owner });
    }
    if (task.status === "running") return this.stepRunning(task);
    if (task.status === "verifying") return this.stepVerifying(task);
  }

  private async stepRunning(claimed: Task): Promise<void> {
    let task = claimed;
    const version = this.processes.getVersion(task.processVersionId);
    if (!version) throw new Error(`Brak wersji procesu ${task.processVersionId}`);
    const definition = version.definition;

    // 1. Sesja — bez skutków ubocznych, więc można ponawiać przy błędach połączenia.
    let sessionId = task.hermesSessionId;
    if (!sessionId) {
      try {
        sessionId = (await this.hermes.createSession()).sessionId;
      } catch (error) {
        return this.transientError(task, "hermes-error", `Nie udało się utworzyć sesji Hermesa: ${String(error)}`);
      }
      this.tasks.setHermesSession(task.id, sessionId, task.attempts);
      task = { ...task, hermesSessionId: sessionId, hermesSessionAttempt: task.attempts };
    }
    const marker = taskMarker(task.id, task.attempts);

    // 2. Zlecenie — najpierw zapis „mogło zostać wysłane”, potem jedno wywołanie. Bez ponowień.
    if (!task.promptSubmittedAt) {
      const account = resolveAccount(definition);
      const prompt = buildPrompt({
        taskId: task.id,
        attempt: task.attempts,
        // Sesja z wcześniejszej próby = świadome „Dokończ” użytkownika.
        continuation: task.hermesSessionAttempt !== null && task.hermesSessionAttempt < task.attempts,
        processKey: definition.key,
        processVersion: version.version,
        accountAlias: account.alias,
        instruction: renderTemplate(definition.execution.instruction, task.params),
        params: task.params,
      });
      this.tasks.markPromptSubmitting(task.id);
      try {
        await this.hermes.submitPrompt(sessionId, prompt);
        this.tasks.addEvent(task.id, "prompt-submitted", null, null);
      } catch (error) {
        // Nie wiemy, czy Hermes przyjął zlecenie. Stan rozstrzygnie odczyt sesji — nie ponowienie.
        this.tasks.addEvent(task.id, "prompt-submit-error", null, null, { error: String(error) });
      }
      return;
    }

    // 3. Odczyt stanu z Hermesa.
    let state;
    try {
      state = await this.hermes.inspect(sessionId, marker);
    } catch (error) {
      return this.transientError(task, "hermes-error", `Brak połączenia z Hermesem: ${String(error)}`);
    }

    switch (state.kind) {
      case "running": {
        const elapsed = this.now().getTime() - new Date(task.promptSubmittedAt).getTime();
        if (elapsed > this.maxRunMs) {
          this.toAttention(task.id, "Zadanie trwa dłużej niż zwykle. Sprawdź stan w Hermesie.");
        }
        return;
      }
      case "completed":
        this.tasks.transition(task.id, "running", "verifying", "execution-completed", {
          result: { summary: "Weryfikuję wynik…", simulated: this.simulated, report: state.report } satisfies TaskResult,
        });
        return;
      case "failed":
        this.tasks.transition(task.id, "running", "failed", "execution-failed", {
          result: this.result(definition, task, { problem: state.error }),
        });
        return;
      case "clarify":
        this.toAttention(task.id, "Hermes prosi o doprecyzowanie. Odpowiadanie z aplikacji pojawi się w kolejnym etapie.", state.question);
        return;
      case "approval":
        this.toAttention(task.id, "Hermes prosi o zgodę. Odpowiadanie z aplikacji pojawi się w kolejnym etapie.", state.description);
        return;
      case "not-received":
        this.toAttention(task.id, "Nie wiadomo, czy Hermes przyjął zlecenie. Nie ponawiam automatycznie, żeby nie wykonać go dwa razy.");
        return;
      case "lost":
        this.toAttention(task.id, "Hermes nie zna już sesji tego zadania. Sprawdź, czy zadanie zostało wykonane, zanim je ponowisz.");
        return;
    }
  }

  private async stepVerifying(task: Task): Promise<void> {
    const version = this.processes.getVersion(task.processVersionId);
    if (!version) throw new Error(`Brak wersji procesu ${task.processVersionId}`);
    const definition = version.definition;
    const verification = definition.verification;
    const previous = (task.result ?? {}) as Partial<TaskResult>;

    if (verification.kind !== "file-count-match") {
      this.toAttention(task.id, `Brak automatycznej weryfikacji typu ${verification.kind}.`);
      return;
    }

    const account = resolveAccount(definition);
    // Raport Hermesa wskazuje tylko GDZIE liczyć (rzeczywista nazwa i ID folderów). Liczymy sami.
    const reported = previous.report ? parseReportResult(previous.report) : null;
    const folderParams = { ...task.params, ...(reported?.source_folder_name ? { folder: reported.source_folder_name } : {}) };
    const source: FolderRef = {
      path: renderTemplate(verification.sourcePath, folderParams),
      ...(reported?.source_folder_id ? { id: reported.source_folder_id } : {}),
    };
    const target: FolderRef = {
      path: renderTemplate(verification.targetPath, folderParams),
      ...(reported?.destination_folder_id ? { id: reported.destination_folder_id } : {}),
    };
    let expected: number | null;
    let actual: number | null;
    try {
      expected = await this.files.countFiles(account.alias, source);
      actual = await this.files.countFiles(account.alias, target);
    } catch (error) {
      return this.transientError(task, "verification-error", `Nie udało się policzyć plików: ${String(error)}`);
    }

    const passed = expected !== null && expected > 0 && actual === expected;
    const check = { expected, actual, passed };
    const extras = {
      ...(previous.report ? { report: previous.report } : {}),
      ...(reported?.destination_url ? { link: reported.destination_url } : {}),
      ...(reported?.source_folder_name ? { resolvedFolder: reported.source_folder_name } : {}),
    };
    if (passed) {
      this.tasks.transition(task.id, "verifying", "succeeded", "verified", {
        result: {
          summary: renderTemplate(definition.reporting.success, { ...folderParams, verified: `${actual}/${expected}` }),
          simulated: this.simulated,
          verification: check,
          ...extras,
        } satisfies TaskResult,
      });
    } else {
      this.tasks.transition(task.id, "verifying", "needs_attention", "verification-failed", {
        result: {
          summary: `Weryfikacja nie przeszła: ${actual ?? "brak folderu"}/${expected ?? "brak folderu"} plików.`,
          simulated: this.simulated,
          verification: check,
          problem: "Liczba plików wynikowych nie zgadza się z liczbą zdjęć źródłowych.",
          ...extras,
        } satisfies TaskResult,
      });
    }
  }

  private transientError(task: Task, type: string, message: string): void {
    this.tasks.addEvent(task.id, type, null, null, { error: message });
    const since = this.tasks.lastEventId(task.id, "claimed");
    if (this.tasks.countEvents(task.id, type, since) >= this.maxTransientErrors) {
      this.toAttention(task.id, message);
    }
  }

  private toAttention(taskId: string, problem: string, question?: string): void {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== "running" && task.status !== "verifying")) return;
    const previous = (task.result ?? {}) as Partial<TaskResult>;
    this.tasks.transition(taskId, task.status, "needs_attention", "needs-attention", {
      result: {
        summary: problem,
        simulated: this.simulated,
        ...(previous.report ? { report: previous.report } : {}),
        problem,
        ...(question ? { question } : {}),
      } satisfies TaskResult,
    });
  }

  private result(definition: ProcessDefinition, task: Task, extra: { problem: string }): TaskResult {
    let summary: string;
    try {
      summary = renderTemplate(definition.reporting.failure, { ...task.params, reason: extra.problem });
    } catch {
      summary = extra.problem;
    }
    return { summary, simulated: this.simulated, problem: extra.problem };
  }
}
