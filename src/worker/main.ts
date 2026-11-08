import { createServer, type Server } from "node:http";
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
let lastTickAt: string | null = null;

/** Opcjonalny healthcheck (WORKER_HEALTH_PORT) — tylko na 127.0.0.1, do monitoringu i testów e2e. */
let health: Server | undefined;
const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? "");
if (Number.isInteger(healthPort) && healthPort > 0) {
  health = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, owner: worker.owner, lastTickAt }));
  }).listen(healthPort, "127.0.0.1");
}

async function loop(): Promise<void> {
  if (stopping) return;
  try {
    await worker.tick();
    lastTickAt = new Date().toISOString();
  } catch (error) {
    log("tick failed", { error: String(error) });
  }
  if (!stopping) timer = setTimeout(() => void loop(), config.workerPollMs);
}

function stop(signal: string): void {
  log("worker stopping", { signal });
  stopping = true;
  if (timer) clearTimeout(timer);
  health?.close();
  runtime.db.close();
  process.exit(0);
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

log("worker started", { owner: worker.owner, hermesMode: runtime.hermes.mode, pollMs: config.workerPollMs });
void loop();
