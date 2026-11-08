import { readSession, type SessionPayload } from "@/core/auth";
import { authConfig } from "./config";

export const SESSION_COOKIE = "broski_session";
export const LOGIN_STATE_COOKIE = "broski_login";

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number, path = "/"): string {
  const cfg = authConfig();
  const attrs = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (cfg.secureCookies) attrs.push("Secure");
  return attrs.join("; ");
}

export async function getSession(request: Request): Promise<SessionPayload | null> {
  const cfg = authConfig();
  return readSession(readCookie(request, SESSION_COOKIE), cfg.sessionSecret, cfg.allowedEmail, Date.now());
}
