/**
 * Redakcja sekretów przed logowaniem lub wysłaniem czegokolwiek do klienta.
 * Hermes przyjmuje token w query stringu (`?token=`), więc URL-e też muszą być czyszczone.
 */

const SECRET_KEY_PATTERN = /(token|secret|password|passwd|authorization|api[-_]?key|cookie|ticket|credential)/i;
const SECRET_QUERY_PATTERN = /([?&](?:token|ticket|internal|api[-_]?key|secret)=)[^&#\s]*/gi;
const BEARER_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi;

export const REDACTED = "[REDACTED]";

export function redactString(value: string): string {
  return value.replace(SECRET_QUERY_PATTERN, `$1${REDACTED}`).replace(BEARER_PATTERN, `$1${REDACTED}`);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(inner, depth + 1);
    }
    return out;
  }
  return value;
}
