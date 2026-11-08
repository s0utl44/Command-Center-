import { describe, expect, it } from "vitest";
import { STATUS_LABEL, type TaskView } from "@/core/task-view";
import { todayGroup, type TaskStatus } from "@/core/task";
import { groupForToday, taskHeadline } from "@/core/today";

function task(id: string, status: TaskStatus, updatedAt: string, params: TaskView["params"] = []): TaskView {
  return {
    id,
    status,
    statusLabel: STATUS_LABEL[status],
    group: todayGroup(status),
    processKey: "wre-photo-edit",
    processName: "Obróbka zdjęć WRE",
    processVersion: 1,
    utterance: "Obrób zdjęcia",
    params,
    missing: [],
    approvalReasons: [],
    result: null,
    attempts: 0,
    canContinue: false,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("ekran Dzisiaj", () => {
  const now = new Date(2026, 10, 8, 15, 0);
  const today = new Date(2026, 10, 8, 9, 0).toISOString();
  const yesterday = new Date(2026, 10, 7, 9, 0).toISOString();

  it("zakończone pokazuje tylko z dzisiaj, a wymagające uwagi niezależnie od daty", () => {
    const groups = groupForToday(
      [
        task("a", "running", today),
        task("b", "needs_input", yesterday),
        task("c", "succeeded", today),
        task("d", "succeeded", yesterday),
        task("e", "needs_attention", yesterday),
        task("f", "cancelled", today),
      ],
      now,
    );
    expect(groups.running.map((t) => t.id)).toEqual(["a"]);
    expect(groups.waiting.map((t) => t.id)).toEqual(["b"]);
    expect(groups.done.map((t) => t.id)).toEqual(["c", "f"]);
    expect(groups.problems.map((t) => t.id)).toEqual(["e"]);
    expect(groups.scheduled).toEqual([]);
  });

  it("nagłówek pozycji to folder, a bez parametrów — polecenie", () => {
    expect(taskHeadline(task("a", "running", today, [{ name: "folder", label: "Folder", value: "Zyndrama 20 52" }]))).toBe("Zyndrama 20 52");
    expect(taskHeadline(task("b", "needs_input", today))).toBe("Obrób zdjęcia");
    // Wartości domyślne innych parametrów nie mogą udawać nagłówka.
    expect(taskHeadline(task("c", "needs_input", today, [{ name: "listing_type", label: "Typ oferty", value: "nie podano" }]))).toBe("Obrób zdjęcia");
  });
});
