import { describe, expect, it } from "vitest";
import { parseProcessDefinition, renderTemplate } from "@/core/process";
import { wrePhotoEditV1 } from "@/core/processes/wre-photo-edit";

describe("definicja procesu", () => {
  it("proces WRE jest poprawny", () => {
    const def = parseProcessDefinition(wrePhotoEditV1);
    expect(def.key).toBe("wre-photo-edit");
    expect(def.workspace).toBe("wre");
    expect(def.connection.alias).toBe("wre");
  });

  it("odrzuca instrukcję z nieznanym parametrem", () => {
    const bad = { ...wrePhotoEditV1, execution: { ...wrePhotoEditV1.execution, instruction: "Zrób {{nieznany}}" } };
    expect(() => parseProcessDefinition(bad)).toThrow(/nieznanego parametru/);
  });

  it("odrzuca wyprowadzenie z nieistniejącego parametru", () => {
    const params = wrePhotoEditV1.params.map((p) => (p.name === "listing_type" && p.derive ? { ...p, derive: { ...p.derive, from: "brak" } } : p));
    expect(() => parseProcessDefinition({ ...wrePhotoEditV1, params })).toThrow(/nieistniejącego/);
  });

  it("odrzuca profil read-only z działaniem zapisu", () => {
    const bad = { ...wrePhotoEditV1, execution: { ...wrePhotoEditV1.execution, profile: "read-only" } };
    expect(() => parseProcessDefinition(bad)).toThrow(/read-only/);
  });

  it("odrzuca nieprawidłowe wyrażenie regularne", () => {
    const params = wrePhotoEditV1.params.map((p) => (p.name === "folder" ? { ...p, extract: ["(niezamknięty"] } : p));
    expect(() => parseProcessDefinition({ ...wrePhotoEditV1, params })).toThrow(/wyrażenie/);
  });

  it("renderTemplate wstawia wartości i nie dopuszcza braków", () => {
    expect(renderTemplate("Folder {{folder}}", { folder: "WS Wola" })).toBe("Folder WS Wola");
    expect(() => renderTemplate("Folder {{folder}}", {})).toThrow(/folder/);
  });
});
