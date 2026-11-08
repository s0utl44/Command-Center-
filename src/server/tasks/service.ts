import { resolveAccount } from "@/core/connections";
import type { ProcessDefinition } from "@/core/process";
import { approvalReasons, type ApprovalReason } from "@/core/policy";
import { completeParams, missingParams, route, type MissingParam } from "@/core/router";
import type { TaskStatus } from "@/core/task";
import type { ProcessRepository } from "../db/processes";
import type { Task, TaskRepository } from "../db/tasks";

export type SubmitResult =
  | { kind: "task"; task: Task; duplicate: boolean }
  | { kind: "ambiguous"; candidates: { key: string; name: string }[] }
  | { kind: "no-match" };

function nextStatus(missing: MissingParam[], reasons: ApprovalReason[]): TaskStatus {
  if (missing.length > 0) return "needs_input";
  if (reasons.length > 0) return "awaiting_approval";
  return "queued";
}

/** Przyjmowanie poleceń i decyzji użytkownika. Nie wykonuje niczego — wykonanie należy do workera. */
export class TaskService {
  constructor(
    private readonly processes: ProcessRepository,
    private readonly tasks: TaskRepository,
  ) {}

  submitUtterance(input: { utterance: string; idempotencyKey: string }): SubmitResult {
    const utterance = input.utterance.trim();
    if (!utterance) return { kind: "no-match" };
    const existing = this.tasks.getByIdempotencyKey(input.idempotencyKey);
    if (existing) return { kind: "task", task: existing, duplicate: true };

    const versions = this.processes.listActive();
    const result = route(
      utterance,
      versions.map((v) => v.definition),
    );
    if (result.kind === "no-match") return result;
    if (result.kind === "ambiguous") {
      return { kind: "ambiguous", candidates: result.candidates.map((p) => ({ key: p.key, name: p.name })) };
    }
    const version = versions.find((v) => v.definition.key === result.process.key);
    if (!version) throw new Error(`Brak aktywnej wersji procesu ${result.process.key}`);
    resolveAccount(version.definition);

    const reasons = approvalReasons(version.definition, { utterance });
    const { task, duplicate } = this.tasks.create({
      idempotencyKey: input.idempotencyKey,
      processVersionId: version.id,
      status: nextStatus(result.missing, reasons),
      utterance,
      params: result.params,
      missing: result.missing,
      approvalReasons: reasons,
    });
    return { kind: "task", task, duplicate };
  }

  /** Uzupełnienie brakujących parametrów odpowiedziami użytkownika. */
  provideParams(taskId: string, values: Record<string, string>): Task {
    const task = this.require(taskId);
    if (task.status !== "needs_input") throw new Error("Zadanie nie czeka na dane");
    const definition = this.definitionOf(task);
    const known = new Set(definition.params.map((p) => p.name));
    const cleaned = Object.fromEntries(
      Object.entries(values)
        .filter(([name]) => known.has(name))
        .map(([name, value]) => [name, value.trim()])
        .filter(([, value]) => value !== ""),
    );
    // Wartości wyprowadzone (np. typ oferty z folderu) liczymy od nowa, gdy zmienia się źródło.
    const base = { ...task.params, ...cleaned };
    for (const def of definition.params) {
      if (def.derive && cleaned[def.derive.from] !== undefined && cleaned[def.name] === undefined) delete base[def.name];
    }
    const params = completeParams(definition.params, base);
    const missing = missingParams(definition.params, params);
    const status = nextStatus(missing, task.approvalReasons);
    return this.tasks.transition(task.id, "needs_input", status, "params-provided", { params, missing }, { values: cleaned });
  }

  approve(taskId: string): Task {
    const task = this.require(taskId);
    return this.tasks.transition(task.id, "awaiting_approval", "queued", "approved", {}, { reasons: task.approvalReasons });
  }

  cancel(taskId: string): Task {
    const task = this.require(taskId);
    return this.tasks.transition(task.id, task.status, "cancelled", "cancelled");
  }

  definitionOf(task: Task): ProcessDefinition {
    const version = this.processes.getVersion(task.processVersionId);
    if (!version) throw new Error(`Brak wersji procesu ${task.processVersionId}`);
    return version.definition;
  }

  private require(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Nie ma zadania ${taskId}`);
    return task;
  }
}
