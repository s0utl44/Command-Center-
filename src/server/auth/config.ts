import { MIN_SECRET_LENGTH } from "@/core/auth";

export type AuthMode = "google" | "dev";

export interface AuthConfig {
  mode: AuthMode;
  allowedEmail: string;
  sessionSecret: string;
  /** Publiczny adres aplikacji, np. https://centrum.startagent.online (redirect URI OAuth). */
  appUrl: string;
  secureCookies: boolean;
  google: { clientId: string; clientSecret: string } | null;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

/**
 * Konfiguracja logowania z env. Zasady bezpieczeństwa:
 * - AUTH_MODE=dev (logowanie testowe bez Google) jest zabronione przy HERMES_MODE=real;
 * - SESSION_SECRET musi mieć co najmniej 32 znaki;
 * - tryb google wymaga GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET i APP_URL.
 */
export function loadAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env): AuthConfig {
  const mode: AuthMode = env.AUTH_MODE === "dev" ? "dev" : "google";
  const allowedEmail = (env.ALLOWED_EMAIL || "sotuldrop@gmail.com").trim().toLowerCase();
  const appUrl = (env.APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const sessionSecret = env.SESSION_SECRET ?? "";

  if (mode === "dev" && env.HERMES_MODE === "real") {
    throw new AuthConfigError("AUTH_MODE=dev jest niedozwolony przy HERMES_MODE=real");
  }
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigError(`SESSION_SECRET musi mieć co najmniej ${MIN_SECRET_LENGTH} znaki`);
  }
  let google: AuthConfig["google"] = null;
  if (mode === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.APP_URL) {
      throw new AuthConfigError("Tryb google wymaga GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET i APP_URL");
    }
    google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  return { mode, allowedEmail, sessionSecret, appUrl, secureCookies: appUrl.startsWith("https://"), google };
}

let cached: AuthConfig | undefined;
export function authConfig(): AuthConfig {
  cached ??= loadAuthConfig();
  return cached;
}
