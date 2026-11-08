"use client";

import type { TaskView } from "@/core/task-view";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Błąd ${res.status}`, res.status);
  return body as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export type CommandResult =
  | { kind: "task"; duplicate: boolean; task: TaskView }
  | { kind: "ambiguous"; candidates: { key: string; name: string }[] }
  | { kind: "no-match" };

export const api = {
  transcribe(audio: Blob): Promise<{ text: string; simulated: boolean }> {
    const form = new FormData();
    form.append("audio", audio, "nagranie");
    return request("/api/transcribe", { method: "POST", body: form });
  },
  command: (utterance: string, idempotencyKey: string) => post<CommandResult>("/api/commands", { utterance, idempotencyKey }),
  provideParams: (id: string, values: Record<string, string>) => post<{ task: TaskView }>(`/api/tasks/${id}/params`, { values }),
  approve: (id: string) => post<{ task: TaskView }>(`/api/tasks/${id}/approve`),
  cancel: (id: string) => post<{ task: TaskView }>(`/api/tasks/${id}/cancel`),
  retry: (id: string, mode: "continue" | "fresh") => post<{ task: TaskView }>(`/api/tasks/${id}/retry`, { mode }),
};
