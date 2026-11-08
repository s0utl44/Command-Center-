import { loadConfig } from "./config";
import { createRuntime, type Runtime } from "./runtime";

const holder = globalThis as typeof globalThis & { __asystentRuntime?: Runtime };

/** Jeden runtime na proces `web` (leniwie — build Next.js nie otwiera bazy). */
export function getRuntime(): Runtime {
  holder.__asystentRuntime ??= createRuntime(loadConfig());
  return holder.__asystentRuntime;
}
