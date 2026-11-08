import { describe, expect, it } from "vitest";
import { buildPrompt, CONTINUATION_TEXT, parsePromptMeta, parseReportResult, taskMarker } from "@/core/execution";

const base = {
  taskId: "t1",
  attempt: 1,
  processKey: "wre-photo-edit",
  processVersion: 1,
  accountAlias: "wre",
  instruction: "Zrób to",
  params: { folder: "Zyndrama 20 52" },
};

describe("zlecenie dla Hermesa", () => {
  it("zawiera znacznik próby, instrukcję i parametry maszynowe", () => {
    const prompt = buildPrompt(base);
    expect(prompt.startsWith(taskMarker("t1", 1))).toBe(true);
    expect(prompt).toContain("Zrób to");
    expect(parsePromptMeta(prompt)).toMatchObject({ task: "t1", attempt: 1, account: "wre", params: { folder: "Zyndrama 20 52" } });
    expect(prompt).not.toContain(CONTINUATION_TEXT);
  });

  it("kontynuacja ma inny znacznik i informację o wznowieniu", () => {
    const prompt = buildPrompt({ ...base, attempt: 2, continuation: true });
    expect(prompt).toContain(taskMarker("t1", 2));
    expect(prompt).not.toContain(taskMarker("t1", 1));
    expect(prompt).toContain(CONTINUATION_TEXT);
  });
});

describe("raport Hermesa", () => {
  it("czyta ostatnią linię WYNIK (JSON)", () => {
    const report = [
      "Gotowe.",
      'WYNIK (JSON): {"source_count": 1}',
      'WYNIK (JSON): {"source_folder_name": "Zyndrama 20 52", "source_folder_id": "a", "destination_folder_id": "b", "destination_url": "https://drive.google.com/drive/folders/b", "source_count": 12, "verified_count": 12}',
    ].join("\n");
    expect(parseReportResult(report)).toEqual({
      source_folder_name: "Zyndrama 20 52",
      source_folder_id: "a",
      destination_folder_id: "b",
      destination_url: "https://drive.google.com/drive/folders/b",
      source_count: 12,
      verified_count: 12,
    });
  });

  it("ignoruje brak linii, zły JSON i złe typy", () => {
    expect(parseReportResult("Gotowe, 12/12.")).toBeNull();
    expect(parseReportResult("WYNIK (JSON): {nie json")).toBeNull();
    expect(parseReportResult('WYNIK (JSON): {"source_count": "dwanaście"}')).toBeNull();
  });
});
