# Konektory

Konektory działają **wyłącznie po stronie serwera**: przez Hermesa (skills, Composio, MCP)
albo bezpośrednio przez Composio z naszego backendu (status połączeń). Tokeny OAuth nigdy nie
trafiają do przeglądarki ani do naszych logów.

Status oznaczeń: ✅ potwierdzone audytem, ❓ do potwierdzenia, 🧪 obecnie mock.

## Zakres

| Kolejność | Usługa | Status |
|---|---|---|
| MVP | Google Drive | ❓ autoryzacja konta `wre` niepotwierdzona |
| MVP | Gmail | ❓ autoryzacja obu kont niepotwierdzona |
| MVP | HubSpot | ❓ narzędzia Composio istnieją ✅, aktywne OAuth niepotwierdzone |
| później | Google Calendar, Docs/Sheets, Notion | gdy będą potrzebne |
| nie teraz | Shopify, Hostinger, Facebook i inne | — |

## Konta i aliasy

| Alias | Adres | Przestrzeń | Do czego |
|---|---|---|---|
| `wre` | `d.lys@wrenieruchomosci.pl` | WRE | firmowy Drive, Gmail, procesy nieruchomości |
| `sotuldrop` | `sotuldrop@gmail.com` | Prywatne | prywatne zadania, administracja aplikacją |

Każdy proces ma przypisany alias. Backend odrzuca zadanie, które próbuje użyć konta z innej
przestrzeni niż proces (np. proces WRE na koncie prywatnym).

## Co wiemy o stronie serwera ✅

- Composio jest dostępne w Hermesie; potwierdzone kategorie HubSpot: wyszukiwanie i odczyt
  kontaktów, tworzenie notatek, tworzenie zadań/follow-upów, odczyt asocjacji.
- Skills w `/opt/data/skills/`, m.in. Google Workspace, Gmail/Himalaya,
  `productivity/real-estate-photo-workflow`, workflow HubSpot.
- Obróbka zdjęć: `image_gen` → provider `openai-codex`, model `gpt-image-2-medium`.
- Hermes **nie ma** potwierdzonej metody JSON-RPC typu `connector.status` / `connector.reauthorize`.
  Dlatego status połączeń nasz backend pobiera bezpośrednio z Composio (connected accounts),
  a ponowną autoryzację realizuje przez link OAuth generowany przez Composio.

## Ekran „Połączenia”

Pokazuje dla każdego konta: usługę, alias, adres, **status pobrany z backendu**
(`connected` / `expired` / `not_configured` / `error` / `unknown`), możliwości, procesy
korzystające z połączenia i przycisk ponownej autoryzacji.

Zasada: brak prawdziwego sprawdzenia = `unknown` albo `not_configured`, nigdy „połączone”.
W trybie mock ekran pokazuje plakietkę „SYMULACJA”.

## Interfejs adaptera (szkic)

```ts
interface ConnectionStatusProvider {
  list(): Promise<ConnectionStatus[]>;                 // prawdziwy stan z Composio
  reauthorizeUrl(alias: string, service: Service): Promise<string>;
}
```

## Do skonfigurowania na serwerze (checklista)

- [ ] Potwierdzić w Composio aktywne połączenia: Drive `wre`, Gmail `wre`, Gmail `sotuldrop`, HubSpot.
- [ ] Ustalić identyfikatory connected accounts Composio dla każdego aliasu (do konfiguracji backendu).
- [ ] Klucz Composio dla backendu jako zmienna środowiskowa serwera (nie w repo).
- [ ] Sprawdzić, jak skill `real-estate-photo-workflow` wybiera konto Drive — musi dostać alias `wre`.
- [ ] Zmierzyć czas i koszt obróbki jednego zdjęcia (benchmark), zanim podamy szacunki w UI.
- [ ] Ustalić podpis i styl maili dla każdego konta.
