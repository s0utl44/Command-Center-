export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, hermesMode: process.env.HERMES_MODE === "real" ? "real" : "mock" });
}
