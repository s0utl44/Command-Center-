import { describe, expect, it } from "vitest";
import { parseProcessDefinition, type ProcessDefinition } from "@/core/process";
import { DEFAULT_PHOTO_INSTRUCTION, wrePhotoEditV1 } from "@/core/processes/wre-photo-edit";
import { route, type RouteMatch } from "@/core/router";

const wre = parseProcessDefinition(wrePhotoEditV1);

function match(utterance: string, processes: ProcessDefinition[] = [wre]): RouteMatch {
  const result = route(utterance, processes);
  if (result.kind !== "match") throw new Error(`Oczekiwano dopasowania, jest ${result.kind}`);
  return result;
}

describe("router regułowy — obróbka zdjęć WRE", () => {
  it.each([
    ["Obrób zdjęcia z folderu WS Mokotów Puławska", "WS Mokotów Puławska", "sprzedaż"],
    ["obrób fotki WN Wola 12", "WN Wola 12", "wynajem"],
    ["Obrób zdjęcia z folderu „WS Bemowo 3 pokoje”.", "WS Bemowo 3 pokoje", "sprzedaż"],
    ["Popraw zdjęcia WN Ursynów i daj znać", "WN Ursynów", "wynajem"],
  ])("%s", (utterance, folder, listingType) => {
    const r = match(utterance);
    expect(r.process.key).toBe("wre-photo-edit");
    expect(r.params.folder).toBe(folder);
    expect(r.params.listing_type).toBe(listingType);
    expect(r.params.instruction).toBe(DEFAULT_PHOTO_INSTRUCTION);
    expect(r.missing).toEqual([]);
  });

  it("pyta o folder, gdy go brakuje", () => {
    const r = match("Obrób zdjęcia");
    expect(r.missing.map((m) => m.name)).toEqual(["folder", "listing_type"]);
    expect(r.missing[0]?.question).toBe("Z którego folderu obrobić zdjęcia?");
  });

  it("pyta tylko o typ oferty, gdy folder nie ma prefiksu", () => {
    const r = match("Obrób zdjęcia z folderu Saska Kępa");
    expect(r.params.folder).toBe("Saska Kępa");
    expect(r.missing).toEqual([{ name: "listing_type", question: "Czy to wynajem (WN), czy sprzedaż (WS)?", options: ["wynajem", "sprzedaż"] }]);
  });

  it("przyjmuje inną instrukcję obróbki", () => {
    const r = match("Obrób zdjęcia WS Wola, instrukcja: tylko rozjaśnij");
    expect(r.params.folder).toBe("WS Wola");
    expect(r.params.instruction).toBe("tylko rozjaśnij");
  });

  it("nie dopasowuje niezwiązanych poleceń", () => {
    expect(route("Dodaj notatkę do pani Kowalskiej", [wre]).kind).toBe("no-match");
    expect(route("Pokaż zdjęcia", [wre]).kind).toBe("no-match");
    expect(route("", [wre]).kind).toBe("no-match");
  });

  it("zgłasza niejednoznaczność przy dwóch pasujących procesach", () => {
    const twin = parseProcessDefinition({ ...wrePhotoEditV1, key: "inny-proces" });
    expect(route("Obrób zdjęcia WS Wola", [wre, twin]).kind).toBe("ambiguous");
  });
});
