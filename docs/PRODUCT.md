# Produkt — Broski, prywatny asystent głosowy Dominika

**Broski** to „ziomek do zadań specjalnych” — tak Dominik nazywa swojego agenta.

## Jedno zdanie

Instalowalna na telefonie aplikacja (PWA), w której Dominik naciska duży mikrofon, mówi polecenie,
a system rozpoznaje zapisany proces, dopytuje tylko o brakujące informacje, zleca wykonanie
Hermes Agentowi, niezależnie weryfikuje wynik i pokazuje lub odczytuje krótkie podsumowanie.

## Dla kogo

Jeden użytkownik: Dominik. Dostęp ma wyłącznie konto `sotuldrop@gmail.com`.
To nie jest produkt wieloużytkownikowy i nie projektujemy pod skalę.

## Główny przepływ

1. Naciśnięcie mikrofonu (lub wpisanie polecenia).
2. Transkrypcja wypowiedzi.
3. Rozpoznanie gotowego procesu.
4. Pytania wyłącznie o brakujące parametry.
5. Zgoda — tylko gdy wymaga jej polityka (patrz niżej).
6. Wykonanie przez Hermes Agent w tle — niezależnie od otwartej karty.
7. Weryfikacja wyniku osobnym odczytem.
8. Krótki wynik na ekranie, opcjonalnie odczytany głosem, oraz powiadomienie.

Chat i pełna historia są dostępne jako szczegóły zadania, ale nie są ekranem głównym.

## Ekrany

| Ekran | Zawartość |
|---|---|
| **Mów** (start) | duży mikrofon, transkrypcja, szybkie czynności, krótki status bieżącego zadania, pytania i zgody |
| **Dzisiaj** | wykonywane · czeka na mnie · zaplanowane · zakończone · problemy |
| **Procesy** | zapisane, wersjonowane procedury: konektor i konto, parametry, zasady pytań i zgód, kryteria weryfikacji, historia wersji |
| **Połączenia** | usługa, alias i adres konta, prawdziwy status z backendu, możliwości, procesy korzystające z połączenia, ponowna autoryzacja |

## Pierwsze procesy

### 1. Obróbka zdjęć WRE (`wre-photo-edit`)

- Konto: Google Drive `d.lys@wrenieruchomosci.pl`, alias `wre`.
- Struktura: `fotki - pozysk / <folder nieruchomości> / obrobione`.
- Prefiksy folderów: `WN` = wynajem, `WS` = sprzedaż — opcjonalne; system nie dopytuje o typ oferty.
- Nazwa folderu może być fragmentem („z Zyndrama”) — dopasowuje go Hermes, a wynik pokazuje
  rzeczywistą nazwę i link do `obrobione`.
- Obróbka realistyczna wg stałego promptu ze skilla: zachowany układ, meble i geometria.
- Weryfikacja: liczba plików wynikowych = liczba źródłowych (N/N), sprawdzona osobnym odczytem.
- Użytkownik podaje głównie nazwę folderu i ewentualnie inną instrukcję obróbki.
- Na serwerze istnieje już skill Hermesa `real-estate-photo-workflow` — proces go wywołuje, a nie duplikuje.

### 2. Notatka HubSpot (`hubspot-note`)

„Dodaj do pani Kowalskiej notatkę, że sprzedaje od pół roku i oddzwonić w czwartek.”

- znajdź kontakt; o wybór pytaj tylko przy niejednoznaczności;
- przygotuj uporządkowaną notatkę; dodaj follow-up, jeśli padł;
- zapisz, odczytaj zapisany rekord i potwierdź.

### 3. Mail (`mail-draft`)

- rozpoznaj konto, przygotuj szkic ze znanym podpisem i stylem, pokaż krótki podgląd;
- „napisz” / „odpisz” = tylko szkic;
- wysyłka wyłącznie po wyraźnym „wyślij”.

## Zgody

Działania znane i niskiego ryzyka wykonują się bez pytania, jeśli polecenie jest jednoznaczne.
Zawsze wymagamy potwierdzenia przed:

- wysłaniem maila, jeśli nie padło „wyślij”;
- publikacją;
- usuwaniem danych;
- płatnością;
- nieodwracalną zmianą;
- działaniem na niejednoznacznym kontakcie lub folderze.

## Uczenie

System **nie** zmienia procesu sam. Po korekcie pyta: „Zapisać to jako nową wersję procesu?”.
Każda wersja jest niezmienna, a zadanie zawsze pamięta, na której wersji zostało wykonane.

## Rozdział kont

- **WRE** — `d.lys@wrenieruchomosci.pl`: firmowy Drive, Gmail, procesy nieruchomości.
- **SOTULDROP** — `sotuldrop@gmail.com`: prywatne zadania i administracja aplikacją.
- Danych prywatnych nie mieszamy z systemami WRE — egzekwuje to backend, nie model.

## Poza zakresem (na teraz)

Pełny CRM, rozbudowany chat, kanban, wizualny edytor automatyzacji, aplikacja natywna,
integracje Shopify / Hostinger / Facebook.
Architektura ma jednak pozwolić później dodać natywny widget lub przycisk.
