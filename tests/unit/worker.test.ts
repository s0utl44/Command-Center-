import { describe, expect, it } from "vitest";
import type { HermesGateway } from "@/core/execution";
import { SEED_PROCESSES } from "@/core/processes";
import type { TaskResult } from "@/core/task-result";
import { openDb } from "@/server/db";
import { ProcessRepository } from "@/server/db/processes";
import { TaskRepository } from "@/server/db/tasks";
import { MockWorld, mockSourceCount, type MockOutcome } from "@/server/mock/world";
import { TaskService } from "@/server/tasks/service";
import { Worker } from "@/worker/worker";

const DURATION = 10_000;

function setup(opts: { outcome?: MockOutcome; hermes?: (base: HermesGateway) => HermesGateway } = {}) {
  let clock = new Date("2026-11-08T10:00:00Z").getTime();
  const now = () => new Date(clock);
  const advance = (ms: number) => {
    clock += ms;
  };
  const db = openDb(":memory:");
  const processes = new ProcessRepository(db, now);
  processes.seed(SEED_PROCESSES);
  const tasks = new TaskRepository(db, now);
  const service = new TaskService(processes, tasks);
  const world = new MockWorld(db, { now, durationMs: DURATION, ...(opts.outcome ? { outcomeFor: () => opts.outcome! } : {}) });
  const hermes = opts.hermes ? opts.hermes(world.hermes) : world.hermes;
  const makeWorker = (owner = "w1") => new Worker(tasks, processes, hermes, world.drive, { owner, now, leaseMs: 60_000, maxTransientErrors: 3 });

  function submit(utterance = "Obrób zdjęcia z folderu WS Mokotów") {
    const r = service.submitUtterance({ utterance, idempotencyKey: `k-${Math.random()}` });
    if (r.kind !== "task") throw new Error("brak zadania");
    return r.task;
  }

  /** Uruchamia worker do skutku: ticki z przesuwaniem zegara. */
  async function runToEnd(worker: Worker, id: string, maxTicks = 20) {
    for (let i = 0; i < maxTicks; i++) {
      await worker.tick();
      const t = tasks.get(id)!;
      if (["succeeded", "failed", "needs_attention", "cancelled"].includes(t.status)) return t;
      advance(DURATION / 2);
    }
    return tasks.get(id)!;
  }

  return { db, tasks, service, world, makeWorker, submit, runToEnd, advance, now };
}

const result = (r: unknown) => r as TaskResult;

describe("worker — ścieżka szczęśliwa (SYMULACJA)", () => {
  it("wykonuje, weryfikuje N/N i oznacza wynik jako symulowany", async () => {
    const s = setup();
    const task = s.submit();
    const done = await s.runToEnd(s.makeWorker(), task.id);
    const n = mockSourceCount("WS Mokotów");

    expect(done.status).toBe("succeeded");
    expect(result(done.result).simulated).toBe(true);
    expect(result(done.result).verification).toEqual({ expected: n, actual: n, passed: true });
    expect(result(done.result).summary).toBe(`Obrobiono ${n}/${n} zdjęć z folderu WS Mokotów.`);
    expect(result(done.result).resolvedFolder).toBe("WS Mokotów");
    expect(result(done.result).link).toMatch(/^https:\/\/example\.invalid\/symulacja\//);
    expect(s.world.submitCount()).toBe(1);
    expect(s.tasks.events(task.id).map((e) => e.type)).toEqual([
      "created",
      "claimed",
      "session-created",
      "prompt-submitting",
      "prompt-submitted",
      "execution-completed",
      "verified",
    ]);
  });

  it("nie rusza zadań czekających na dane lub zgodę", async () => {
    const s = setup();
    const task = s.submit("Obrób zdjęcia");
    await s.makeWorker().tick();
    expect(s.tasks.get(task.id)!.status).toBe("needs_input");
    expect(s.world.submitCount()).toBe(0);
  });
});

describe("worker — wyniki inne niż sukces", () => {
  it("brakujący plik → weryfikacja nie przechodzi → wymaga uwagi", async () => {
    const s = setup({ outcome: "partial" });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    const n = mockSourceCount("WS Mokotów");
    expect(done.status).toBe("needs_attention");
    expect(result(done.result).verification).toEqual({ expected: n, actual: n - 1, passed: false });
  });

  it("błąd wykonania → failed", async () => {
    const s = setup({ outcome: "fail" });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    expect(done.status).toBe("failed");
    expect(result(done.result).problem).toMatch(/SYMULACJA/);
  });

  it("pytanie od Hermesa → wymaga uwagi z treścią pytania", async () => {
    const s = setup({ outcome: "clarify" });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    expect(done.status).toBe("needs_attention");
    expect(result(done.result).question).toMatch(/który wybrać/);
  });

  it("zgubiona sesja → wymaga uwagi, bez ponownego wysłania", async () => {
    const s = setup({ outcome: "lost" });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    expect(done.status).toBe("needs_attention");
    expect(s.world.submitCount()).toBe(1);
  });
});

describe("worker — awarie i restart", () => {
  it("restart po utworzeniu sesji, przed wysłaniem → wysyła dokładnie raz", async () => {
    const s = setup();
    const task = s.submit();
    // Symulacja: worker A przejął zadanie, utworzył sesję i zginął, nie zwalniając dzierżawy.
    s.tasks.claimNext("dead-worker", 60_000);
    s.tasks.transition(task.id, "queued", "running", "claimed");
    const { sessionId } = await s.world.hermes.createSession();
    s.tasks.setHermesSession(task.id, sessionId, 1);

    const worker = s.makeWorker("w2");
    expect(await worker.tick()).toBe(0); // dzierżawa martwego workera jeszcze ważna
    s.advance(61_000);
    const done = await s.runToEnd(worker, task.id);
    expect(done.status).toBe("succeeded");
    expect(s.world.submitCount(sessionId)).toBe(1);
    expect(done.hermesSessionId).toBe(sessionId);
  });

  it("restart po wysłaniu → nie wysyła drugi raz, tylko odczytuje stan i kończy", async () => {
    const s = setup();
    const task = s.submit();
    const first = s.makeWorker("w1");
    await first.tick(); // claim + sesja + submit
    expect(s.world.submitCount()).toBe(1);

    const second = s.makeWorker("w2"); // „nowy proces” po restarcie
    const done = await s.runToEnd(second, task.id);
    expect(done.status).toBe("succeeded");
    expect(s.world.submitCount()).toBe(1);
  });

  it("błąd sieci przy wysyłaniu (zlecenie nie dotarło) → wymaga uwagi, bez ponowienia", async () => {
    const s = setup({
      hermes: (base) => ({
        ...base,
        submitPrompt: async () => {
          throw new Error("connection reset");
        },
      }),
    });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    expect(done.status).toBe("needs_attention");
    expect(result(done.result).problem).toMatch(/Nie ponawiam/);
    expect(s.tasks.countEvents(done.id, "prompt-submitting")).toBe(1);
  });

  it("Hermes niedostępny przy tworzeniu sesji → kilka prób, potem wymaga uwagi", async () => {
    let calls = 0;
    const s = setup({
      hermes: (base) => ({
        ...base,
        createSession: async () => {
          calls++;
          throw new Error("ECONNREFUSED");
        },
      }),
    });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    expect(done.status).toBe("needs_attention");
    expect(calls).toBe(3);
    expect(s.world.submitCount()).toBe(0);
  });

  it("chwilowa utrata połączenia podczas wykonywania nie przerywa zadania", async () => {
    let failInspect = 2;
    const s = setup({
      hermes: (base) => ({
        ...base,
        inspect: async (id, marker) => {
          if (failInspect-- > 0) throw new Error("socket closed");
          return base.inspect(id, marker);
        },
      }),
    });
    const done = await s.runToEnd(s.makeWorker(), s.submit().id);
    expect(done.status).toBe("succeeded");
  });

  it("zbyt długie wykonanie → wymaga uwagi", async () => {
    const s = setup();
    const worker = new Worker(s.tasks, new ProcessRepository(s.db, s.now), s.world.hermes, s.world.drive, {
      now: s.now,
      maxRunMs: 5_000,
    });
    const task = s.submit();
    await worker.tick();
    s.advance(6_000);
    await worker.tick();
    expect(s.tasks.get(task.id)!.status).toBe("needs_attention");
  });

  it("dwa workery nie przejmują tego samego zadania", () => {
    const s = setup();
    s.submit();
    expect(s.tasks.claimNext("a", 60_000)).toHaveLength(1);
    expect(s.tasks.claimNext("b", 60_000)).toHaveLength(0);
  });

  it("„Dokończ” po niepełnym wyniku: nowe zlecenie w tej samej sesji, potem N/N", async () => {
    const s = setup({ outcome: "partial" });
    const task = s.submit();
    const worker = s.makeWorker();
    const attention = await s.runToEnd(worker, task.id);
    expect(attention.status).toBe("needs_attention");
    const sessionId = attention.hermesSessionId!;

    const retried = s.service.retry(task.id, "continue");
    expect(retried.status).toBe("queued");
    expect(retried.hermesSessionId).toBe(sessionId);

    const done = await s.runToEnd(worker, task.id);
    expect(done.status).toBe("succeeded");
    expect(done.hermesSessionId).toBe(sessionId);
    expect(done.attempts).toBe(2);
    expect(s.world.submitCount(sessionId)).toBe(2); // jedno zlecenie na każdą świadomą próbę
    expect(s.tasks.events(task.id).find((e) => e.type === "retried")?.data).toMatchObject({ mode: "continue" });
  });

  it("„Dokończ” bez sesji zamienia się w ponowienie od nowa", async () => {
    const s = setup();
    const task = s.submit();
    s.tasks.transition(task.id, "queued", "running", "claimed");
    s.tasks.transition(task.id, "running", "needs_attention", "needs-attention");
    const retried = s.service.retry(task.id, "continue");
    expect(s.tasks.events(task.id).at(-1)?.data).toMatchObject({ mode: "fresh" });
    expect(retried.hermesSessionId).toBeNull();
  });

  it("świadome ponowienie od nowa tworzy nową sesję i kończy zadanie", async () => {
    let outcome: MockOutcome = "lost";
    const s = setup();
    const world = new MockWorld(s.db, { now: s.now, durationMs: DURATION, outcomeFor: () => outcome });
    const worker = new Worker(s.tasks, new ProcessRepository(s.db, s.now), world.hermes, world.drive, { now: s.now });
    const task = s.submit();
    const attention = await s.runToEnd(worker, task.id);
    expect(attention.status).toBe("needs_attention");

    outcome = "success";
    const retried = s.service.retry(task.id, "fresh");
    expect(retried.status).toBe("queued");
    expect(retried.hermesSessionId).toBeNull();
    const done = await s.runToEnd(worker, task.id);
    expect(done.status).toBe("succeeded");
    expect(done.hermesSessionId).not.toBe(attention.hermesSessionId);
  });
});
