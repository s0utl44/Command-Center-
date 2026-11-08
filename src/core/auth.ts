/**
 * Logika uwierzytelniania bez I/O, na Web Crypto (działa w proxy i w route handlers).
 * Sesja = podpisany HMAC-SHA256 token `payload.signature` w ciasteczku HttpOnly.
 */

export interface SessionPayload {
  email: string;
  /** Unix ms — wygaśnięcie sesji. */
  exp: number;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** Podpisuje dowolny obiekt JSON (sesja, stan logowania). */
export async function signToken(value: unknown, secret: string): Promise<string> {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(value)));
  return `${payload}.${base64UrlEncode(await hmac(secret, payload))}`;
}

/** Zwraca zdekodowaną wartość tylko przy poprawnym podpisie; inaczej `null`. */
export async function verifyToken(token: string | undefined, secret: string): Promise<unknown> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  let given: Uint8Array;
  try {
    given = base64UrlDecode(signature);
  } catch {
    return null;
  }
  if (!constantTimeEqual(given, await hmac(secret, payload))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as unknown;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string, allowed: string): boolean {
  return normalizeEmail(email) === normalizeEmail(allowed);
}

export async function createSession(email: string, secret: string, now: number): Promise<string> {
  return signToken({ email: normalizeEmail(email), exp: now + SESSION_TTL_MS } satisfies SessionPayload, secret);
}

/** Sesja ważna = poprawny podpis, nie wygasła i nadal dotyczy dozwolonego adresu. */
export async function readSession(token: string | undefined, secret: string, allowedEmail: string, now: number): Promise<SessionPayload | null> {
  const value = (await verifyToken(token, secret)) as Partial<SessionPayload> | null;
  if (!value || typeof value.email !== "string" || typeof value.exp !== "number") return null;
  if (value.exp <= now) return null;
  if (!isAllowedEmail(value.email, allowedEmail)) return null;
  return { email: value.email, exp: value.exp };
}

/** Losowy ciąg base64url (state, PKCE verifier). */
export function randomToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

export interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  email?: unknown;
  email_verified?: unknown;
}

/** Dekoduje część payload ID tokenu (bez weryfikacji podpisu — patrz validateIdTokenClaims). */
export function decodeIdToken(idToken: string): IdTokenClaims | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as IdTokenClaims;
  } catch {
    return null;
  }
}

export type IdTokenCheck = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Walidacja ID tokenu otrzymanego BEZPOŚREDNIO z endpointu tokenów Google (TLS + client secret),
 * co wg OpenID Connect Core 3.1.3.7 pozwala pominąć weryfikację podpisu. Sprawdzamy iss, aud,
 * exp, potwierdzony e-mail i allowlistę.
 */
export function validateIdTokenClaims(claims: IdTokenClaims | null, opts: { clientId: string; allowedEmail: string; now: number }): IdTokenCheck {
  if (!claims) return { ok: false, reason: "invalid-token" };
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return { ok: false, reason: "wrong-issuer" };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.clientId)) return { ok: false, reason: "wrong-audience" };
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= opts.now) return { ok: false, reason: "expired" };
  if (typeof claims.email !== "string") return { ok: false, reason: "no-email" };
  if (claims.email_verified !== true && claims.email_verified !== "true") return { ok: false, reason: "email-not-verified" };
  if (!isAllowedEmail(claims.email, opts.allowedEmail)) return { ok: false, reason: "not-allowed" };
  return { ok: true, email: normalizeEmail(claims.email) };
}
