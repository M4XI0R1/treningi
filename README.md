# Mój trening

Prywatna aplikacja do zapisywania treningu siłowego. Działa jako aplikacja na iPhonie (PWA), offline, a wszystkie dane zostają na telefonie.

Adres: **https://m4xi0r1.github.io/treningi/**

## Instalacja na iPhonie

1. Otwórz adres powyżej w **Safari** (nie w Chrome: tylko Safari dodaje PWA na iOS).
2. Tapnij **Udostępnij** (kwadrat ze strzałką) → **Dodaj do ekranu początkowego** → **Dodaj**.
3. Od teraz uruchamiaj aplikację z ikony z hantlami. Otwiera się na pełnym ekranie, bez paska Safari.
4. Przy pierwszym uruchomieniu z ikony aplikacja zapisuje się w pamięci telefonu. Potem działa bez internetu.

> **Uwaga: usunięcie ikony z ekranu początkowego kasuje wszystkie dane aplikacji.**
> Dane z ikony i z karty Safari to dwa osobne magazyny. Zanim usuniesz ikonę albo zmienisz telefon, zrób eksport (niżej).

## Kopia zapasowa

Zakładka **Plan → Kopia zapasowa**:

- **Zapisz plik**: otwiera menu udostępniania; wybierz „Zachowaj w Plikach” albo wyślij sobie plik.
- **Kopiuj JSON**: kopiuje całą kopię do schowka (np. do notatki).
- **Import z pliku** / **Wklej JSON**: przywraca dane z kopii. Plik jest sprawdzany, zanim cokolwiek się zmieni. Import **zastępuje** wszystkie dane na telefonie.

Aplikacja pokazuje datę ostatniego eksportu i przypomina o kopii, gdy minie 14 dni.

## Wdrażanie zmian

Każdy push na gałąź `main` buduje aplikację i publikuje ją na GitHub Pages (workflow `.github/workflows/deploy.yml`).

Jednorazowo trzeba włączyć Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Lokalnie:

```bash
npm install
npm run dev      # serwer deweloperski (bez service workera)
npm run build    # build do dist/ + wygenerowany dist/sw.js
npm run preview  # podgląd buildu
npm run icons    # ponowne wygenerowanie ikon (scripts/make-icons.mjs)
```

## Aktualizacja na telefonie

Po wdrożeniu nowej wersji telefon pobiera ją w tle przy następnym otwarciu aplikacji. Pojawia się komunikat „Nowa wersja – zamknij i otwórz aplikację ponownie”. Aplikacja nigdy nie przeładowuje się sama, więc nie przerwie trwającego treningu.

Wymuszenie aktualizacji, gdy komunikat się nie pojawia:

1. Zamknij aplikację w przełączniku aplikacji (przesuń w górę) i otwórz ją ponownie, dwa razy.
2. Wersja widoczna jest w **Plan → O aplikacji**.

Nie czyść danych witryny w Ustawieniach Safari: to też usuwa dane treningów.

## Jak to działa

- **Stos**: Vite + TypeScript, bez frameworka i bez zależności w runtime. Wykresy własne w SVG.
- **Dane**: IndexedDB (`kv`: plan, katalog ćwiczeń, ustawienia, szkic treningu; `workouts`; `bodyweight`). Po pierwszym zapisie aplikacja prosi o pamięć trwałą (`navigator.storage.persist()`). Baza i schemat danych mają numery wersji i migracje (`src/db.ts`, `src/store.ts`).
- **Ćwiczenia mają stałe ID.** Historia i wykresy łączą się po ID, nie po nazwie, więc zmiana nazwy w planie nie odcina historii (edytor pokazuje ostrzeżenie, że nazwa zmieni się też w historii).
- **Szkic treningu** zapisuje się na bieżąco i przy wyjściu z aplikacji. Timer przerwy liczy od znacznika czasu, więc działa po wygaszeniu ekranu.
- **Rekord**: szacowany 1RM wg Epleya, powtórzenia powyżej 12 liczone jak 12. Serie rozgrzewkowe nie liczą się do objętości ani rekordów.
- **Offline**: service worker trzyma całą aplikację w cache z wersjonowaną nazwą. Aplikacja nie wysyła nic do internetu (bez CDN, czcionek zewnętrznych i analityki).
