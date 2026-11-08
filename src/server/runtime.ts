import type { FileCounter, HermesGateway } from "@/core/execution";
import type { ConnectionStatusProvider } from "@/core/connection-status";
import type { SpeechToText } from "@/core/stt";
import { SEED_PROCESSES } from "@/core/processes";
import type { AppConfig } from "./config";
import { openDb, type Db } from "./db";
import { ProcessRepository } from "./db/processes";
import { TaskRepository } from "./db/tasks";
import { MockWorld } from "./mock/world";
import { createMockStt } from "./stt/mock";
import { uncheckedConnectionStatus } from "./connections/unchecked";
import { TaskService } from "./tasks/service";

export interface Runtime {
  db: Db;
  processes: ProcessRepository;
  tasks: TaskRepository;
  service: TaskService;
  hermes: HermesGateway;
  files: FileCounter;
  stt: SpeechToText;
  connections: ConnectionStatusProvider;
}

/** Składa zależności wspólne dla `web` i `worker`. */
export function createRuntime(config: AppConfig): Runtime {
  const db = openDb(config.databasePath);
  const processes = new ProcessRepository(db);
  processes.seed(SEED_PROCESSES);
  const tasks = new TaskRepository(db);

  if (config.hermesMode === "real") {
    // Etap 6: adapter WebSocket JSON-RPC wg kontraktu z docs/ARCHITECTURE.md.
    throw new Error("HERMES_MODE=real nie jest jeszcze zaimplementowany (etap 6). Użyj HERMES_MODE=mock.");
  }
  if (config.sttMode === "real") {
    throw new Error("STT_MODE=real nie jest jeszcze zaimplementowany (etap 7). Użyj STT_MODE=mock.");
  }
  const world = new MockWorld(db, { durationMs: config.mockHermesDurationMs });
  return {
    db,
    processes,
    tasks,
    service: new TaskService(processes, tasks),
    hermes: world.hermes,
    files: world.drive,
    stt: createMockStt(config.mockSttText),
    connections: uncheckedConnectionStatus,
  };
}
