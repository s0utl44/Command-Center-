import { authConfig } from "@/server/auth/config";
import { getSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "Wymagane logowanie" }, { status: 401 });
  return Response.json({ email: session.email, authMode: authConfig().mode });
}
