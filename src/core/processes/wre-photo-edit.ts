import type { ProcessDefinitionInput } from "../process";

/** Ścieżka folderów na Drive WRE (wg skilla `real-estate-photo-workflow`). */
export const WRE_PHOTOS_ROOT = "fotki - pozysk";

const STOP = "\\s*(?=$|[,.;]|\\s+(?:i|oraz|a|ale)\\s)";

/**
 * Obróbka zdjęć WRE — wersja 1.
 *
 * Zgodnie ze skillem Hermesa `real-estate-photo-workflow`:
 * - folder nieruchomości jest bezpośrednim podfolderem „fotki - pozysk”;
 * - gotowe zdjęcia trafiają do podfolderu „obrobione” WEWNĄTRZ folderu nieruchomości;
 * - prompt obróbki jest stały (references/photo-prompt.md) — przekazujemy tylko typ oferty
 *   i ewentualną dodatkową instrukcję użytkownika;
 * - pobranie, obróbka, utworzenie „obrobione” i upload są stale autoryzowane (bez dodatkowej zgody);
 * - zakończenie = upload + zdalna weryfikacja N/N + link do folderu.
 */
export const wrePhotoEditV1: ProcessDefinitionInput = {
  key: "wre-photo-edit",
  name: "Obróbka zdjęć WRE",
  description: "Realistyczna obróbka zdjęć nieruchomości z Google Drive WRE do folderu „obrobione” i weryfikacja N/N plików.",
  workspace: "wre",
  connection: { alias: "wre", services: ["google-drive"] },
  intents: {
    keywordGroups: [
      ["zdjec", "zdjecia", "fotk", "foto"],
      ["obrob", "obrab", "edytuj", "popraw", "zrob"],
    ],
    examples: ["Obrób zdjęcia z Zyndrama 20 52", "Obrabiaj zdjęcia z folderu WS Mokotów Puławska", "Obrób fotki WN Wola 12", "Obrób zdjęcia"],
  },
  params: [
    {
      name: "folder",
      label: "Folder nieruchomości",
      required: true,
      question: "Z którego folderu obrobić zdjęcia?",
      extract: [
        `(?:folder(?:u|ze)?|katalog(?:u)?)\\s+(?<value>[^,.;]+?)${STOP}`,
        `(?<![\\p{L}\\p{N}])(?<value>W[NS](?![\\p{L}\\p{N}])[^,.;]*?)${STOP}`,
        `(?:zdj\\p{L}*|fotk\\p{L}*|foto\\p{L}*)\\s+(?:z|ze)\\s+(?<value>[^,.;]+?)${STOP}`,
      ],
    },
    {
      name: "listing_type",
      label: "Typ oferty",
      // Nie pytamy — dla obróbki to bez znaczenia (decyzja Dominika). Prefiks WN/WS, jeśli jest, trafia do Hermesa.
      required: false,
      default: "nie podano",
      question: "Czy to wynajem (WN), czy sprzedaż (WS)?",
      derive: {
        from: "folder",
        rules: [
          { pattern: "^WN(?![\\p{L}\\p{N}])", value: "wynajem" },
          { pattern: "^WS(?![\\p{L}\\p{N}])", value: "sprzedaż" },
        ],
      },
    },
    {
      name: "extra_instruction",
      label: "Dodatkowa instrukcja obróbki",
      required: false,
      default: "brak",
      question: "Czy jest jakaś dodatkowa instrukcja obróbki?",
      extract: ["(?:instrukcja|dodatkowo|uwaga)\\s*:?\\s*(?<value>.+)$"],
    },
  ],
  execution: {
    profile: "write",
    skill: "real-estate-photo-workflow",
    instruction: [
      "Użyj skilla real-estate-photo-workflow — standardowa obróbka zdjęć do ogłoszenia (nie wirtualna aranżacja).",
      "Konto Google Drive: alias wre (d.lys@wrenieruchomosci.pl, połączenie googledrive_heaps-acmic). Podawaj je przy KAŻDYM wywołaniu Drive. Nie używaj konta SOTULDROP.",
      "Folder nieruchomości: „{{folder}}” — dopasuj wśród bezpośrednich podfolderów „fotki - pozysk” (uwzględnij warianty z polskimi znakami i bez).",
      "Obrób wszystkie zdjęcia z tego folderu (cały folder, nie wybrane pliki).",
      "Gotowe zdjęcia zapisz w podfolderze „obrobione” wewnątrz folderu nieruchomości.",
      "Typ oferty: {{listing_type}}. Tylko gdy to sprzedaż, zmień w standardowym prompcie „wynajmu” na „sprzedaży”; w innym razie prompt bez zmian.",
      "Prompt obróbki: standardowy z references/photo-prompt.md, bez zmian. Dodatkowa instrukcja użytkownika: {{extra_instruction}}.",
      "Jeśli folder nie istnieje albo pasuje więcej niż jeden, zatrzymaj się i zapytaj — nie zgaduj.",
      "Nie usuwaj i nie nadpisuj oryginałów.",
      'Na końcu dodaj jedną linię dokładnie w formacie: WYNIK (JSON): {"source_folder_name": "...", "source_folder_id": "...", "destination_folder_id": "...", "destination_url": "...", "source_count": N, "verified_count": N}',
    ].join("\n"),
  },
  actions: ["read", "write"],
  approval: {
    writeRequiresApproval: false,
    notes: [
      "Pobranie, obróbka, utworzenie „obrobione” i upload są stale autoryzowane przez Dominika.",
      "Usuwanie lub nadpisywanie oryginałów, publikacja gdzie indziej — zawsze zgoda.",
      "Niejednoznaczny folder → pytanie przed wykonaniem.",
    ],
  },
  verification: {
    kind: "file-count-match",
    description: "Liczba zdjęć w „obrobione” równa liczbie zdjęć źródłowych w folderze nieruchomości (N/N).",
    sourcePath: `${WRE_PHOTOS_ROOT}/{{folder}}`,
    targetPath: `${WRE_PHOTOS_ROOT}/{{folder}}/obrobione`,
  },
  reporting: {
    success: "Obrobiono {{verified}} zdjęć z folderu {{folder}}.",
    failure: "Nie udało się obrobić zdjęć z folderu {{folder}}: {{reason}}",
  },
};
