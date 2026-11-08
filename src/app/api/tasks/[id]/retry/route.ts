import { z } from "zod";
import { getRuntime } from "@/server/context";
import { handle, readJson } from "@/server/http";
import { taskAction } from "@/server/tasks/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ mode: z.enum(["continue", "fresh"]) });

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await params;
    const { mode } = await readJson(request, Body);
    const rt = getRuntime();
    return taskAction(rt, id, () => rt.service.retry(id, mode));
  });
}
