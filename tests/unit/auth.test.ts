import { describe, expect, it } from "vitest";
import {
  base64UrlEncode,
  createSession,
  pkceChallenge,
  readSession,
  SESSION_TTL_MS,
  signToken,
  validateIdTokenClaims,
  verifyToken,
} from "@/core/auth";
import { AuthConfigError, loadAuthConfig } from "@/server/auth/config";

const SECRET = "test-secret-0123456789-0123456789-abcdef";
const ALLOWED = "sotuldrop@gmail.com";

describe("sesja", () => {
  it("poprawna sesja dozwolonego konta jest przyjmowana", async () => {
    const now = Date.now();
    const token = await createSession("SotulDrop@gmail.com ", SECRET, now);
    expect(await readSession(token, SECRET, ALLOWED, now + 1000)).toEqual({ email: ALLOWED, exp: now + SESSION_TTL_MS });
  });

  it("odrzuca wygasłą sesję", async () => {
    const now = Date.now();
    const token = await createSession(ALLOWED, SECRET, now);
    expect(await readSession(token, SECRET, ALLOWED, now + SESSION_TTL_MS + 1)).toBeNull();
  });

  it("odrzuca zmienioną treść, obcy sekret i inne konto", async () => {
    const now = Date.now();
    const token = await createSession(ALLOWED, SECRET, now);
    const [, sig] = token.split(".");
    const forged = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ email: ALLOWED, exp: now + 10 * SESSION_TTL_MS })))}.${sig}`;
    expect(await readSession(forged, SECRET, ALLOWED, now)).toBeNull();
    expect(await readSession(token, `${SECRET}-inny`, ALLOWED, now)).toBeNull();
    expect(await readSession(token, SECRET, "ktos@inny.pl", now)).toBeNull();
    const other = await createSession("intruz@gmail.com", SECRET, now);
    expect(await readSession(other, SECRET, ALLOWED, now)).toBeNull();
  });

  it("odrzuca śmieci", async () => {
    for (const t of [undefined, "", "abc", "a.b.c", "!!!.???"]) expect(await verifyToken(t, SECRET)).toBeNull();
    expect(await verifyToken(await signToken({ a: 1 }, SECRET), SECRET)).toEqual({ a: 1 });
  });
});

describe("PKCE", () => {
  it("challenge zgodny z przykładem RFC 7636", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("ID token Google", () => {
  const now = Date.now();
  const base = { iss: "https://accounts.google.com", aud: "client-1", exp: Math.floor(now / 1000) + 300, email: ALLOWED, email_verified: true };
  const check = (claims: object | null) => validateIdTokenClaims(claims, { clientId: "client-1", allowedEmail: ALLOWED, now });

  it("przyjmuje poprawny token dozwolonego konta", () => {
    expect(check(base)).toEqual({ ok: true, email: ALLOWED });
  });

  it.each([
    [{ ...base, iss: "https://evil.example" }, "wrong-issuer"],
    [{ ...base, aud: "client-2" }, "wrong-audience"],
    [{ ...base, exp: Math.floor(now / 1000) - 1 }, "expired"],
    [{ ...base, email_verified: false }, "email-not-verified"],
    [{ ...base, email: "d.lys@wrenieruchomosci.pl" }, "not-allowed"],
    [null, "invalid-token"],
  ])("odrzuca %o (%s)", (claims, reason) => {
    expect(check(claims)).toEqual({ ok: false, reason });
  });
});

describe("konfiguracja logowania", () => {
  const env = { SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", APP_URL: "https://centrum.startagent.online" };

  it("tryb google z HTTPS włącza bezpieczne ciasteczka", () => {
    const cfg = loadAuthConfig(env);
    expect(cfg).toMatchObject({ mode: "google", allowedEmail: ALLOWED, secureCookies: true, appUrl: "https://centrum.startagent.online" });
  });

  it("logowanie testowe jest zabronione z prawdziwym Hermesem", () => {
    expect(() => loadAuthConfig({ ...env, AUTH_MODE: "dev", HERMES_MODE: "real" })).toThrow(AuthConfigError);
    expect(loadAuthConfig({ ...env, AUTH_MODE: "dev", HERMES_MODE: "mock" }).mode).toBe("dev");
  });

  it("wymaga długiego sekretu i danych klienta Google", () => {
    expect(() => loadAuthConfig({ ...env, SESSION_SECRET: "krotki" })).toThrow(/SESSION_SECRET/);
    expect(() => loadAuthConfig({ SESSION_SECRET: SECRET })).toThrow(/GOOGLE_CLIENT_ID/);
  });
});
