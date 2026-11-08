import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, type SessionPayload } from "@/core/auth";
import { authConfig } from "./config";
import { SESSION_COOKIE } from "./session";

/** Dla stron renderowanych na serwerze: sprawdza sesję jeszcze raz (obrona w głąb). */
export async function requirePageSession(): Promise<SessionPayload> {
  const cfg = authConfig();
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value, cfg.sessionSecret, cfg.allowedEmail, Date.now());
  if (!session) redirect("/login");
  return session;
}
