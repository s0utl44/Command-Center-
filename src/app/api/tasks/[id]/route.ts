import { getRuntime } from "@/server/context";
import { handle, UserError } from "@/server/http";
import { toTaskView } from "@/server/tasks/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await params;
    const rt = getRuntime();
    const task = rt.tasks.get(id);
    if (!task) throw new UserError("Nie ma takiego zadania", 404);
    const events = rt.tasks.events(id).map((e) => ({ at: e.at, type: e.type, from: e.fromStatus, to: e.toStatus }));
    return Response.json({ task: toTaskView(rt, task), events });
  });
}
