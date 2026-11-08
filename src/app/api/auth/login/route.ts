import { createSession, pkceChallenge, randomToken, SESSION_TTL_MS, signToken } from "@/core/auth";
import { authConfig } from "@/server/auth/config";
import { cookieHeader, LOGIN_STATE_COOKIE, SESSION_COOKIE } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOGIN_STATE_TTL_S = 10 * 60;

/** Start logowania: Google OAuth (PKCE + state) albo — tylko w trybie testowym — od razu sesja. */
export async function GET() {
  const cfg = authConfig();
  if (cfg.mode === "dev") {
    const token = await createSession(cfg.allowedEmail, cfg.sessionSecret, Date.now());
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": cookieHeader(SESSION_COOKIE, token, SESSION_TTL_MS / 1000) },
    });
  }
  const google = cfg.google;
  if (!google) return new Response("Logowanie nieskonfigurowane", { status: 500 });

  const state = randomToken();
  const verifier = randomToken(48);
  const loginState = await signToken({ state, verifier, exp: Date.now() + LOGIN_STATE_TTL_S * 1000 }, cfg.sessionSecret);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", google.clientId);
  url.searchParams.set("redirect_uri", `${cfg.appUrl}/api/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("login_hint", cfg.allowedEmail);
  url.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 303,
    headers: { Location: url.toString(), "Set-Cookie": cookieHeader(LOGIN_STATE_COOKIE, loginState, LOGIN_STATE_TTL_S, "/api/auth") },
  });
}
