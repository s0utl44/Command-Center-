import { z } from "zod";
import { getRuntime } from "@/server/context";
import { handle, readJson } from "@/server/http";
import { taskAction } from "@/server/tasks/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ values: z.record(z.string(), z.string().max(2000)) });

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { values } = await readJson(request, Body);
    const rt = getRuntime();
    return taskAction(rt, id, () => rt.service.provideParams(id, values));
  });
}
