import { createSession, decodeIdToken, SESSION_TTL_MS, validateIdTokenClaims, verifyToken } from "@/core/auth";
import { redact } from "@/core/redact";
import { authConfig } from "@/server/auth/config";
import { cookieHeader, LOGIN_STATE_COOKIE, readCookie, SESSION_COOKIE } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(reason: string): Response {
  const headers = new Headers({ Location: `/login?blad=${encodeURIComponent(reason)}` });
  headers.append("Set-Cookie", cookieHeader(LOGIN_STATE_COOKIE, "", 0, "/api/auth"));
  return new Response(null, { status: 303, headers });
}

/** Powrót z Google: sprawdzenie state, wymiana kodu (PKCE), walidacja ID tokenu i allowlisty. */
export async function GET(request: Request) {
  const cfg = authConfig();
  if (cfg.mode !== "google" || !cfg.google) return fail("tryb");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return fail("anulowano");

  const saved = (await verifyToken(readCookie(request, LOGIN_STATE_COOKIE), cfg.sessionSecret)) as {
    state?: string;
    verifier?: string;
    exp?: number;
  } | null;
  if (!saved || saved.state !== state || !saved.verifier || typeof saved.exp !== "number" || saved.exp < Date.now()) {
    return fail("stan");
  }

  let idToken: string | undefined;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.google.clientId,
        client_secret: cfg.google.clientSecret,
        redirect_uri: `${cfg.appUrl}/api/auth/callback`,
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
    });
    if (!res.ok) {
      console.error(JSON.stringify(redact({ message: "oauth token exchange failed", status: res.status })));
      return fail("google");
    }
    idToken = ((await res.json()) as { id_token?: string }).id_token;
  } catch (error) {
    console.error(JSON.stringify(redact({ message: "oauth token exchange error", error: String(error) })));
    return fail("siec");
  }
  if (!idToken) return fail("google");

  const check = validateIdTokenClaims(decodeIdToken(idToken), { clientId: cfg.google.clientId, allowedEmail: cfg.allowedEmail, now: Date.now() });
  if (!check.ok) {
    console.warn(JSON.stringify({ message: "login rejected", reason: check.reason }));
    return fail(check.reason === "not-allowed" ? "konto" : "token");
  }

  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, await createSession(check.email, cfg.sessionSecret, Date.now()), SESSION_TTL_MS / 1000));
  headers.append("Set-Cookie", cookieHeader(LOGIN_STATE_COOKIE, "", 0, "/api/auth"));
  return new Response(null, { status: 303, headers });
}
