import { APPROVAL_REASON_LABEL } from "@/core/policy";
import { todayGroup } from "@/core/task";
import type { TaskResult } from "@/core/task-result";
import { STATUS_LABEL, type Snapshot, type TaskView } from "@/core/task-view";
import type { Runtime } from "../runtime";
import type { Task } from "../db/tasks";

export function toTaskView(runtime: Runtime, task: Task): TaskView {
  const version = runtime.processes.getVersion(task.processVersionId);
  const defs = version?.definition.params ?? [];
  const label = (name: string) => defs.find((d) => d.name === name)?.label ?? name;
  return {
    id: task.id,
    status: task.status,
    statusLabel: STATUS_LABEL[task.status],
    group: todayGroup(task.status),
    processKey: version?.processKey ?? "?",
    processName: version?.definition.name ?? "Nieznany proces",
    processVersion: version?.version ?? 0,
    utterance: task.utterance,
    params: Object.entries(task.params)
      .filter(([name]) => defs.some((d) => d.name === name))
      .map(([name, value]) => ({ name, label: label(name), value })),
    missing: task.missing.map((m) => ({ ...m, label: label(m.name) })),
    approvalReasons: task.approvalReasons.map((reason) => ({ reason, label: APPROVAL_REASON_LABEL[reason] })),
    result: (task.result as TaskResult | null) ?? null,
    attempts: task.attempts,
    canContinue: task.status === "needs_attention" && task.hermesSessionId !== null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function snapshot(runtime: Runtime, limit = 30): Snapshot {
  return {
    modes: { hermes: runtime.hermes.mode, stt: runtime.stt.mode },
    tasks: runtime.tasks.list(limit).map((t) => toTaskView(runtime, t)),
  };
}
