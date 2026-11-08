# CLAUDE.md

**Broski** — prywatny mobilny asystent głosowy Dominika (PWA), „ziomek do zadań specjalnych”. Mikrofon → transkrypcja → rozpoznanie procesu →
brakujące parametry → trwałe zadanie → wykonanie przez Hermes Agent → weryfikacja → wynik.

Zanim zaczniesz pracę, przeczytaj:
- `docs/PRODUCT.md` — co budujemy i czego nie budujemy;
- `docs/ARCHITECTURE.md` — kontrakt z Hermesem i zasady niezawodności;
- `docs/MVP.md` — etapy i ich status;
- `docs/DECISIONS.md` — decyzje; nowa decyzja = nowy wpis;
- `docs/DEPLOYMENT.md` — wdrożenie na serwer.

## Komendy

```bash
npm run dev          # Next.js dev
npm run worker       # worker wykonujący zadania (osobny proces; potrzebny do działania zadań)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest
npm run build        # build produkcyjny
npm run test:e2e     # Playwright (sam buduje i startuje aplikację)
npm run check        # lint + typecheck + test + build
```

Lokalnie aplikacja wymaga `SESSION_SECRET` (≥32 znaki) i zwykle `AUTH_MODE=dev` — patrz `.env.example`.
Wdrożenie: `docs/DEPLOYMENT.md`.

## Zasady pracy

- Pracuj małymi etapami. Po każdym etapie: lint, typecheck, testy, build, smoke test Playwright.
- TypeScript strict; bez `any` bez uzasadnienia.
- `src/core` to czysta domena bez I/O. Adaptery (Hermes, STT, konektory) mają interfejs
  i implementację mock + prawdziwą, wybieraną zmienną środowiskową.
- **Nie wymyślaj** odpowiedzi Hermesa ani wyników konektorów. Mock jest zawsze oznaczony w UI
  („SYMULACJA”) i nigdy nie jest dowodem działania prawdziwej integracji.
- **Nigdy nie ponawiaj automatycznie `prompt.submit`** do Hermesa (brak idempotencji).
- Sukces zadania wymaga niezależnej weryfikacji.
- Tokeny, hasła i klucze: tylko zmienne środowiskowe serwera; nigdy w kliencie, repo ani logach.
- Nie mieszaj kont: WRE (`d.lys@wrenieruchomosci.pl`) vs prywatne (`sotuldrop@gmail.com`).
- Procesy zmieniają się wyłącznie przez nową wersję zatwierdzoną przez użytkownika.
- Nie buduj: CRM, rozbudowanego chatu, kanbanu, edytora automatyzacji, aplikacji natywnej.
- UI po polsku; identyfikatory w kodzie po angielsku.

## Playwright

W środowisku zdalnym Chromium jest preinstalowany pod `/opt/pw-browsers`; `@playwright/test`
jest przypięty do wersji zgodnej z tą przeglądarką. Nie uruchamiaj `playwright install`.
