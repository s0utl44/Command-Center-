/** Opisy zdarzeń zadania dla osi czasu (szczegóły). Nieznane typy pokazujemy surowo. */
export const EVENT_LABEL: Record<string, string> = {
  created: "Przyjęto polecenie",
  "params-provided": "Uzupełniono dane",
  approved: "Udzielono zgody",
  claimed: "Rozpoczęto wykonanie",
  "session-created": "Utworzono sesję Hermesa",
  "prompt-submitting": "Wysyłanie zlecenia",
  "prompt-submitted": "Zlecenie wysłane",
  "prompt-submit-error": "Błąd przy wysyłaniu zlecenia",
  "hermes-error": "Problem z połączeniem z Hermesem",
  "execution-completed": "Hermes zakończył pracę",
  "execution-failed": "Wykonanie nie powiodło się",
  verified: "Wynik zweryfikowany",
  "verification-failed": "Weryfikacja nie przeszła",
  "verification-error": "Problem z weryfikacją",
  "needs-attention": "Wymaga uwagi",
  retried: "Ponowiono",
  cancelled: "Anulowano",
};

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type;
}
