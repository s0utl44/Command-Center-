import { cookieHeader, SESSION_COOKIE } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST() {
  return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": cookieHeader(SESSION_COOKIE, "", 0) } });
}
