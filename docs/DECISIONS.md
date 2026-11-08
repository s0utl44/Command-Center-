# Decyzje (ADR w skrócie)

Format: kontekst → decyzja → konsekwencje. Status: przyjęta / tymczasowa / do potwierdzenia.

## D-001 Nowy projekt od zera — przyjęta
Poprzednia implementacja Command Center (`/opt/data/dominik-command-center`) nie jest używana
ani naprawiana. Nowe repo, nowa architektura. Stara aplikacja nie jest ruszana na serwerze.

## D-002 Next.js + TypeScript strict, PWA, mobile-first — przyjęta
Jeden język w całym projekcie, łatwe API i SSE w jednym serwisie. Bez aplikacji natywnej;
architektura (API + trwałe zadania) pozwala później dodać widget/przycisk natywny.

## D-003 Osobny proces `worker` — przyjęta
Wykonanie nie może zależeć od otwartej karty ani od cyklu życia żądania HTTP. `web` tylko zapisuje
stan, `worker` wykonuje. Kolejka w SQLite z dzierżawą zamiast zewnętrznego brokera
(jeden użytkownik, jeden serwer).

## D-004 SQLite (WAL) — przyjęta
Jeden użytkownik i jeden serwer: SQLite wystarczy, nie wymaga osobnej usługi, łatwy backup.
Dostęp przez `better-sqlite3` (synchroniczny, transakcyjny). Migracja do PostgreSQL możliwa
za warstwą repozytoriów, gdyby była potrzebna.

## D-005 Rozpoznanie procesu w naszym backendzie — przyjęta
Router intencji i ekstrakcja parametrów są nasze (testowalne, przewidywalne). Hermes dostaje
kompletne zlecenie i tylko wykonuje.

## D-006 Bez automatycznego ponawiania `prompt.submit` — przyjęta
Audyt: Hermes nie ma potwierdzonej idempotencji ani replayu zdarzeń. Po niejasnym rozłączeniu
odzyskujemy stan przez `session.resume`/`status`/`history`; gdy stan dalej jest niejasny →
`needs_attention`.

## D-007 Dostawca LLM do ekstrakcji parametrów — do potwierdzenia
Opcje: (a) bezpośrednie API LLM z naszego backendu ze structured output, (b) krótka sesja Hermesa
bez narzędzi + walidacja zod, (c) wystawienie `run_oneshot` Hermesa przez gateway (zmiana po stronie
Hermesa). Na etapy 1–5 wystarczy router regułowy. Decyzja przed etapem 9 (HubSpot/Mail wymagają
swobodniejszego języka).

## D-008 Niezależna weryfikacja — przyjęta
Sukces zadania = pozytywna weryfikacja osobnym odczytem, nie raport agenta.

## D-009 Własna polityka zgód ponad zgodami Hermesa — przyjęta
Zgody Hermesa (`approval.request`) dotyczą niebezpiecznych komend. Wysyłka maila, zapis do HubSpot
i usuwanie wymagają zgody egzekwowanej przez nasz backend. Zgoda przypięta do hasha treści akcji.
Na `approval.request` odpowiadamy wyłącznie `once` (po zgodzie użytkownika) lub `deny`.

## D-010 Status połączeń bezpośrednio z Composio — tymczasowa
Hermes nie wystawia statusu konektorów przez JSON-RPC. Backend pyta Composio. Do rewizji, jeśli
Hermes doda taką metodę.

## D-011 Mocki widoczne w UI — przyjęta
Każdy wynik z mocka jest oznaczony „SYMULACJA”. Ekran Połączenia bez prawdziwego sprawdzenia
nie pokazuje „połączone”.

## D-012 Logowanie przez Google z allowlistą — tymczasowa
Auth.js, jedno dozwolone konto `sotuldrop@gmail.com`. Ewentualnie dodatkowo zabezpieczenie na
poziomie reverse proxy — do decyzji przy wdrożeniu.

## D-013 Gdzie uruchomić aplikację na serwerze — do potwierdzenia
Hermes działa w kontenerze, endpoint tylko na loopbacku. `web`/`worker` muszą widzieć
`127.0.0.1:9119` jako loopback: ten sam kontener, sieć hosta lub port zmapowany tylko na
`127.0.0.1`. Decyzja przy etapie 6.

## D-014 Proces WRE korzysta z istniejącego skilla — przyjęta
Na serwerze jest `real-estate-photo-workflow`. Instrukcja wykonania procesu wskazuje ten skill
i przekazuje parametry (alias `wre`, folder, instrukcja obróbki), zamiast opisywać obróbkę od zera.

## D-015 Typ oferty nie jest wymagany — przyjęta
Decyzja Dominika: przy obróbce zdjęć typ oferty nie ma znaczenia, a nazwy folderów (podawane
w przybliżeniu) się nie powtarzają. System nie dopytuje o typ oferty. Prefiks `WN`/`WS`, jeśli
padnie, jest przekazywany Hermesowi (skill zmienia wtedy tylko „wynajmu” → „sprzedaży”).
Struktura potwierdzona skillem: `fotki - pozysk/<folder nieruchomości>/obrobione`.

## D-016 Odpytywanie stanu zamiast polegania na strumieniu zdarzeń — przyjęta
Hermes nie ma potwierdzonego replayu zdarzeń, więc worker ustala stan krokami: `session.status` +
`session.history` ze znacznikiem `[zlecenie:<taskId>]`. Każdy krok jest krótki i bezpieczny przy
restarcie. Strumień zdarzeń może później przyspieszyć UI, ale nie decyduje o stanie zadania.

## D-017 Worker uruchamiany przez `node --import tsx` — tymczasowa
Jeden proces (poprawna obsługa sygnałów pod systemd), bez osobnego kroku budowania. Do rewizji
przy wdrożeniu (ewentualnie bundling esbuild).

## D-018 „Dokończ” w tej samej sesji Hermesa — przyjęta
Skill `real-estate-photo-workflow` ma protokół wznawiania (manifest, rekoncyliacja Drive, bez
ponownego renderowania opłaconych zdjęć). Dlatego domyślne ponowienie zadania `needs_attention`
to nowe zlecenie-kontynuacja w tej samej sesji (`retry(..., "continue")`), a nie nowa sesja.
„Od nowa” (`fresh`) pozostaje opcją. Każda próba ma własny znacznik `[zlecenie:<id>#<próba>]`,
więc wynik poprzedniej próby nie zostanie pomylony z bieżącą. Wysłanie kontynuacji jest decyzją
użytkownika — to nie jest automatyczne ponowienie (D-006 obowiązuje).

## D-019 Raport `WYNIK (JSON)` wskazuje, gdzie weryfikować — przyjęta
Użytkownik podaje często fragment nazwy („z Zyndrama”), a Hermes dopasowuje folder. Zlecenie
wymaga na końcu linii `WYNIK (JSON): {source_folder_name, source_folder_id, destination_folder_id,
destination_url, source_count, verified_count}`. Weryfikator liczy pliki sam, po ID folderów z tej
linii; liczby z raportu nie są dowodem. Link i rzeczywista nazwa folderu trafiają do wyniku w UI.

## D-020 Transkrypcja do potwierdzenia przed wysłaniem — tymczasowa
Po nagraniu tekst trafia do edytowalnego pola i jest wysyłany przyciskiem „Wykonaj”. Przy
symulowanym STT to konieczne (tekst nie pochodzi z nagrania). Po podłączeniu prawdziwego STT
(etap 7) rozważymy automatyczne wysłanie dla procesów bez ryzyka.

## D-021 SSE odpytuje bazę — przyjęta
`/api/events` co sekundę porównuje migawkę zadań z bazy i wysyła ją przy zmianie. Proste,
odporne na restart `web` i `worker`; przy jednym użytkowniku koszt jest pomijalny. UI dodatkowo
od razu stosuje odpowiedź na własną akcję (nowsza wersja zadania wygrywa), żeby nie pokazywać
przez chwilę poprzedniego zadania.


## D-022 Service worker nie cache'uje danych — przyjęta
Stan zadań pochodzi wyłącznie z serwera. SW nigdy nie odpowiada z cache dla `/api/*`, a bez sieci
pokazuje stronę offline zamiast nieaktualnych danych. Cache tylko dla niezmiennych zasobów.

## D-023 Instalowalność sprawdzana wprost — przyjęta
`Page.getInstallabilityErrors` w headless Chromium zwraca pustą listę także dla strony bez
manifestu (sprawdzone kontrolą negatywną), więc test e2e sprawdza kryteria bezpośrednio:
podpięty manifest sparsowany bez błędów (`Page.getAppManifest`), wymagane pola, ikony 192/512
i aktywny service worker kontrolujący stronę. Instalację na prawdziwym telefonie trzeba
potwierdzić ręcznie po wdrożeniu na HTTPS.
