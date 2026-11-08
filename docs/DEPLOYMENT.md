# Wdrożenie Broskiego na serwer

Stan: aplikacja działa w trybie **SYMULACJI** (`HERMES_MODE=mock`, `STT_MODE=mock`). Ten dokument
opisuje pierwsze wdrożenie pod `https://centrum.startagent.online` — z prawdziwym logowaniem Google,
ale jeszcze bez prawdziwego Hermesa (etap 6).

> Nie ruszaj starej aplikacji `/opt/data/dominik-command-center` ani jej portów (3300/3310/3311).

## 0. Decyzja: gdzie uruchomić Broskiego (D-013)

Broski składa się z dwóch procesów: `web` (Next.js) i `worker`. W etapie 6 `worker` musi widzieć
Hermesa pod `ws://127.0.0.1:9119` jako **loopback**. Hermes działa w kontenerze, więc:

| Opcja | Kiedy | Uwagi |
|---|---|---|
| A. Ten sam kontener co Hermes | najprościej dla etapu 6 | brak systemd w kontenerze → nadzorca procesów (np. supervisord / skrypt startowy kontenera) |
| B. Host + port Hermesa zmapowany tylko na `127.0.0.1` hosta | gdy kontener mapuje port | sprawdź `ss -ltnp` na hoście: musi być `127.0.0.1:9119`, nie `0.0.0.0` |
| C. Osobny kontener w sieci Hermesa (`network_mode: service:hermes`) | przy docker compose | wspólny loopback z Hermesem |

Do etapu 5 (tryb mock) każda opcja zadziała. Sprawdzenie przed etapem 6, z miejsca, gdzie będzie
działał worker: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9119/` — odpowiedź
(dowolny kod HTTP) oznacza, że endpoint jest osiągalny.

## 1. Wymagania

- Node.js **22.12+** (`node -v`), npm.
- Dla `better-sqlite3`: zwykle wystarcza gotowa binarka; jeśli `npm ci` kompiluje — `build-essential`, `python3`.
- Wolny port lokalny, np. **3320** (`ss -ltnp | grep 3320` — puste).
- Reverse proxy z TLS dla `centrum.startagent.online` (Caddy lub nginx).

## 2. Klient OAuth Google (logowanie tylko `sotuldrop@gmail.com`)

1. https://console.cloud.google.com/ → wybierz/utwórz projekt (np. „Broski”).
2. **APIs & Services → OAuth consent screen**: typ *External*, status *Testing*,
   w *Test users* dodaj wyłącznie `sotuldrop@gmail.com`. Zakresy: `openid`, `email`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: *Web application*;
   - Authorized redirect URIs: `https://centrum.startagent.online/api/auth/callback`.
4. Zapisz *Client ID* i *Client secret* — trafią do pliku env (krok 4), nigdzie indziej.

Niezależnie od ustawień Google aplikacja wpuszcza wyłącznie `ALLOWED_EMAIL` z potwierdzonym adresem.

## 3. Instalacja

```bash
sudo useradd --system --home /opt/broski --shell /usr/sbin/nologin broski   # tylko przy opcji B
sudo mkdir -p /opt/broski /var/lib/broski /etc/broski
sudo chown broski:broski /opt/broski /var/lib/broski
sudo -u broski git clone https://github.com/s0utl44/Command-Center- /opt/broski
cd /opt/broski
sudo -u broski git checkout <gałąź lub tag wydania>
sudo -u broski npm ci
sudo -u broski npm run build
```

## 4. Plik konfiguracyjny (sekrety tylko tutaj)

`/etc/broski/broski.env`, właściciel `root:broski`, uprawnienia `640`:

```bash
NODE_ENV=production
APP_URL=https://centrum.startagent.online
DATABASE_PATH=/var/lib/broski/app.db

# Logowanie
AUTH_MODE=google
ALLOWED_EMAIL=sotuldrop@gmail.com
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...            # openssl rand -base64 48

# Wykonanie — do etapu 6 wyłącznie symulacja
HERMES_MODE=mock
STT_MODE=mock
WORKER_POLL_MS=1500
WORKER_HEALTH_PORT=3321
```

`AUTH_MODE=dev` (logowanie bez Google) **nigdy** na serwerze — aplikacja i tak odmówi startu
z `HERMES_MODE=real`.

## 5. Usługi (opcja B: systemd)

`/etc/systemd/system/broski-web.service`:

```ini
[Unit]
Description=Broski web
After=network.target

[Service]
User=broski
WorkingDirectory=/opt/broski
EnvironmentFile=/etc/broski/broski.env
ExecStart=/opt/broski/node_modules/.bin/next start -H 127.0.0.1 -p 3320
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/broski /opt/broski/.next
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/broski-worker.service`:

```ini
[Unit]
Description=Broski worker
After=network.target

[Service]
User=broski
WorkingDirectory=/opt/broski
EnvironmentFile=/etc/broski/broski.env
ExecStart=/usr/bin/node --import tsx src/worker/main.ts
Restart=always
RestartSec=3
KillSignal=SIGTERM
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/broski
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now broski-web broski-worker
journalctl -u broski-worker -f
```

Opcja A/C (kontener bez systemd): uruchom te same dwie komendy (`next start …` i
`node --import tsx src/worker/main.ts`) pod nadzorcą procesów z automatycznym restartem,
z tymi samymi zmiennymi środowiskowymi.

## 6. Reverse proxy

Tylko `centrum.startagent.online` → `127.0.0.1:3320`. **Nigdy** nie wystawiaj portu 9119 ani 3321.
SSE (`/api/events`) wymaga wyłączonego buforowania.

Caddy:

```caddy
centrum.startagent.online {
  reverse_proxy 127.0.0.1:3320 {
    flush_interval -1
  }
}
```

nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:3320;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_http_version 1.1;
  proxy_buffering off;          # SSE
  proxy_read_timeout 1h;        # SSE
}
```

## 7. Sprawdzenie po wdrożeniu

1. `curl -s https://centrum.startagent.online/api/health` → `{"ok":true,"hermesMode":"mock",…}`.
2. `curl -s http://127.0.0.1:3321/` (na serwerze) → healthcheck workera z `lastTickAt`.
3. `curl -s -o /dev/null -w '%{http_code}' https://centrum.startagent.online/api/tasks` → `401`.
4. Telefon: otwórz adres, zaloguj się przez Google jako `sotuldrop@gmail.com`; inne konto → „To konto nie ma dostępu”.
5. Polecenie „Obrób zdjęcia z Test” → po kilku sekundach „Gotowe” z plakietką SYMULACJA.
6. Instalacja PWA: Android — menu → „Zainstaluj aplikację”; iPhone — Udostępnij → „Do ekranu początkowego”.
7. `ss -ltnp | grep -E '9119|3320|3321'` na hoście — wszystkie wyłącznie na `127.0.0.1`.

## 8. Kopie zapasowe

Baza to jeden plik SQLite w trybie WAL. Kopiuj przez API backupu, nie `cp`:

```bash
sqlite3 /var/lib/broski/app.db ".backup '/var/backups/broski/app-$(date +%F).db'"
```

(np. codziennie z crona; trzymaj 14 dni).

## 9. Aktualizacja i wycofanie

```bash
cd /opt/broski && sudo -u broski git fetch && sudo -u broski git checkout <nowy tag>
sudo -u broski npm ci && sudo -u broski npm run build
sudo systemctl restart broski-web broski-worker
```

Wycofanie: `git checkout <poprzedni tag>` + te same kroki. Migracje bazy są tylko „w przód” —
przed aktualizacją zrób kopię (krok 8).

## 10. Bezpieczeństwo — lista kontrolna

- [ ] `AUTH_MODE=google`, `SESSION_SECRET` ≥ 32 znaki, plik env `640`.
- [ ] `HERMES_MODE=mock` do czasu etapu 6.
- [ ] Porty 9119, 3320, 3321 tylko na `127.0.0.1`.
- [ ] Wylogowanie usuwa ciasteczko na danym urządzeniu. Żeby unieważnić **wszystkie** sesje
      (np. zgubiony telefon), zmień `SESSION_SECRET` i zrestartuj `broski-web`.
