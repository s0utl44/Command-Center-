import { InvalidTransitionError } from "@/core/task";
import type { Task } from "../db/tasks";
import { StaleTaskError } from "../db/tasks";
import { UserError } from "../http";
import type { Runtime } from "../runtime";
import { TaskStateError } from "./service";
import { toTaskView } from "./view";

/** Wspólna obsługa akcji na zadaniu: 404 gdy brak, 409 gdy stan na to nie pozwala. */
export function taskAction(runtime: Runtime, id: string, fn: () => Task): Response {
  if (!runtime.tasks.get(id)) throw new UserError("Nie ma takiego zadania", 404);
  try {
    return Response.json({ task: toTaskView(runtime, fn()) });
  } catch (error) {
    if (error instanceof TaskStateError || error instanceof StaleTaskError || error instanceof InvalidTransitionError) {
      throw new UserError("Zadanie zmieniło stan — odśwież widok", 409);
    }
    throw error;
  }
}
