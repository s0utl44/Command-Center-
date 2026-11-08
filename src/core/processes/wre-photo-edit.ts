import type { ProcessDefinitionInput } from "../process";

export const DEFAULT_PHOTO_INSTRUCTION =
  "obróbka realistyczna: popraw światło, ekspozycję, balans bieli i perspektywę; zachowaj układ pomieszczeń, meble i geometrię; nie dodawaj ani nie usuwaj obiektów";

/**
 * Obróbka zdjęć WRE — wersja 1.
 * ❓ Dokładna struktura folderów (czy `obrobione` jest obok `fotki pozysk`, czy wewnątrz folderu
 * oferty) do potwierdzenia z treścią skilla `real-estate-photo-workflow`.
 */
export const wrePhotoEditV1: ProcessDefinitionInput = {
  key: "wre-photo-edit",
  name: "Obróbka zdjęć WRE",
  description: "Realistyczna obróbka zdjęć nieruchomości z Google Drive WRE i weryfikacja N/N plików.",
  workspace: "wre",
  connection: { alias: "wre", services: ["google-drive"] },
  intents: {
    keywordGroups: [
      ["zdjec", "zdjecia", "fotk", "foto"],
      ["obrob", "edytuj", "popraw"],
    ],
    examples: ["Obrób zdjęcia z folderu WS Mokotów Puławska", "Obrób fotki WN Wola 12", "Obrób zdjęcia"],
  },
  params: [
    {
      name: "folder",
      label: "Folder",
      required: true,
      question: "Z którego folderu obrobić zdjęcia?",
      extract: [
        "(?:folder(?:u|ze)?|katalog(?:u)?)\\s+(?<value>[^,.;]+?)\\s*(?=$|[,.;]|\\s+(?:i|oraz|a|ale)\\s)",
        "(?<![\\p{L}\\p{N}])(?<value>W[NS](?![\\p{L}\\p{N}])[^,.;]*?)\\s*(?=$|[,.;]|\\s+(?:i|oraz|a|ale)\\s)",
      ],
    },
    {
      name: "listing_type",
      label: "Typ oferty",
      required: true,
      question: "Czy to wynajem (WN), czy sprzedaż (WS)?",
      options: ["wynajem", "sprzedaż"],
      derive: {
        from: "folder",
        rules: [
          { pattern: "^WN(?![\\p{L}\\p{N}])", value: "wynajem" },
          { pattern: "^WS(?![\\p{L}\\p{N}])", value: "sprzedaż" },
        ],
      },
    },
    {
      name: "instruction",
      label: "Instrukcja obróbki",
      required: true,
      default: DEFAULT_PHOTO_INSTRUCTION,
      question: "Jak obrobić zdjęcia?",
      extract: ["(?:instrukcja|dodatkowo|uwaga)\\s*:?\\s*(?<value>.+)$"],
    },
  ],
  execution: {
    profile: "write",
    skill: "real-estate-photo-workflow",
    instruction: [
      "Użyj skilla real-estate-photo-workflow.",
      "Konto Google Drive: alias wre (d.lys@wrenieruchomosci.pl). Nie używaj żadnego innego konta.",
      "Folder źródłowy: „fotki pozysk” → „{{folder}}”. Folder docelowy: „obrobione” → „{{folder}}”.",
      "Typ oferty: {{listing_type}}.",
      "Instrukcja obróbki: {{instruction}}.",
      "Jeśli folder nie istnieje albo pasuje więcej niż jeden, zatrzymaj się i zapytaj — nie zgaduj.",
      "Nie usuwaj i nie nadpisuj istniejących plików.",
      "Na końcu podaj liczbę plików źródłowych i liczbę zapisanych plików wynikowych.",
    ].join("\n"),
  },
  actions: ["read", "write"],
  approval: {
    writeRequiresApproval: false,
    notes: ["Zapis nowych plików do „obrobione” nie wymaga zgody.", "Niejednoznaczny folder → pytanie przed wykonaniem."],
  },
  verification: {
    kind: "file-count-match",
    description: "Liczba plików w folderze docelowym równa liczbie zdjęć źródłowych (N/N).",
    sourcePath: "fotki pozysk/{{folder}}",
    targetPath: "obrobione/{{folder}}",
  },
  reporting: {
    success: "Obrobiono {{verified}} zdjęć z folderu {{folder}}.",
    failure: "Nie udało się obrobić zdjęć z folderu {{folder}}: {{reason}}",
  },
};
