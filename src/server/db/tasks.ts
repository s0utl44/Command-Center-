import { randomUUID } from "node:crypto";
import type { ApprovalReason } from "@/core/policy";
import type { MissingParam } from "@/core/router";
import { assertTransition, type TaskStatus } from "@/core/task";
import type { Db } from "./index";

export interface Task {
  id: string;
  idempotencyKey: string;
  processVersionId: number;
  status: TaskStatus;
  utterance: string;
  params: Record<string, string>;
  missing: MissingParam[];
  approvalReasons: ApprovalReason[];
  result: unknown;
  hermesSessionId: string | null;
  /** Numer próby, w której utworzono sesję — późniejsza próba w tej samej sesji to kontynuacja. */
  hermesSessionAttempt: number | null;
  promptSubmittedAt: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  at: string;
  type: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  data: unknown;
}

interface TaskRow {
  id: string;
  idempotency_key: string;
  process_version_id: number;
  status: TaskStatus;
  utterance: string;
  params_json: string;
  missing_json: string;
  approval_reasons_json: string;
  result_json: string | null;
  hermes_session_id: string | null;
  hermes_session_attempt: number | null;
  prompt_submitted_at: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: number;
  task_id: string;
  at: string;
  type: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  data_json: string | null;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    processVersionId: row.process_version_id,
    status: row.status,
    utterance: row.utterance,
    params: JSON.parse(row.params_json) as Record<string, string>,
    missing: JSON.parse(row.missing_json) as MissingParam[],
    approvalReasons: JSON.parse(row.approval_reasons_json) as ApprovalReason[],
    result: row.result_json === null ? null : (JSON.parse(row.result_json) as unknown),
    hermesSessionId: row.hermes_session_id,
    hermesSessionAttempt: row.hermes_session_attempt,
    promptSubmittedAt: row.prompt_submitted_at,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class StaleTaskError extends Error {
  constructor(taskId: string, expected: TaskStatus) {
    super(`Zadanie ${taskId} nie jest już w stanie ${expected}`);
    this.name = "StaleTaskError";
  }
}

export interface CreateTaskInput {
  idempotencyKey: string;
  processVersionId: number;
  status: TaskStatus;
  utterance: string;
  params: Record<string, string>;
  missing: MissingParam[];
  approvalReasons: ApprovalReason[];
}

export interface TransitionPatch {
  params?: Record<string, string>;
  missing?: MissingParam[];
  approvalReasons?: ApprovalReason[];
  result?: unknown;
}

export class TaskRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Tworzy zadanie; jeśli klucz idempotencji już istnieje, zwraca istniejące (bez duplikatu). */
  create(input: CreateTaskInput): { task: Task; duplicate: boolean } {
    return this.db.transaction(() => {
      const existing = this.getByIdempotencyKey(input.idempotencyKey);
      if (existing) return { task: existing, duplicate: true };
      const id = randomUUID();
      const at = this.now().toISOString();
      this.db
        .prepare(
          `INSERT INTO tasks (id, idempotency_key, process_version_id, status, utterance, params_json, missing_json,
             approval_reasons_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.idempotencyKey,
          input.processVersionId,
          input.status,
          input.utterance,
          JSON.stringify(input.params),
          JSON.stringify(input.missing),
          JSON.stringify(input.approvalReasons),
          at,
          at,
        );
      this.addEvent(id, "created", null, input.status, { utterance: input.utterance });
      return { task: this.get(id) as Task, duplicate: false };
    })();
  }

  get(id: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? toTask(row) : undefined;
  }

  getByIdempotencyKey(key: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE idempotency_key = ?").get(key) as TaskRow | undefined;
    return row ? toTask(row) : undefined;
  }

  list(limit = 100): Task[] {
    const rows = this.db.prepare("SELECT * FROM tasks ORDER BY created_at DESC, rowid DESC LIMIT ?").all(limit) as TaskRow[];
    return rows.map(toTask);
  }

  /**
   * Atomowa zmiana stanu: sprawdza dozwolone przejście i to, że nikt inny nie zmienił
   * zadania w międzyczasie (optymistyczna blokada na `status`). Zapisuje zdarzenie.
   */
  transition(id: string, from: TaskStatus, to: TaskStatus, type: string, patch: TransitionPatch = {}, data?: unknown): Task {
    assertTransition(from, to);
    return this.db.transaction(() => {
      const current = this.get(id);
      if (!current) throw new Error(`Nie ma zadania ${id}`);
      const info = this.db
        .prepare(
          `UPDATE tasks SET status = ?, params_json = ?, missing_json = ?, approval_reasons_json = ?, result_json = ?, updated_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(
          to,
          JSON.stringify(patch.params ?? current.params),
          JSON.stringify(patch.missing ?? current.missing),
          JSON.stringify(patch.approvalReasons ?? current.approvalReasons),
          patch.result === undefined ? (current.result === null ? null : JSON.stringify(current.result)) : JSON.stringify(patch.result),
          this.now().toISOString(),
          id,
          from,
        );
      if (info.changes !== 1) throw new StaleTaskError(id, from);
      this.addEvent(id, type, from, to, data);
      return this.get(id) as Task;
    })();
  }

  /**
   * Przejmuje do `limit` zadań wymagających pracy workera: w kolejce albo w toku/weryfikacji
   * bez ważnej dzierżawy (np. po awarii innego workera). Atomowe — dwa workery nie wezmą tego samego.
   */
  claimNext(owner: string, leaseMs: number, limit = 5): Task[] {
    return this.db.transaction(() => {
      const now = this.now();
      const rows = this.db
        .prepare(
          `SELECT id FROM tasks
           WHERE status IN ('queued', 'running', 'verifying')
             AND (lease_until IS NULL OR lease_until < ?)
           ORDER BY created_at, rowid LIMIT ?`,
        )
        .all(now.toISOString(), limit) as { id: string }[];
      const until = new Date(now.getTime() + leaseMs).toISOString();
      const claim = this.db.prepare(
        "UPDATE tasks SET lease_owner = ?, lease_until = ? WHERE id = ? AND (lease_until IS NULL OR lease_until < ?)",
      );
      return rows.filter((r) => claim.run(owner, until, r.id, now.toISOString()).changes === 1).map((r) => this.get(r.id) as Task);
    })();
  }

  releaseLease(id: string, owner: string): void {
    this.db.prepare("UPDATE tasks SET lease_owner = NULL, lease_until = NULL WHERE id = ? AND lease_owner = ?").run(id, owner);
  }

  incrementAttempts(id: string): void {
    this.db.prepare("UPDATE tasks SET attempts = attempts + 1 WHERE id = ?").run(id);
  }

  /** Zapisuje sesję Hermesa ZANIM wyślemy zlecenie — po awarii wiemy, gdzie szukać. */
  setHermesSession(id: string, sessionId: string, attempt: number): void {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE tasks SET hermes_session_id = ?, hermes_session_attempt = ?, updated_at = ? WHERE id = ?")
        .run(sessionId, attempt, this.now().toISOString(), id);
      this.addEvent(id, "session-created", null, null, { sessionId, attempt });
    })();
  }

  /**
   * Oznacza, że zlecenie MOGŁO zostać wysłane. Zapisywane przed `prompt.submit`, więc po awarii
   * nigdy nie wyślemy go drugi raz — tylko odczytamy stan sesji.
   */
  markPromptSubmitting(id: string): void {
    this.db.transaction(() => {
      this.db.prepare("UPDATE tasks SET prompt_submitted_at = ?, updated_at = ? WHERE id = ?").run(this.now().toISOString(), this.now().toISOString(), id);
      this.addEvent(id, "prompt-submitting", null, null);
    })();
  }

  /** Czyści powiązanie z Hermesem — tylko przy świadomym ponowieniu „od nowa” przez użytkownika. */
  clearExecution(id: string): void {
    this.db
      .prepare("UPDATE tasks SET hermes_session_id = NULL, hermes_session_attempt = NULL, prompt_submitted_at = NULL, updated_at = ? WHERE id = ?")
      .run(this.now().toISOString(), id);
  }

  /** Zachowuje sesję, pozwala wysłać nowe zlecenie (kontynuację) — tylko po świadomym „Dokończ”. */
  clearPromptSubmission(id: string): void {
    this.db.prepare("UPDATE tasks SET prompt_submitted_at = NULL, updated_at = ? WHERE id = ?").run(this.now().toISOString(), id);
  }

  lastEventId(taskId: string, type: string): number {
    const row = this.db.prepare("SELECT MAX(id) AS id FROM task_events WHERE task_id = ? AND type = ?").get(taskId, type) as { id: number | null };
    return row.id ?? 0;
  }

  countEvents(taskId: string, type: string, sinceEventId = 0): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM task_events WHERE task_id = ? AND type = ? AND id > ?")
      .get(taskId, type, sinceEventId) as { c: number };
    return row.c;
  }

  addEvent(taskId: string, type: string, from: TaskStatus | null, to: TaskStatus | null, data?: unknown): void {
    this.db
      .prepare("INSERT INTO task_events (task_id, at, type, from_status, to_status, data_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(taskId, this.now().toISOString(), type, from, to, data === undefined ? null : JSON.stringify(data));
  }

  events(taskId: string): TaskEvent[] {
    const rows = this.db.prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY id").all(taskId) as EventRow[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      at: r.at,
      type: r.type,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      data: r.data_json === null ? null : (JSON.parse(r.data_json) as unknown),
    }));
  }
}
