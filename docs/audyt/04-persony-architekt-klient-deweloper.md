# Audyt 4: czy strona przekonuje? Trzy persony

**Data:** 14.10.2026. Trzech agentów przeszło stronę w przeglądarce (desktop i mobile), każdy jako inna osoba. Strona była w stanie pre-launch: wartości „Indicative”, portal w trybie demo.

## Werdykty

| Persona | Decyzja | Co przekonało | Co zablokowało |
|---|---|---|---|
| **Architekt** (pracownia 12 osób, rozbudowa w Hackney, 5,6 m) | **MOŻE.** Wyśle rysunki do darmowego review, ale nie wpisze firmy do specyfikacji. | Hasło „Specified as drawn” trafia w jego problem; sizing tool z jawnym wzorem; design guide i checklista Stage 3; zmiany tylko na piśmie; deliverables per etap RIBA. | Brak nazwy systemu i okuć, brak raportów testów, żadnego pliku do pobrania (wszystko „Preparing”), brak tożsamości firmy. |
| **Klient prywatny** (Walthamstow, kuchnia, £15–25k, telefon) | **MOŻE** | Uczciwe porównanie bi-fold i sliderów; traffic door i wystawanie złożonych skrzydeł; portal ze śledzeniem zamówienia, czyli „dokładnie to, czego nie dają lokalne firmy”; szacunek ceny w podglądzie mieści się w budżecie. | Strona wygląda na skierowaną do architektów; brak zdjęć, ceny z VAT, telefonu, czasu realizacji w tygodniach i gwarancji w latach; żargon; straszący komunikat o regule 25% / SAP. |
| **Deweloper / GC** (osiedla 8–30 lokali, pakiet £150–400k) | **MOŻE** na zapytanie o budżet; **NIE** na kontrakt. Ewentualnie mały pakiet £20–40k. | Uczciwe statusy, change control, mock-up, własny montaż, portal z odpowiedzialnością i terminami. | Brak danych spółki, polis z kwotami, SSIP/Constructionline/FENSA, nazwanego zakładu i zdolności produkcyjnej, stron okien i drzwi wejściowych z PAS 24, warunków komercyjnych; portal nie obsługuje pakietu wielolokalowego. |

**Wniosek:** różnicę względem rynku **widzą wszyscy trzej**. Najmocniejsze wyróżniki to portal, narzędzia i uczciwość. Nikt nie złoży jeszcze zamówienia z jednego powodu: **brakuje dowodów tożsamości i wiarygodności firmy**. Kod tego nie naprawi; potrzebne są dane od właściciela.

## A. Do zrobienia przez właściciela (blokuje „TAK” u wszystkich trzech)

1. Dane spółki: Companies House, adres, VAT, telefon, dyrektorzy i zespół z nazwiskami i doświadczeniem.
2. Nazwany system house, system i okucia, zakład produkcyjny (ISO 9001 / FPC) oraz zdolność produkcyjna i montażowa w liczbach.
3. Raporty testów z numerami: certyfikowane Uw, PAS 24:2022, BS 6375 / EN 12207/8/10.
4. Polisy z kwotami (EL, PL, product, PI), daty uzyskania SSIP, Constructionline i FENSA/CERTASS.
5. Gwarancja: długość w latach, czy jest ubezpieczona, kto ją daje i w jakiej formie (bond, PCG, insurance-backed deposit).
6. Czas realizacji w tygodniach dla każdego systemu.
7. Prawdziwy cennik, żeby włączyć szacunki publicznie (dla klientów prywatnych z VAT).
8. Zdjęcia: próbki, profile, wykończenia, warsztat, ekipa. Nie realizacje, ale coś realnego do obejrzenia.
9. Pierwszy plik do pobrania bez logowania: DWG z detalem progu bez stopnia dla lift & slide, nawet jako „draft rev P1”.
10. Warunki komercyjne dla deweloperów: ważność ceny, retention, odpowiedzialność projektowa, rola w BSA / Gateway.

## B. Do poprawienia w kodzie (bez danych od właściciela)

> **Status 14.10.2026: wszystkie punkty z części B są zrobione** (PR #4), poza trybem pakietowym dla deweloperów, który jest oznaczony jako „później”. Część A nadal czeka na dane od właściciela.

**Spójność i uczciwość komunikatów:**
- Home: „Technical data: published” zmienić na prawdziwy status. /architects: pogodzić „Gated downloads: none” ze statusem „Preparing”.
- /projects: zmiękczyć „Lower risk than an established supplier”.
- Slim sliding: rozbieżność 250 kg (tabela parametrów) i 200 kg (narzędzie).
- Narzędzie: „Glazed area” to w rzeczywistości powierzchnia otworu, trzeba zmienić etykietę; dodać szybę potrójną laminowaną.
- Demo: szacunek ma być spójny z wyceną (Hartley Road £20k kontra £38,4k), a budżety w portalu zaokrąglone do widełek, nie co do funta.

**Klient prywatny:**
- Strona i pozycja w menu „For homeowners” pisane prostym językiem.
- Ceny z VAT dla osób prywatnych.
- Komunikat o regule 25% / SAP przetłumaczony na „co zrobić”.
- Formularz kontaktowy: filtrowanie opcji „What do you need?” dla osoby prywatnej i przenoszenie wymiarów z narzędzia.
- „Get a price” bez fachowego słownictwa.
- Uprzedzenie o „preview mode” na górze formularza.

**Portal:**
- Rejestr zmian (change requests) z akceptacją architekta, bo to główna obietnica firmy.
- Rozdzielenie ról: architekt daje „reviewed / no comments” na rysunkach, klient akceptuje wycenę.
- Potwierdzenie z widoczną kwotą i rewizją przed kliknięciem „Approve”.
- Zapraszanie członków zespołu (konstruktor, wykonawca, klient).
- Import harmonogramu z XLSX/CSV.
- Listy layoutów filtrowane po wybranym systemie.
- Data dostawy i harmonogram płatności widoczne w trackerze.
- Demo dewelopera na przykładzie „Northfield Terrace”.

**CRM:**
- Teksty w panelu z perspektywy pracownika (nie klienta).
- Wyraźne oddzielenie notatek wewnętrznych od wiadomości do klienta.
- Domyślna wartość w „Move stage” nie może prowadzić do przypadkowej zmiany etapu.
- Tablica bez marketingowej nawigacji i bez uciętych kolumn.

**Mobile:**
- Tabela porównawcza traci nagłówki kolumn.
- Harmonogram otworów i tabela „Openings” w portalu są nieczytelne.
- Przyklejony pasek zasłania pola formularza.
- Dymek powiadomienia zasłania pole formularza.
- Napisy na rysunku w narzędziu są za małe.
- Kolejność dat w pipeline się myli.

**Później (tryb pakietowy dla deweloperów):**
- struktura plot / lokal,
- partie dostaw i statusy per lokal,
- rejestr usterek (snagging),
- rozliczenia etapowe (valuations, variations, retention),
- role w zespole klienta i raport tygodniowy.
