import { describe, expect, it } from "vitest";
import { parseProcessDefinition, type ProcessDefinition } from "@/core/process";
import { wrePhotoEditV1 } from "@/core/processes/wre-photo-edit";
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
    expect(r.params.extra_instruction).toBe("brak");
    expect(r.missing).toEqual([]);
  });

  it.each([
    ["Obrób zdjęcia z Zyndrama 20 52", "Zyndrama 20 52"],
    ["obrabiaj zdjęcia z Pan Mateusz - Orląt Lwowskich 10 10", "Pan Mateusz - Orląt Lwowskich 10 10"],
    ["zrób mi te fotki ze Żmigrodzkiej", "Żmigrodzkiej"],
  ])("folder podany nazwą lokalizacji: %s", (utterance, folder) => {
    const r = match(utterance);
    expect(r.params.folder).toBe(folder);
    // Bez prefiksu WN/WS nie dopytujemy — typ oferty nie jest potrzebny do obróbki.
    expect(r.params.listing_type).toBe("nie podano");
    expect(r.missing).toEqual([]);
  });

  it("pyta wyłącznie o folder, gdy go brakuje", () => {
    const r = match("Obrób zdjęcia");
    expect(r.missing.map((m) => m.name)).toEqual(["folder"]);
    expect(r.missing[0]?.question).toBe("Z którego folderu obrobić zdjęcia?");
  });

  it("przyjmuje dodatkową instrukcję obróbki", () => {
    const r = match("Obrób zdjęcia WS Wola, instrukcja: tylko rozjaśnij");
    expect(r.params.folder).toBe("WS Wola");
    expect(r.params.extra_instruction).toBe("tylko rozjaśnij");
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
