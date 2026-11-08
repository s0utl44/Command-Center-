# MVP — plan etapów

Każdy etap kończy się: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
smoke test Playwright, commit i push. Mock nie jest dowodem działania prawdziwego Hermesa
ani konektora.

## Pierwszy pionowy slice (bez serwera)

Cel: działająca, instalowalna PWA, w której pełny przepływ przechodzi na mockach:
nagranie → transkrypcja (mock) → rozpoznanie procesu WRE → pytanie o brakujący folder →
trwałe zadanie → wykonanie (mock Hermes) → weryfikacja (mock Drive) → wynik → stan zachowany
po przeładowaniu strony i po restarcie workera.

| # | Etap | Kryterium ukończenia | Status |
|---|---|---|---|
| 0 | Dokumenty i szkielet | docs, `CLAUDE.md`, Next.js + TS strict, ESLint, Vitest, Playwright, CI, 4 ekrany-zaślepki | ✅ |
| 1 | Rdzeń domeny | schemat procesu (zod), maszyna stanów, polityka zgód, router reguł, SQLite + migracje, seed procesu WRE; testy jednostkowe | ✅ |
| 2 | Worker + mock Hermesa | kolejka z dzierżawą, idempotency, wznowienie po zabiciu workera, `needs_attention` przy niejasnym stanie, weryfikacja N/N na mocku | ⏳ |
| 3 | Ekran „Mów” | MediaRecorder, mock STT, wpisywanie tekstu, pytanie o parametr, status przez SSE, stan po reloadzie (Playwright z fake mikrofonem) | ⏳ |
| 4 | PWA + „Dzisiaj” | manifest, service worker, instalowalność, lista zadań w 5 grupach | ⏳ |
| 5 | Logowanie i wdrożenie | Auth.js + allowlista, „Procesy” i „Połączenia” tylko do odczytu, opis wdrożenia | ⏳ |

## Po slice — wymaga serwera

| # | Etap | Kryterium ukończenia |
|---|---|---|
| 6 | Prawdziwy Hermes | adapter WS wg kontraktu z `ARCHITECTURE.md`, testy kontraktowe na nagranej wymianie (`/opt/data/hermes-ws-audit-example.jsonl`), prawdziwe zadanie WRE na jednym folderze testowym |
| 7 | Prawdziwe STT | wybrany dostawca z dobrym polskim, klucz tylko na serwerze |
| 8 | Status połączeń | prawdziwy status kont z Composio, link ponownej autoryzacji |
| 9 | HubSpot + Mail | `hubspot-note` (wybór kontaktu przy niejednoznaczności), `mail-draft` (wysyłka tylko po „wyślij”) |
| 10 | Dopracowanie | Web Push, zapisywanie korekt jako nowych wersji procesu |

## Świadomie poza MVP

Pełny CRM, rozbudowany chat, kanban, wizualny edytor procesów, aplikacja natywna,
Calendar / Docs / Sheets / Notion (dopiero gdy będą potrzebne), Shopify / Hostinger / Facebook.
