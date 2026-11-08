import type { AdapterMode } from "@/core/execution";

export interface AppConfig {
  databasePath: string;
  hermesMode: AdapterMode;
  sttMode: AdapterMode;
  mockSttText: string;
  hermesWsUrl: string;
  workerPollMs: number;
  mockHermesDurationMs: number;
}

function mode(value: string | undefined, name: string): AdapterMode {
  if (value === undefined || value === "" || value === "mock") return "mock";
  if (value === "real") return "real";
  throw new Error(`${name} musi mieć wartość mock albo real`);
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} musi być dodatnią liczbą całkowitą`);
  return n;
}

/** Konfiguracja z env. Sekrety (HERMES_TOKEN) czytane wyłącznie przez adapter, nigdy nie trafiają do obiektu konfiguracji. */
export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  return {
    databasePath: env.DATABASE_PATH || "./data/app.db",
    hermesMode: mode(env.HERMES_MODE, "HERMES_MODE"),
    sttMode: mode(env.STT_MODE, "STT_MODE"),
    mockSttText: env.MOCK_STT_TEXT || "Obrób zdjęcia z Zyndrama 20 52",
    hermesWsUrl: env.HERMES_WS_URL || "ws://127.0.0.1:9119/api/ws",
    workerPollMs: positiveInt(env.WORKER_POLL_MS, 1500, "WORKER_POLL_MS"),
    mockHermesDurationMs: positiveInt(env.MOCK_HERMES_DURATION_MS, 8000, "MOCK_HERMES_DURATION_MS"),
  };
}
