# Portal projektu i wewnętrzny CRM

**Status:** działa w trybie demo, a backend (Supabase) jest gotowy do uruchomienia. **Data:** 14.10.2026

## 1. Po co to jest

Architekt, deweloper albo inwestor zakłada konto, wysyła projekt do wyceny i w swoim panelu widzi na bieżąco:
- na jakim etapie jest projekt,
- **po czyjej stronie jest piłka**: „Waiting on you” czy „With Brick & Pane”,
- **do kiedy obiecaliśmy kolejną aktualizację**,
- wszystkie dokumenty, akceptacje i całą korespondencję.

Nie musi dzwonić, żeby się czegoś dowiedzieć. Zespół Brick & Pane prowadzi te same projekty w wewnętrznym CRM: tablica kanban, terminy, wartość kontraktu i notatki wewnętrzne. Konkurencja w UK takiego panelu dla klienta nie ma (patrz `docs/audyt/01-produkt-i-rynek.md`).

## 2. Jak obejrzeć demo

1. Otwórz `login.html` i wybierz **Continue as demo architect**.
2. W drugiej karcie otwórz `admin.html` i wybierz **Continue as demo staff (CRM)**.
3. Jako pracownik zmień etap projektu, wyślij wiadomość albo udostępnij dokument. W karcie architekta status, powiadomienie i wiadomość pojawią się **na żywo, bez odświeżania**.
4. Jako architekt zaakceptuj wycenę. W CRM pojawi się powiadomienie.

Dane demo są przykładowe i zapisują się tylko w przeglądarce. Przycisk „Reset demo” przywraca stan początkowy.

## 3. Etapy projektu (pipeline)

| # | Etap (klient widzi) | Faza | Po czyjej stronie | Obiecany czas |
|---|---|---|---|---|
| 1 | Received | Quotation | Brick & Pane | 1 dzień roboczy |
| 2 | Technical review | Quotation | Brick & Pane | 2 dni robocze |
| 3 | Questions for you | Quotation | **klient** | — |
| 4 | Quote issued | Quotation | **klient** (akceptacja wyceny) | — |
| 5 | Order confirmed | Design | Brick & Pane | 5 dni roboczych |
| 6 | Site survey | Design | Brick & Pane | 5 dni roboczych |
| 7 | Drawings for approval | Design | **klient** (akceptacja rysunków) | — |
| 8 | In production | Delivery | Brick & Pane | wg programu |
| 9 | Delivery scheduled | Delivery | Brick & Pane | |
| 10 | Installation | Delivery | Brick & Pane | |
| 11 | Handover | Delivery | Brick & Pane | |
| 12 | Completed | — | — | |
| — | On hold / Closed | — | — | |

Definicje etapów są w `js/portal/core.js` (`STAGES`) i w bazie (enum `project_stage`). Obiecany termin liczy się automatycznie z czasu przypisanego do etapu, a pracownik może go nadpisać.

## 4. Powiadomienia

| Zdarzenie | Kto dostaje | Kanał |
|---|---|---|
| Nowy projekt | opiekun projektu, a jeśli go nie ma, cały zespół | w panelu + e-mail |
| Zmiana etapu (widoczna dla klienta) | członkowie projektu po stronie klienta | w panelu + e-mail |
| Nowy dokument / prośba o akceptację | klient | w panelu + e-mail |
| Akceptacja / prośba o zmiany | opiekun | w panelu + e-mail |
| Wiadomość od firmy | klient | w panelu + e-mail |
| Wiadomość od klienta | opiekun | w panelu + e-mail |
| Plik wgrany przez klienta | opiekun | w panelu + e-mail |

Notatki wewnętrzne i zmiany etapu oznaczone jako ukryte **nie trafiają do klienta**. Klient może wyłączyć e-maile w Settings. Powiadomienia tworzy baza danych (triggery), więc nie da się ich pominąć z poziomu przeglądarki.

## 5. Uprawnienia (wymuszane w bazie przez Row Level Security)

**Klient:**
- widzi tylko projekty, w których jest członkiem;
- zakłada projekty;
- edytuje listę otworów tylko na etapach Received i Questions;
- wgrywa pliki i pisze wiadomości;
- akceptuje dokumenty oczekujące na jego decyzję;
- **nie może**: zmienić etapu ani terminu, nadać sobie uprawnień pracownika, zobaczyć notatek wewnętrznych, wartości kontraktu ani ukrytych zdarzeń.

**Pracownik (staff):**
- widzi i zmienia wszystko;
- uprawnienia nadaje się wyłącznie poleceniem SQL (sekcja 6).

**Pliki:**
- prywatny bucket w Supabase Storage, dostęp przez linki ważne 5 minut;
- klient pobiera tylko pliki udostępnione jemu.

**Przetestowane:** migrację uruchomiłem na prawdziwym silniku Postgres (PGlite). Wynik:
- próba podniesienia uprawnień przez klienta została zablokowana;
- próba zmiany etapu przez klienta została zablokowana;
- inny klient nie widzi cudzych projektów;
- klient nie może wysłać notatki wewnętrznej ani podrobić wyceny;
- powiadomienia trafiają do właściwych osób.

## 6. Uruchomienie produkcyjne (ok. 30 min)

1. Załóż projekt na [supabase.com](https://supabase.com). Wybierz region **London (eu-west-2)**, bo dane klientów powinny zostać w UK.
2. W **SQL Editor** wklej i uruchom `supabase/migrations/0001_project_portal.sql`.
3. **Authentication → URL Configuration:**
   - Site URL: `https://brickandpane.co.uk`,
   - Redirect URLs: `https://brickandpane.co.uk/portal.html`.
4. Wpisz **Project URL** i **anon public key** w `js/portal/config.js`. Klucz anon jest publiczny z założenia, bo dostęp chroni RLS. Potem uruchom `node build.mjs`.
5. Załóż swoje konto przez `login.html`, a następnie w SQL Editor nadaj sobie uprawnienia:
   ```sql
   update public.profiles set role = 'staff'
   where id = (select id from auth.users where email = 'twoj@brickandpane.co.uk');
   ```
6. **E-maile:**
   - załóż konto w [Resend](https://resend.com) i zweryfikuj domenę `brickandpane.co.uk`;
   - wdróż funkcję: `supabase functions deploy notify-email`;
   - ustaw sekrety: `RESEND_API_KEY`, `MAIL_FROM`, `PORTAL_URL`;
   - w **Database → Webhooks** dodaj webhook: tabela `notifications`, zdarzenie INSERT, wywołuje funkcję `notify-email`.
7. **Auth → Email Templates:** dostosuj treść maili logowania i potwierdzenia do marki.

**Koszt:** Supabase Free na start, Pro 25 USD/mies., gdy potrzebne będą kopie zapasowe i większe pliki. Resend jest darmowy do 3000 e-maili miesięcznie.

## 7. Pliki

| Plik | Rola |
|---|---|
| `supabase/migrations/0001_project_portal.sql` | Schemat, RLS, triggery powiadomień, storage, realtime |
| `supabase/functions/notify-email/index.ts` | Wysyłka e-maili z powiadomieniami (Resend) |
| `js/portal/config.js` | Klucze Supabase. Puste = tryb demo |
| `js/portal/core.js` | Etapy, formatowanie, szacunek wagi panelu |
| `js/portal/store-demo.js` / `store-supabase.js` | Dwie implementacje tego samego API danych |
| `js/portal/ui.js` | Wspólne komponenty: pipeline, status, dokumenty, wiadomości, oś czasu, powiadomienia |
| `js/portal/portal.js` | Panel klienta: lista, szczegóły, nowy projekt, ustawienia |
| `js/portal/admin.js` | CRM: tablica, lista, panel sterowania projektem |
| `js/portal/login.js`, `src/pages/login.html`, `portal.html`, `admin.html` | Strony |

## 8. Dalszy rozwój (propozycje)

- **Zaproszenia do projektu:** architekt zaprasza klienta-inwestora albo kolegę z pracowni. Tabela `project_members` jest już gotowa.
- **Tygodniowe podsumowanie e-mail** (opcja `notify_digest` jest już w profilu) oraz **alert o przekroczonym terminie** dla zespołu. Oba przez zaplanowaną funkcję (Supabase cron).
- **Formularz z `contact.html` zapisywany od razu jako projekt** dla zalogowanych, a dla niezalogowanych jako lead w CRM.
- **Wersjonowanie rysunków** z porównaniem rewizji oraz komentarze przypięte do konkretnego rysunku.
- **Harmonogram dostaw** z datami poszczególnych partii przy dużych pakietach dla deweloperów.
- **Eksport rejestru zmian i akceptacji do PDF** jako „golden thread” na przekazanie budynku.

## 9. Szacunek budżetu i konta dla osób prywatnych (dodane 14.10.2026)

**Jak działa wycena:**
- Kalkulator na stronie produktu i formularz nowego projektu w portalu liczą **natychmiastowy szacunek budżetu**. Wynik ma postać widełek ±15%, kwot netto, z dostawą i montażem w Londynie.
- **Formalną wycenę** nadal przygotowuje zespół: wgrywa PDF w CRM, a klient akceptuje go online.
- Do czasu wgrania wyceny projekt pokazuje szacunek. CRM widzi, jaką kwotę klient zobaczył.

**Cennik:** jedna tabela w `js/pricing.js`, którą trzeba uzupełnić:
- stawka za m² dla każdego systemu,
- stawka za panel,
- minimum za otwór,
- mnożniki szkła,
- dopłata za próg bez stopnia,
- ryczałt za dźwig lub robota.

Obecne liczby są **przykładowe**. Dlatego:
- `enabled: false`, czyli na publicznych stronach ceny są **ukryte**, a zamiast nich widać zachętę do zapisania otworu w portalu;
- w portalu demo i pod adresem z `?preview=pricing` szacunek jest widoczny, z wyraźną etykietą „Example rates — not Brick & Pane prices”;
- po wpisaniu prawdziwego cennika ustaw `enabled: true` i uruchom `npm run build`.

**Typy kont:**
- **Architekt**: pełny pipeline 12 etapów, etap RIBA, język techniczny.
- **Deweloper**: jak architekt.
- **Osoba prywatna**: prostszy język („Your quote is ready”, „Being made”, „Delivery booked”) i **pasek śledzenia zamówienia jak w sklepie**: Quote → Order → Made → Delivered → Installed. Formularz nazywa się „Get a price” i nie ma pola etapu RIBA.

**Ścieżka z kalkulatora:**
1. Przycisk „Save to your portal” zapisuje otwór z kalkulatora.
2. Po zalogowaniu lub założeniu konta formularz nowego projektu jest już wypełniony tym otworem i szacunkiem.

**Baza:** uruchom też `supabase/migrations/0002_accounts_estimates.sql`. Dodaje typ konta (`account_type`) i pola szacunku przy projekcie. Przetestowane na PGlite.

**Następny krok (propozycja):** wpłata zaliczki online przy akceptacji wyceny (Stripe Checkout). Wtedy przejście „Quote → Order” dzieje się automatycznie, jak w sklepie.

## 10. Zespół, rejestr zmian, płatności (po audycie person, 14.10.2026)

- **Role w projekcie:** owner, architekt, klient, wykonawca, inżynier.
  - Właściciel projektu zaprasza osoby e-mailem w zakładce Overview, sekcja Team.
  - Konto, które już istnieje, dołącza od razu. Nowa osoba dołącza automatycznie po założeniu konta.
- **Kto akceptuje co:**
  - **wycenę** akceptuje klient (albo właściciel, który nie jest architektem);
  - architekt może ją zaakceptować **w imieniu klienta** tylko wtedy, gdy w zespole nie ma klienta, i musi to zadeklarować;
  - **rysunki** architekt lub inżynier oznacza jako „Reviewed — no comments” albo „Reviewed — with comments”;
  - przed akceptacją wyceny widać kwotę i rewizję, a zgodę trzeba potwierdzić zaznaczeniem pola.
- **Rejestr zmian (zakładka Changes):**
  - każda zmiana specyfikacji ma opis i **wpływ na U-value, bezpieczeństwo, szczelność, koszt i termin**;
  - propozycje Brick & Pane zatwierdza zespół klienta, a prośby zespołu klienta rozpatruje Brick & Pane;
  - całość jest zapisana z datami. To realizacja obietnicy „no silent substitutions”.
- **Terminy i płatności:**
  - zespół wpisuje datę dostawy i montażu, a klient dostaje powiadomienie;
  - harmonogram płatności (zaliczka, przy dostawie, na koniec) jest widoczny u klienta: „Paid £X of £Y”.
- **CRM:**
  - wybór nowego etapu nie ma wartości domyślnej, więc nie da się przesunąć projektu przez pomyłkę;
  - notatka wewnętrzna ma osobny tryb z innym kolorem i przyciskiem;
  - tablica pokazuje wszystkie etapy bez przewijania;
  - opisy są pisane z perspektywy pracownika.
- **Baza:** uruchom `supabase/migrations/0003_team_changes_payments.sql`. Reguły są wymuszane w bazie, m.in. prawo do akceptacji wyceny i decyzje o zmianach.
- **Testy:** `npm test` uruchamia budowanie strony, testy reguł bazy (`tests/db`, prawdziwy Postgres w PGlite) i testy w przeglądarce (desktop, tablet, mobile).
