import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/core/auth";
import { authConfig } from "@/server/auth/config";
import { SESSION_COOKIE } from "@/server/auth/session";

/** Ścieżki dostępne bez logowania (logowanie, healthcheck, pliki PWA). */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/callback", "/api/health", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icon.svg"];
const PUBLIC_PREFIXES = ["/icons/", "/_next/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Każde żądanie poza publicznymi wymaga ważnej sesji jedynego dozwolonego konta.
 * Dodatkowo: żądania zmieniające stan z obcego Origin są odrzucane (CSRF).
 * Route handlers API sprawdzają sesję ponownie (obrona w głąb).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin && origin !== authConfig().appUrl) {
      return NextResponse.json({ error: "Niedozwolone źródło żądania" }, { status: 403 });
    }
  }
  if (isPublic(pathname)) return NextResponse.next();

  const cfg = authConfig();
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value, cfg.sessionSecret, cfg.allowedEmail, Date.now());
  if (session) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Wymagane logowanie" }, { status: 401 });
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
