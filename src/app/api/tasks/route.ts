import { getRuntime } from "@/server/context";
import { handle } from "@/server/http";
import { snapshot } from "@/server/tasks/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return handle(() => Response.json(snapshot(getRuntime())));
}
