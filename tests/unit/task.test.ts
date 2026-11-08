import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, InvalidTransitionError, isTerminal, TASK_STATUSES, todayGroup } from "@/core/task";

describe("maszyna stanów zadania", () => {
  it("dopuszcza główną ścieżkę", () => {
    const path = ["needs_input", "awaiting_approval", "queued", "running", "verifying", "succeeded"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });

  it("nie pozwala ominąć weryfikacji", () => {
    expect(canTransition("running", "succeeded")).toBe(false);
    expect(() => assertTransition("running", "succeeded")).toThrow(InvalidTransitionError);
  });

  it("nie pozwala wyjść ze stanów końcowych", () => {
    for (const s of ["succeeded", "failed", "cancelled"] as const) {
      expect(isTerminal(s)).toBe(true);
      for (const to of TASK_STATUSES) expect(canTransition(s, to)).toBe(false);
    }
  });

  it("przypisuje każdy stan do grupy ekranu Dzisiaj", () => {
    expect(todayGroup("running")).toBe("running");
    expect(todayGroup("awaiting_approval")).toBe("waiting");
    expect(todayGroup("needs_attention")).toBe("problems");
    expect(todayGroup("succeeded")).toBe("done");
  });
});
