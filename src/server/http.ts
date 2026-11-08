import { z } from "zod";
import { redact } from "@/core/redact";
import { getSession } from "./auth/session";

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Wykonuje handler API po sprawdzeniu sesji (obrona w głąb — proxy sprawdza ją wcześniej).
 * Błędy walidacji → 400, reszta → 500 bez szczegółów wewnętrznych w odpowiedzi.
 */
export async function handle(request: Request, fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    if (!(await getSession(request))) return jsonError(401, "Wymagane logowanie");
    return await fn();
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(400, "Nieprawidłowe dane");
    if (error instanceof UserError) return jsonError(error.status, error.message);
    console.error(JSON.stringify(redact({ at: new Date().toISOString(), message: "api error", error: String(error) })));
    return jsonError(500, "Błąd serwera");
  }
}

export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new UserError("Nieprawidłowy JSON");
  }
  return schema.parse(body);
}
