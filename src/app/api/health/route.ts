export const dynamic = "force-dynamic";

/** Lekki healthcheck bez otwierania bazy. */
export function GET() {
  return Response.json({
    ok: true,
    hermesMode: process.env.HERMES_MODE === "real" ? "real" : "mock",
    sttMode: process.env.STT_MODE === "real" ? "real" : "mock",
  });
}
