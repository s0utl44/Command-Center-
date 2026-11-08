import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseProcessDefinition } from "@/core/process";
import { SEED_PROCESSES } from "@/core/processes";
import { wrePhotoEditV1 } from "@/core/processes/wre-photo-edit";
import { openDb } from "@/server/db";
import { ProcessRepository } from "@/server/db/processes";
import { StaleTaskError, TaskRepository } from "@/server/db/tasks";
import { TaskService } from "@/server/tasks/service";

function setup(path = ":memory:") {
  const db = openDb(path);
  const processes = new ProcessRepository(db);
  processes.seed(SEED_PROCESSES);
  const tasks = new TaskRepository(db);
  return { db, processes, tasks, service: new TaskService(processes, tasks) };
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("procesy w bazie", () => {
  it("seed jest idempotentny", () => {
    const { processes } = setup();
    processes.seed(SEED_PROCESSES);
    expect(processes.history("wre-photo-edit")).toHaveLength(1);
  });

  it("nowa wersja nie zmienia starej, a zadania pamiętają swoją wersję", () => {
    const { processes, service } = setup();
    const v1 = processes.getActive("wre-photo-edit")!;
    const created = service.submitUtterance({ utterance: "Obrób zdjęcia WS Wola", idempotencyKey: "k1" });
    if (created.kind !== "task") throw new Error("brak zadania");

    const changed = parseProcessDefinition({ ...wrePhotoEditV1, description: "Zmieniony opis" });
    const v2 = processes.addVersion(changed, "Korekta opisu");

    expect(v2.version).toBe(2);
    expect(processes.getActive("wre-photo-edit")!.id).toBe(v2.id);
    expect(processes.getVersion(v1.id)!.definition.description).toBe(v1.definition.description);
    expect(created.task.processVersionId).toBe(v1.id);
    expect(processes.history("wre-photo-edit").map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("zadania", () => {
  it("kompletne polecenie od razu trafia do kolejki", () => {
    const { service, tasks } = setup();
    const r = service.submitUtterance({ utterance: "Obrób zdjęcia z folderu WS Mokotów", idempotencyKey: "a" });
    expect(r.kind).toBe("task");
    if (r.kind !== "task") return;
    expect(r.task.status).toBe("queued");
    expect(r.task.params.folder).toBe("WS Mokotów");
    expect(tasks.events(r.task.id).map((e) => e.type)).toEqual(["created"]);
  });

  it("ten sam klucz idempotencji nie tworzy duplikatu", () => {
    const { service, tasks } = setup();
    const a = service.submitUtterance({ utterance: "Obrób zdjęcia WS Wola", idempotencyKey: "same" });
    const b = service.submitUtterance({ utterance: "Obrób zdjęcia WS Wola", idempotencyKey: "same" });
    expect(a.kind === "task" && b.kind === "task" && a.task.id === b.task.id).toBe(true);
    expect(b.kind === "task" && b.duplicate).toBe(true);
    expect(tasks.list()).toHaveLength(1);
  });

  it("brakujący folder → pytanie, odpowiedź → kolejka", () => {
    const { service, tasks } = setup();
    const r = service.submitUtterance({ utterance: "Obrób zdjęcia", idempotencyKey: "b" });
    if (r.kind !== "task") throw new Error("brak zadania");
    expect(r.task.status).toBe("needs_input");
    expect(r.task.missing.map((m) => m.name)).toEqual(["folder"]);

    const after = service.provideParams(r.task.id, { folder: "WN Wola 12" });
    expect(after.status).toBe("queued");
    expect(after.params).toMatchObject({ folder: "WN Wola 12", listing_type: "wynajem" });
    expect(tasks.events(r.task.id).map((e) => e.type)).toEqual(["created", "params-provided"]);
  });

  it("odrzuca wartość spoza listy wyboru i pyta dalej", () => {
    const { service, processes, tasks } = setup();
    const base = processes.getActive("wre-photo-edit")!.definition;
    processes.addVersion(
      { ...base, params: base.params.map((p) => (p.name === "listing_type" ? { ...p, required: true, default: undefined, options: ["wynajem", "sprzedaż"] } : p)) },
      "Test: typ oferty wymagany",
    );
    const r = service.submitUtterance({ utterance: "Obrób zdjęcia z folderu Saska Kępa", idempotencyKey: "c" });
    if (r.kind !== "task") throw new Error("brak zadania");
    expect(r.task.status).toBe("needs_input");
    expect(service.provideParams(r.task.id, { listing_type: "dzierżawa" }).status).toBe("needs_input");
    expect(service.provideParams(r.task.id, { listing_type: "sprzedaż" }).status).toBe("queued");
    expect(tasks.get(r.task.id)!.params.listing_type).toBe("sprzedaż");
  });

  it("nie dopuszcza równoległej, sprzecznej zmiany stanu", () => {
    const { service, tasks } = setup();
    const r = service.submitUtterance({ utterance: "Obrób zdjęcia WS Wola", idempotencyKey: "d" });
    if (r.kind !== "task") throw new Error("brak zadania");
    tasks.transition(r.task.id, "queued", "running", "claimed");
    expect(() => tasks.transition(r.task.id, "queued", "cancelled", "cancelled")).toThrow(StaleTaskError);
  });

  it("nierozpoznane polecenie nie tworzy zadania", () => {
    const { service, tasks } = setup();
    expect(service.submitUtterance({ utterance: "Jaka jest pogoda?", idempotencyKey: "e" }).kind).toBe("no-match");
    expect(tasks.list()).toHaveLength(0);
  });

  it("zadanie przetrwa zamknięcie i ponowne otwarcie bazy", () => {
    const dir = mkdtempSync(join(tmpdir(), "asystent-"));
    dirs.push(dir);
    const path = join(dir, "app.db");
    const first = setup(path);
    const r = first.service.submitUtterance({ utterance: "Obrób zdjęcia", idempotencyKey: "f" });
    if (r.kind !== "task") throw new Error("brak zadania");
    first.db.close();

    const second = setup(path);
    const restored = second.tasks.get(r.task.id);
    expect(restored?.status).toBe("needs_input");
    expect(second.processes.history("wre-photo-edit")).toHaveLength(1);
    second.db.close();
  });
});
