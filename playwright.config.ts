import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3457);
const WORKER_PORT = PORT + 1;

/** Osobna baza i tryb SYMULACJI dla testów e2e. Baza czyszczona przy starcie workera. */
const env = {
  DATABASE_PATH: "./data/e2e/app.db",
  HERMES_MODE: "mock",
  STT_MODE: "mock",
  MOCK_STT_TEXT: "Obrób zdjęcia z Mickiewicza 5",
  MOCK_HERMES_DURATION_MS: "2500",
  WORKER_POLL_MS: "300",
  WORKER_HEALTH_PORT: String(WORKER_PORT),
  // Logowanie testowe (bez Google) — dozwolone tylko przy HERMES_MODE=mock.
  AUTH_MODE: "dev",
  SESSION_SECRET: "e2e-only-secret-not-for-production-0123456789",
  ALLOWED_EMAIL: "sotuldrop@gmail.com",
  APP_URL: `http://127.0.0.1:${PORT}`,
};

export const AUTH_STATE = "test-results/.auth/state.json";

export default defineConfig({
  testDir: "tests/e2e",
  // Testy dzielą jedną bazę i ekran „bieżącego zadania”, więc idą po kolei.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "mobile-chromium", dependencies: ["setup"], use: { ...devices["Pixel 7"], storageState: AUTH_STATE } },
  ],
  webServer: [
    {
      command: "rm -rf data/e2e && node --import tsx src/worker/main.ts",
      url: `http://127.0.0.1:${WORKER_PORT}/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      env,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
