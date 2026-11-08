import { redact } from "@/core/redact";
import { loadConfig } from "@/server/config";
import { createRuntime } from "@/server/runtime";
import { Worker } from "./worker";

function log(message: string, data?: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...(data ? { data: redact(data) } : {}) }));
}

const config = loadConfig();
const runtime = createRuntime(config);
const worker = new Worker(runtime.tasks, runtime.processes, runtime.hermes, runtime.files, { log });

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function loop(): Promise<void> {
  if (stopping) return;
  try {
    await worker.tick();
  } catch (error) {
    log("tick failed", { error: String(error) });
  }
  if (!stopping) timer = setTimeout(() => void loop(), config.workerPollMs);
}

function stop(signal: string): void {
  log("worker stopping", { signal });
  stopping = true;
  if (timer) clearTimeout(timer);
  runtime.db.close();
  process.exit(0);
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

log("worker started", { owner: worker.owner, hermesMode: runtime.hermes.mode, pollMs: config.workerPollMs });
void loop();
