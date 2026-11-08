import { getRuntime } from "@/server/context";
import { handle } from "@/server/http";
import { taskAction } from "@/server/tasks/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const rt = getRuntime();
    return taskAction(rt, id, () => rt.service.cancel(id));
  });
}
