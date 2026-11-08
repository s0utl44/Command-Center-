import { z } from "zod";
import { getRuntime } from "@/server/context";
import { handle, readJson } from "@/server/http";
import { toTaskView } from "@/server/tasks/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  utterance: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().min(8).max(100),
});

/** Polecenie użytkownika → rozpoznanie procesu → trwałe zadanie (wykonuje worker). */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request, Body);
    const rt = getRuntime();
    const result = rt.service.submitUtterance(body);
    if (result.kind === "task") return Response.json({ kind: "task", duplicate: result.duplicate, task: toTaskView(rt, result.task) });
    return Response.json(result);
  });
}
