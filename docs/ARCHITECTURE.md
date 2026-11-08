# Architektura

Status oznaczeń: ✅ potwierdzone (audyt Hermesa z serwera), ❓ do potwierdzenia, 🧪 obecnie mock.

## Widok z góry

```
Telefon (PWA, Next.js client)
  │  HTTPS: centrum.startagent.online   (logowanie Google, allowlista: sotuldrop@gmail.com)
  ▼
reverse proxy (TLS)  ❓ rodzaj i konfiguracja do potwierdzenia
  ▼
┌──────────────────────── serwer aplikacji ────────────────────────┐
│ web    (Next.js)   UI, API, SSE ze statusem, upload audio → STT  │
│   │                                                              │
│   ▼        SQLite (WAL): zadania, zdarzenia UI, procesy+wersje,  │
│            połączenia, zgody, idempotency, artefakty             │
│   ▲                                                              │
│ worker (Node)      kolejka zadań → HermesAdapter → weryfikacja   │
│   │                → powiadomienie                               │
└───┼──────────────────────────────────────────────────────────────┘
    │ ws://127.0.0.1:9119/api/ws?token=…   (token tylko po stronie serwera)
    ▼
Hermes Agent (/opt/hermes, Python/FastAPI, w kontenerze)  ✅
    └─ Composio / skills → Google Drive, Gmail, HubSpot
```

Przeglądarka **nigdy** nie łączy się z Hermesem ani z Composio. Rozmawia tylko z `web`.

## Dlaczego dwa procesy (`web` + `worker`)

Wymóg: zadanie przeżywa reload, utratę sieci i zamknięcie aplikacji. Handlery Next.js żyją tyle
co żądanie HTTP i giną przy restarcie, więc wykonanie przenosimy do osobnego, długo żyjącego
procesu `worker`. Oba procesy dzielą kod domeny (`src/core`) i jedną bazę SQLite.

- `web` tylko zapisuje i czyta stan; nigdy nie czeka na Hermesa w ramach żądania.
- `worker` pobiera zadania z tabeli kolejki z dzierżawą (`lease_until`), więc po awarii
  przejmuje je ponownie.
- Oba procesy uruchamiane jako osobne usługi (systemd lub supervisor w kontenerze) ❓.

## Warstwy kodu

| Katalog | Zawartość | Zależy od |
|---|---|---|
| `src/core` | domena: schemat procesu, maszyna stanów zadania, polityka zgód, router intencji — czysty TS, bez I/O | nic |
| `src/server` | baza, repozytoria, adaptery (Hermes, STT, konektory), auth | `core` |
| `src/worker` | pętla kolejki, orkiestracja wykonania i weryfikacji | `core`, `server` |
| `src/app` | Next.js: ekrany i route handlers | `core`, `server` |

Adaptery mają interfejs w `core` i co najmniej dwie implementacje: `mock` (testy, dev) oraz
prawdziwą. Wybór implementacji przez zmienną środowiskową. Tryb mock jest **widoczny w UI**
(plakietka „SYMULACJA”) — mock nigdy nie udaje prawdziwego wyniku.

## Model zadania

```
draft ─► needs_input ─► awaiting_approval ─► queued ─► running ─► verifying ─► succeeded
   │          ▲                 │                         │            │
   │          └── (pytanie) ────┘                         ├──► needs_attention (niejasny stan, wymaga człowieka)
   └──────────────────────────────────────────────────────┴──► failed / cancelled
```

- Zadanie przypina konkretną `process_version_id`.
- Każda zmiana stanu = wpis w append-only `task_events` (oś czasu dla UI i audytu).
- `idempotency_key` na zadaniu i na każdym kroku z efektem ubocznym.
- Lokalnie trzymamy tylko: zadanie, parametry, status UI, `hermes_session_id`, zgody,
  wynik końcowy i artefakty potrzebne aplikacji. **Nie** kopiujemy historii rozmowy Hermesa
  (ta zostaje w `/opt/data/state.db` Hermesa i jest dostępna przez `session.history`).

## Rozpoznanie procesu i parametrów

Robione w naszym backendzie, nie w Hermesie — ma być szybkie, przewidywalne i testowalne.

1. **Reguły** z definicji procesu (słowa kluczowe, wzorce, np. `WN`/`WS` + nazwa folderu).
2. **LLM do ekstrakcji parametrów** (później): jednorazowe wywołanie bez narzędzi, odpowiedź JSON,
   walidacja zod po naszej stronie, jedna próba naprawy, potem odrzucenie i pytanie użytkownika.
   ✅ Hermes ma wewnętrzny `run_oneshot` (`/opt/hermes/agent/oneshot.py`), ale ❓ nie jest
   wystawiony przez `/api/ws`. Decyzja o dostawcy: patrz `DECISIONS.md` (D-007).
3. Brakujące wymagane parametry → stan `needs_input` i pytanie w UI.

## Wykonanie przez Hermesa ✅ (kontrakt z audytu)

Transport: JSON-RPC 2.0 przez WebSocket, `ws://127.0.0.1:9119/api/ws?token=<TOKEN>`.
Token porównywany stałoczasowo; serwer sprawdza adres klienta (loopback), `Host` i `Origin`
(jeśli wysłany). Nasz worker łączy się z loopbacka i **nie wysyła** `Origin`.

Używane metody:

| Metoda | Do czego |
|---|---|
| `session.create` | nowa sesja dla zadania |
| `prompt.submit` | wysłanie zlecenia (jednorazowo!) |
| `session.status` | stan, m.in. czy agent pracuje |
| `session.resume` | ponowne podpięcie po rozłączeniu |
| `session.history` | odzyskanie wyniku po rozłączeniu |
| `session.interrupt` | anulowanie |
| `clarify.respond` | odpowiedź na `clarify.request` (`request_id`) |
| `approval.respond` | odpowiedź na `approval.request` (`choice`: `once`/`deny`) |

Zdarzenia: `message.delta`, `message.complete`, `tool.start`, `tool.end`,
`approval.request`, `clarify.request` (+ inne), każde z `session_id`.

### Zasady niezawodności

- **Nigdy nie ponawiamy automatycznie `prompt.submit`.** Hermes nie ma potwierdzonej idempotencji;
  ponowienie grozi podwójnym wykonaniem.
- Kolejność zapisu: najpierw zapisujemy `hermes_session_id` i stan `running`, potem wysyłamy prompt.
- Po rozłączeniu / restarcie workera: `session.resume` → `session.status` → `session.history`.
  Jeśli z historii nie da się jednoznacznie ustalić, czy zlecenie zostało przyjęte i zakończone,
  zadanie przechodzi w `needs_attention` — decyduje człowiek.
- ❓ Brak potwierdzonego replayu zdarzeń (`resume_from_event_id`) i długości grace period —
  dlatego nasz stan jest źródłem prawdy dla UI, a nie strumień zdarzeń Hermesa.
- `approval.request` od Hermesa jest przekazywane do UI jako zgoda. Nigdy nie odpowiadamy
  automatycznie `always` ani `session`; dozwolone są tylko `once` (po zgodzie użytkownika) i `deny`.
- Zgody Hermesa dotyczą głównie niebezpiecznych komend — **nie** zastępują naszej polityki zgód.

### Model kroków workera (etap 2)

Worker co `WORKER_POLL_MS` przejmuje zadania (`queued`, oraz `running`/`verifying` bez ważnej
dzierżawy), wykonuje **jeden krok** każdego i zwalnia dzierżawę. Kroki w stanie `running`:

1. brak sesji → `session.create` i zapis `hermes_session_id` (błędy połączenia: do 5 prób, potem `needs_attention`);
2. brak `prompt_submitted_at` → zapis znacznika „mogło zostać wysłane” → **jedno** `prompt.submit`;
3. w pozostałych przypadkach → odczyt stanu (`session.status` + `session.history`, szukamy znacznika
   `[zlecenie:<taskId>]`) i decyzja: dalej czekamy / weryfikacja / `failed` / `needs_attention`.

Stan jest odczytywany odpytywaniem, nie ze strumienia zdarzeń — strumień może być później użyty
do szybszego odświeżania UI, ale nie jest źródłem prawdy. Zlecenie zawiera na końcu linię
`Parametry zlecenia (JSON): …` z zadaniem, procesem, kontem i parametrami.

Ograniczenie etapu 2: `clarify.request` i `approval.request` od Hermesa kończą się `needs_attention`
z treścią pytania. Odpowiadanie z aplikacji (`clarify.respond` / `approval.respond`) — etap 6.

Ponowienie zadania `needs_attention` jest **wyłącznie** decyzją użytkownika:
„Dokończ” = nowe zlecenie-kontynuacja w tej samej sesji (skill wznawia z manifestu), „Od nowa” = nowa sesja (D-018).
Każda próba ma własny znacznik `[zlecenie:<taskId>#<próba>]`.

## Weryfikacja

Krok weryfikacji jest częścią definicji procesu i wykonywany jest osobnym odczytem po wykonaniu,
a nie na podstawie raportu agenta. Raport Hermesa (linia `WYNIK (JSON)`) wskazuje jedynie, które
foldery policzyć (ID, rzeczywista nazwa) i podaje link (D-019). Przykłady: policzenie plików w `obrobione/<folder>` vs źródło;
ponowny odczyt notatki z HubSpot. Wynik nieweryfikowalny ≠ sukces → `needs_attention`.

## Zgody (polityka w backendzie)

Poziom ryzyka akcji wynika z definicji procesu i kodu polityki, nie z decyzji modelu.
Zgoda zapisuje **hash dokładnej treści** akcji (np. adresat + temat + treść maila). Zmiana treści
unieważnia zgodę. Profile wykonania: `read-only`, `draft-only`, `write-with-approval`.

## Status w UI

- SSE z `web` do przeglądarki dla zadań w toku; po reloadzie stan czytany z bazy.
- Web Push (VAPID) gdy zadanie się kończy lub czeka na użytkownika — działa przy zamkniętej
  aplikacji (iOS: PWA dodana do ekranu głównego). Etap późniejszy.
- Odczyt wyniku głosem: `speechSynthesis` w przeglądarce.

## Głos

MediaRecorder w przeglądarce → upload do `web` → adapter STT → transkrypcja.
iOS Safari nagrywa `audio/mp4`, Chrome `audio/webm` — obsługujemy oba. Nagranie usuwamy po
transkrypcji. Zawsze dostępne jest wpisanie polecenia z klawiatury.

## Bezpieczeństwo

- Logowanie Google, allowlista jednego adresu: `sotuldrop@gmail.com`.
- Token Hermesa, klucze STT/LLM/Composio tylko w zmiennych środowiskowych serwera.
- Tokeny OAuth konektorów nigdy w przeglądarce (zarządza nimi Composio / Hermes).
- Logger z redakcją: parametry `token`, `secret`, `password`, `authorization`, query `?token=`.
- Port 9119 nie może być wystawiony do internetu ❓ (bind do potwierdzenia: `ss -ltnp`).

## Otwarte kwestie infrastrukturalne ❓

- Hermes działa w kontenerze. Gdzie uruchomimy `web`/`worker`, żeby `127.0.0.1:9119` był dla nich
  loopbackiem? (ten sam kontener / sieć hosta / port zmapowany tylko na 127.0.0.1 hosta).
- Reverse proxy, DNS, certyfikat `centrum.startagent.online`.
- Stary Command Center (`/opt/data/dominik-command-center`, porty 3300/3310/3311) — nowa aplikacja
  potrzebuje własnego portu; stary nie jest ruszany bez decyzji Dominika.
