/** Szybkie czynności na ekranie Mów: wstawiają początek polecenia do pola tekstowego. */
export const QUICK_ACTIONS: readonly { label: string; text: string }[] = [{ label: "📷 Obróbka zdjęć WRE", text: "Obrób zdjęcia z " }];

/** Zadania „bieżące” — pokazywane na ekranie Mów do czasu zakończenia. */
export const ACTIVE_STATUSES = ["needs_input", "awaiting_approval", "needs_attention", "queued", "running", "verifying"] as const;
