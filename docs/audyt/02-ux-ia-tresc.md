# Audyt 2: UX, architektura informacji i treść

> Raport agenta „UX designer / UX writer / IA”, 14.10.2026. Zakres: 6 stron, desktop 1440 px i mobile 390 px, testy w Playwright (zrzuty ekranu, menu, formularz). Nie powtarza audytu technicznego (`00-techniczny-i-seo.md`).

## 0. Najważniejsze wnioski z testów

- **Formularz zamyka ścieżkę konwersji z błędem.** Wysłałem błędny e-mail („bad”) i puste pola. Strona pokazała „Thank you”, a `f.reset()` skasował wpisane dane. Po podłączeniu backendu przyjmie śmieciowe leady, a użytkownik straci treść wiadomości.
- **`contact.html?type=architect` nic nie robi.** Parametr nie jest obsługiwany, a „architect” jest zaznaczony tylko dlatego, że to pierwsza opcja na liście. Z przycisku „Make a trade enquiry” architekt trafia do ogólnego formularza. Nie ma pola na pliki, etap RIBA ani system.
- **Główny CTA na podstronach jest daleko w dół.** Products: jedyny CTA na y=4006 px na mobile i 2722 px na desktopie. Architects: 3669 px na mobile. Projects i About nie mają żadnego CTA. W nagłówku nie ma przycisku ani telefonu.
- **Home na mobile ma 6092 px wysokości**, w tym 9 placeholderów. Grafika w hero to okno uchylne z klamką, a nie sash, czyli produkt numer 1 w Londynie.
- **Esc nie zamyka menu mobilnego.** Menu to 6 pozycji bez hierarchii i bez CTA.
- **„Precision-made” pada 13 razy**, „London & Home Counties” 18 razy, „on request” 4 razy (zawsze tam, gdzie architekt szuka danych). Znaczników [TBC] jest łącznie 67.

## 1. Ewaluacja heurystyczna

Oznaczenia: K = krytyczny, W = wysoki, Ś = średni, N = niski.

| # | Strona / element | Problem (heurystyka) | Waga | Poprawka |
|---|---|---|---|---|
| 1 | Wszystkie strony, nagłówek | Nie ma stałego CTA ani telefonu. Konwersja zależy od przewinięcia do stopki (widoczność, efektywność). | K | Prawy róg: „Request a quote” (przycisk) + `tel:`. Na mobile sticky dolny pasek z 2 akcjami: „Quote” i „Call”. |
| 2 | Home, hero | H1 „Precision-made, fitted with London care.” nie mówi, co robicie ani dla kogo. CTA „Architect support” to etykieta działu, a nie zadanie (dopasowanie do świata użytkownika). | K | Nowe H1 i CTA zadaniowe (sekcja 5). Ścieżki według roli: Architects / Developers / Homeowners. |
| 3 | Home, karty 01–04 | Obietnice bez dowodu („Clear lead times” → [TBC]). Na stronie, która ma budować zaufanie, to antydowód. | K | Na start pokazać tylko to, co da się udowodnić: liczby, terminy, gwarancję. Resztę ukryć. |
| 4 | Products | Jedna długa strona z 3 rodzinami. Nie ma podstron systemów, parametrów, sash, filtrów ani porównania (rozpoznawanie zamiast przypominania). | K | Strony systemów z tabelą danych i plikami (sekcja 3). |
| 5 | Architects, karta 02 | „DWG and BIM available on request”: architekt na etapie 4 chce pobrać plik, a nie pisać maila (kontrola użytkownika). | K | Technical Library z pobieraniem bez bramki. E-mail opcjonalnie, tylko przy paczce ZIP. |
| 6 | Contact, formularz | Nie ma walidacji, uploadu, pól RIBA, skali i terminu. Komunikat sukcesu pojawia się przy błędzie (zapobieganie błędom, status systemu). | K | Formularz wieloetapowy z sekcji 4. Walidacja inline, dane zachowane po błędzie. |
| 7 | Projects | 6 pustych kafli i tekst „no real projects are shown”: jawne przyznanie się do braku doświadczenia. | K | Ukryć w nav do czasu 3 case studies. Do tego czasu „Sample details” i „Our team’s past work” (sekcja 6). |
| 8 | Brak strony dla deweloperów | Inwestor nie ma swojej ścieżki. „Contractor / developer” jest schowany w selekcie. | W | Strona Developers + PQQ pack. |
| 9 | Brak Heritage | W Londynie to najczęstszy problem architekta, a strona go nie porusza. | W | Strona Heritage & Conservation (sekcja 3). |
| 10 | Nawigacja | „For Architects” to segment, a „Products” to katalog: dwa różne modele mentalne w jednym pasku. Na mobile 6 równorzędnych pozycji bez CTA. | W | IA według zadań (sekcja 3). |
| 11 | Architects, „How we work” | Proces bez czasów („Quotation — itemised pricing”). Nie wiadomo, ile trwa każdy krok. | W | Każdy krok z SLA: „Schedule review — 2 working days” itd. |
| 12 | Products → Contact | CTA „Need help choosing? Contact us” gubi kontekst: produkt nie przechodzi do formularza. | W | `?system=sash-timber` z prefillem i chipem „You’re asking about: Timber sash”. |
| 13 | Home, „The range” | Linki-kotwice „View windows →” prowadzą do tej samej strony. Mało czytelne cele kliknięcia na mobile. | Ś | Linki do realnych podstron, cała karta klikalna, min. 44 px. |
| 14 | About | H1 „Brick for the city. Pane for the light.” to gra słów bez informacji. Brak ludzi, doświadczenia i miejsca produkcji. | Ś | Twarze zespołu, lata doświadczenia, łańcuch dostaw (sekcja 6). |
| 15 | Contact, mobile | Przycisk „Send enquiry” na y=1700 px, pod blokiem danych kontaktowych pełnym [TBC]. | Ś | Na mobile formularz pierwszy, dane kontaktowe niżej. |
| 16 | Hero na mobile | Rysunek SVG zajmuje drugi ekran i nic nie wnosi. | Ś | Zdjęcie realizacji lub detal przekroju (max 40 vh), albo usunąć. |
| 17 | Eyebrow „01 · Windows”, numeracja kart | Szum dekoracyjny (minimalizm). | N | Usunąć numerację. |
| 18 | Stopka | Nie ma linków do biblioteki, Developers, Heritage, polityk ani godzin pracy. | N | Pełna stopka-mapa. |

## 2. Kluczowe ścieżki użytkownika

**(a) Architekt, RIBA 3–4, DWG/BIM + U-value pod Part L**
Obecnie: Home → „Architect support” → karta „available on request [TBC]” → przewija 3,6 tys. px do „Make a trade enquiry” → ogólny formularz bez wyboru systemu i bez plików → czeka nie wiadomo ile. **Ścieżka pęka w kroku 2.** Architekt nie widzi żadnej liczby i wraca do Google lub NBS Source.
Ideał: Google („timber sash U-value DWG”) albo nav Specifiers → **Technical Library** (filtr: materiał / typ / plik) → strona systemu → tabela: Uw 1,2 W/m²K przy Ug 1,0, PAS 24, BS 6375, Rw → przycisk „Download DWG / RVT / NBS clause” (bez bramki) → baner kontekstowy „Need a Part L check on your schedule? Upload it — reply in 2 working days.” → formularz z prefillem systemu. Cel: od wejścia do pliku maksymalnie 3 kliknięcia.

**(b) Deweloper, 40 lokali: cena + termin + wiarygodność**
Obecnie: nie ma strony dla niego. Home nie podaje terminu ([TBC]), Projects są puste, akredytacje to placeholdery. **Ścieżka pęka od razu.** Deweloper nie zostawi danych firmie, która nie pokazuje polis.
Ideał: nav Developers → pierwszy ekran: skala („Packages from 10 to 200 units”), lead time w tabeli, widełki £/m² → pasek akredytacji i polis z kwotami → „Download PQQ pack” (PDF: polisy, H&S, RAMS, gwarancja, CV kierownika projektu) → „Send your window schedule — budget price in 5 working days” → upload XLSX/PDF + liczba lokali + data startu → potwierdzenie z nazwiskiem opiekuna.

**(c) Architekt, listed terrace w conservation area**
Obecnie: słowo „sash” nie pada na stronie. Jedyny trop to „traditional-style casements for conservation settings”. **Ścieżka pęka całkowicie**, a to najczęstszy londyński scenariusz.
Ideał: nav Heritage → „Listed or conservation area?” → wyjaśnienie LBC i planning (bez porad prawnych) → systemy: box sash ze sznurem i ciężarkami, spring balance, slim/vacuum DG, putty-line, ciągłe szprosy → detale porównawcze „existing vs proposed” do Heritage Statement → „Heritage survey: we record existing joinery and supply drawings for your LBC application” → kontakt z polem „Listed grade / conservation area / Article 4”.

**(d) Właściciel domu, wymiana sash**
Obecnie: Products → brak sash → Contact → ogólny formularz. Brak widełek ceny, procesu i FENSA.
Ideał: Home → kafel „Homeowners” lub Heritage → strona Sash: zdjęcia, „Typical cost: from £X per window, fitted” (orientacyjnie), proces w 5 krokach z czasami, FAQ (planning, FENSA, praca w zamieszkanym domu) → krótki formularz (kod pocztowy, liczba okien, zdjęcia z telefonu) → „Book a survey”.

## 3. Architektura informacji i wireframe’y

**Nawigacja desktop** (rozwijany panel tylko dla Products i Specifiers):
`Windows & Doors ▾ | Facades | Heritage | Specifiers ▾ | Developers | Projects | About` + po prawej `020… | [Request a quote]`
- Windows & Doors ▾: kolumny Windows (Sash, Casement, Tilt & turn, Steel-look, Rooflights), Doors (Entrance, French, Sliding/lift & slide, Bi-fold), Materials (Timber, Aluminium, uPVC), a w panelu „Compare systems →”.
- Specifiers ▾: Technical Library, Compliance guides (L/O/Q/B/F), Samples, CPD, „Upload a schedule”.

**Mobile:** sticky dolny pasek `Quote · Call · Library`. Menu pełnoekranowe na akordeonach, na górze 3 „szybkie zadania” (Download details / Book CPD / Get a price), na dole telefon i e-mail. Esc i klik w link zamykają menu.

**Home**
1. Hero: zdjęcie realizacji, H1 + podtytuł, 2 CTA (Request a quote / Technical library), linia dowodu (akredytacje + „Reply within 1 working day”).
2. Selektor ról: 3 kafle, każdy z jednym zadaniem: „I’m specifying” / „I’m developing” / „It’s my home”.
3. Systemy: 6 kafli z Uw i sightline pod nazwą.
4. Heritage teaser: zdjęcie sash + 3 punkty + link.
5. Proof: 1 case study z liczbami + logotypy akredytacji.
6. Proces z SLA (5 kroków).
7. CTA końcowe + upload.

**Strona systemu** (np. Timber Box Sash)
Breadcrumb → hero (zdjęcie, nazwa, 1 zdanie, CTA „Download all files” / „Request sample”) → **tabela danych** (Uw, Ug, g, Rw, PAS 24, BS 6375, sightline, max wymiar, materiały, wykończenia) → pliki (DWG head/sill/jamb, RVT/IFC, NBS, DoP/UKCA, instrukcja) z rozmiarem i datą wersji → opcje (szklenie, szprosy, okucia, RAL/gatunki) → zgodność z przepisami (Part L/F/Q w 3 linijkach) → lead time + „from £” → powiązane realizacje → FAQ → CTA kontekstowy.

**Heritage & Conservation**
Hero „Listed buildings and conservation areas” → „What usually gets approved” (lista) → systemy heritage → detale porównawcze → nasza pomoc przy LBC (survey, rysunki, specyfikacja dla officera) → mini case study → FAQ → CTA „Book a heritage survey”.

**Specifiers hub / Technical Library**
Wyszukiwarka + filtry (system, materiał, typ pliku, Part) → lista plików z przyciskiem pobrania i formatem → boczny panel: Samples, CPD, Upload schedule → compliance guides → kontakt do technicznego (imię, zdjęcie, telefon bezpośredni).

**Developers**
Hero ze skalą i SLA → tabela lead time → widełki cen → akredytacje i polisy (kwoty) → PQQ pack → proces dla kontraktu (pomiar, mock-up, dostawy etapami, snagging, O&M) → realizacje / CV zespołu → CTA „Send your schedule”.

**Case study**
Nagłówek z faktami (dzielnica, typ budynku, rola klienta, liczba elementów, systemy, czas realizacji) → wyzwanie → rozwiązanie (detal, Uw) → zdjęcia przed i po → cytat architekta z nazwiskiem i pracownią → pliki („Details used on this project”) → CTA.

**Contact / Quote**
Wybór ścieżki (3 karty: Quote/schedule, Samples, CPD) → formularz → obok: SLA, osoba odpowiedzialna, telefon, adres studia → „What happens next” (3 kroki).

## 4. Formularze i konwersja

**Quote / project enquiry** (3 kroki z paskiem postępu, dane zachowane między krokami):
1. *About you:* rola (karty: Architect / Developer–Contractor / Homeowner / Other), imię, e-mail, telefon (opcjonalnie: „Only if you’d like a call”), firma lub pracownia (tylko dla ról B2B).
2. *Project:* kod pocztowy; typ (New build / Refurb / Listed / Conservation area: multi-select); **dla architekta** etap RIBA 0–7 (segmentowany); **dla dewelopera** liczba lokali i wartość pakietu (widełki); **dla właściciela** liczba okien i drzwi; systemy (chipy, prefill z URL); data startu na budowie (miesiąc/rok, „Not sure yet”).
3. *Files & notes:* drag & drop, PDF/DWG/XLSX/JPG, do 50 MB, wiele plików, pasek uploadu; wiadomość opcjonalna; zgoda RODO + link do polityki.

Mikrocopy:
- Pomoc przy uploadzie: „Drawings, a window schedule or phone photos — whatever you have.”
- Przycisk: „Send for review”, a nie „Submit”.

Błędy inline przy polu, po opuszczeniu pola, z ikoną i tekstem:
- „Enter an email like name@practice.co.uk”
- „This file is over 50 MB — try a PDF export or send a WeTransfer link below.”
- Błąd sieci: „We couldn’t send that. Your details are saved — try again, or email hello@…”

Potwierdzenie (osobna strona, zdarzenie analityczne):
- „Thanks, Anna. Tom Harris, our technical lead, will reply by 5pm tomorrow.”
- Numer referencyjny, lista przesłanych plików, „Add more files” (link w mailu).
- Follow-up: automatyczny mail z kopią, kontakt w ciągu 1 dnia roboczego, wycena w 5 dniach roboczych, przypomnienie po 7 dniach.

**Sample request:** system/materiał (chipy), wykończenie (RAL/gatunek), max 4 próbki, adres studia, nazwa projektu (opcjonalnie). Komunikat: „Posted within 2 working days. Central London studios: hand-delivered on request.”

**CPD booking:** wybór tematu (karta z czasem trwania, akredytacją i efektami nauczania), format (in-practice / online), 2–3 preferowane terminy, liczba osób, adres. Potwierdzenie: „We’ll confirm a date within 1 working day. Lunch is on us; certificates follow by email.”

## 5. Treść i copy

**Do usunięcia lub przepisania:**
- „Precision-made” (13 razy). Słowo, które nic nie znaczy, bo każdy producent tak pisze.
- „fitted with London care”, „Considered from specification to final sealant line”, „quiet, dependable part of your project team”, „curated range”, „Start a conversation”, „Three families, many materials”, „Brick for the city. Pane for the light.”
- „available on request” (zamienić na link).
- Powtórzenie „with careful… with careful”.
- „London & the Home Counties” (18 razy; wystarczy raz w stopce i raz w hero).
- „UK team” jako zastępnik dowodu.
- „Honest”, „Reliable” bez liczby obok.

**Hero, 3 warianty:**
- A (problem): **„Windows and doors for London’s hardest buildings.”** / „From listed Georgian terraces to new-build facades: specified with you, installed by our own fitters.” / CTA: *Get a price* · *Download details*
- B (specyfikujący): **„Specify it once. We’ll make it work on site.”** / „Timber sash, steel-look and aluminium systems with published U-values, DWGs and lead times. No ‘on request’.” / CTA: *Open the technical library* · *Upload a schedule*
- C (heritage + skala): **„Sash windows for conservation areas. Curtain walling for 200-unit schemes.”** / „One London team for both, with the paperwork planners and principal contractors ask for.” / CTA: *Request a quote* · *See our heritage range*

**Value props** (każdy z liczbą lub dowodem):
1. „Data first. U-values, PAS 24 and acoustic ratings on every system page.”
2. „Two-day schedule review. Send drawings, get marked-up comments and a budget price.”
3. „Lead times you can programme. Published monthly, per system.”
4. „Our own installers. No subcontracted fitting; one project manager from survey to handover.”
5. „Heritage done properly. Slim double glazing, putty lines and drawings for your LBC application.”

**Główne CTA:**
- „Architect support” → *Download details*
- „Explore products” → *Compare systems*
- „Contact us” → *Get a price* lub *Send your schedule*
- „Make a trade enquiry” → *Request files & samples*

**Tone of voice:** konkretny, techniczny, spokojny. Brytyjska pisownia (colour, aluminium, programme). Liczba zamiast przymiotnika. Krótkie zdania w trybie oznajmującym. Zwrot „you” do czytelnika, „we” tylko z dowodem. Bez superlatywów, bez „bespoke” i „luxury”. Terminy branżowe (sightline, Uw, RIBA Stage) bez tłumaczenia dla B2B, z objaśnieniem na stronach dla homeownerów. Zasada: jeśli zdanie pasuje do strony konkurenta, skreślić je.

## 6. Architektura zaufania

| Dowód | Gdzie |
|---|---|
| Akredytacje (FENSA/CERTASS, Constructionline, CHAS), polisy PL/PI z kwotami | Pasek pod hero na Home, Developers (pełne), stopka (logotypy), PQQ pack |
| Gwarancja (lata, insurance-backed) | Strony systemów, Developers, potwierdzenie formularza |
| Case studies z liczbami | Home (1), strony systemów (powiązane), Heritage, Developers |
| Cytaty z nazwiskiem i pracownią | Obok CTA formularza i w case study, nigdy anonimowo |
| Zespół (twarze, doświadczenie, telefon bezpośredni) | About, Specifiers hub (techniczny), Developers (PM), potwierdzenie |
| Producent / fabryka (certyfikaty ISO, testy) | About, strony systemów |
| Dane spółki, adres, VAT | Stopka, Contact |

**Wiarygodny start przy małej liczbie projektów:**
1. Zamiast pustej galerii opublikować 2–3 realizacje jako pełne case studies, nawet małe (jeden sash w Islington też się liczy).
2. „Our team’s track record”: wcześniejsze projekty ludzi z zespołu, uczciwie podpisane jako „delivered by our team members at previous firms”.
3. Pożyczyć zaufanie od dostawcy systemów (marka profili, testy, certyfikaty fabryki) i pokazać fabrykę na zdjęciach.
4. Treść ekspercka jako dowód kompetencji: przewodniki Part L i Heritage oraz biblioteka DWG. Te materiały działają od pierwszego dnia, a ich darmowe udostępnianie buduje relację z architektami.
5. Publiczne SLA i gwarancja satysfakcji przy próbkach i CPD (niskie ryzyko pierwszego kontaktu).
6. Pilotowe CPD w 5–10 pracowniach, a z nich pierwsze cytaty i referencje.
7. Mock-up lub sample window dla pierwszych deweloperów.
8. Nie publikować niczego oznaczonego [TBC]. Lepsza krótsza strona niż obietnica bez pokrycia.

**Priorytet wdrożenia:** formularz + sticky CTA + hero/copy (tydzień 1) → strony systemów z danymi i Heritage/Sash (tydzień 2–4) → Library, Developers z PQQ, próbki i CPD online (miesiąc 2).
