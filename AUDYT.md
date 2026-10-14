# Brick & Pane: pełny audyt strony (podsumowanie)

**Data:** 14.10.2026 · **Strona:** brickandpane.co.uk (wersja testowa)
**Cel:** strona numer 1 w branży stolarki okiennej i drzwiowej w UK, głównie w Londynie. Ma być minimalistyczna i nowoczesna, a przede wszystkim rozwiązywać problemy **architektów** i **inwestorów**.

Ten dokument łączy cztery niezależne audyty. Szczegóły są w `docs/audyt/`:

| # | Raport | Perspektywa |
|---|---|---|
| 0 | [`00-techniczny-i-seo.md`](docs/audyt/00-techniczny-i-seo.md) | Kod, SEO, dostępność, prawo UK, wydajność |
| 1 | [`01-produkt-i-rynek.md`](docs/audyt/01-produkt-i-rynek.md) | Konkurencja, problemy rynku (ze źródłami), persony, pozycjonowanie, usługi, KPI |
| 2 | [`02-ux-ia-tresc.md`](docs/audyt/02-ux-ia-tresc.md) | Heurystyki, ścieżki użytkowników, architektura informacji, wireframe’y, formularze, copy |
| 3 | [`03-ui-marka-design-system.md`](docs/audyt/03-ui-marka-design-system.md) | Wygląd, logo, design system, brief zdjęciowy, kierunki wizualne, wdrożenie |

---

## 1. Werdykt

**Kod jest w porządku: lekki, szybki i responsywny. Słabe są produkt, treść i dowody wiarygodności.** Strona mówi, kim firma jest, ale nie odpowiada na żadne z pytań, z którymi architekt lub inwestor na nią trafia. Wszystkie cztery audyty doszły do tego samego wniosku niezależnie od siebie.

| Obszar | Ocena |
|---|---|
| Fundament techniczny | 7/10 |
| Wygląd i marka | 4/10 |
| UX i konwersja | 2/10 |
| Treść i pozycjonowanie | 2/10 |
| Odpowiedź na potrzeby architektów | 2/10 |
| Odpowiedź na potrzeby inwestorów | 1/10 |
| Wiarygodność | 1/10 |
| SEO | 2/10 |
| Dostępność | 5/10 |

---

## 2. Dwanaście najważniejszych ustaleń

1. **Brakuje okien sash**, czyli produktu numer 1 w Londynie. Słowo „sash” nie pada na stronie ani razu. Strony Heritage & Conservation też nie ma, choć w Londynie jest ponad 1000 stref konserwatorskich. *(Audyty 0, 1, 2)*
2. **Wszystko jest „on request”.** Nie ma U-value, PAS 24, plików DWG/BIM ani klauzul NBS. Według badań NBS niepełne dane techniczne to problem numer 1 specyfikujących, a 63–69% z nich wymaga BIM. *(Audyty 1, 2)*
3. **Inwestor nie ma swojej ścieżki.** Nie ma strony Developers ani terminów, cen, polis, akredytacji i pakietu PQQ. *(Audyty 1, 2)*
4. **Formularz działa wadliwie:** pokazuje „Thank you” przy błędnym e-mailu, kasuje wpisane dane i niczego nie wysyła. Parametr `?type=architect` nic nie robi, a trzy pola nie mają atrybutu `name`. *(Audyty 0, 2)*
5. **Przycisk wezwania do działania jest daleko w dół strony** (na Products na mobile dopiero po 4000 px). W nagłówku nie ma przycisku ani telefonu, a Projects i About nie mają żadnego wezwania do działania. *(Audyt 2)*
6. **Na stronie jest 67 znaczników [TBC]**, puste portfolio i ani jednego prawdziwego zdjęcia. Obietnice typu „Clear lead times” z [TBC] obok działają na niekorzyść firmy. *(Audyty 0, 2)*
7. **Teksty są ogólnikowe:** „precision-made” pada 13 razy, „London & Home Counties” 18 razy, a hasła takie jak „fitted with London care” nie niosą żadnej informacji. *(Audyt 2)*
8. **Wygląd przypomina szablon „boutique hotel”:** trzy różne rysunki cegły, trzy style kart, klipartowe okno w hero i eyebrow nad każdym nagłówkiem. To nie jest minimalizm. *(Audyt 3)*
9. **Logo jest technicznie wadliwe.** Napis w SVG nie ładuje fontu (renderuje się Georgia), na ciemnym tle znika, a favicon to cały poziomy znak, nieczytelny przy 16 px. *(Audyt 3)*
10. **Na tablecie (761–980 px) nawigacja się łamie.** *(Audyt 3)*
11. **Kontrast nie spełnia WCAG AA** w dwóch miejscach: złoty tekst na jasnym tle ma 2,79:1, a jasny eyebrow na cegle 4,43:1. *(Audyty 0, 3)*
12. **Brakuje podstaw przed startem:** `noindex` na wszystkich stronach, brak danych spółki (wymaganych przez Companies Act), polityki prywatności, schema, sitemap i OG. *(Audyt 0)*

---

## 3. Strategia: jak zostać numerem 1

### 3.1 Luka rynkowa *(audyt 1)*
- Producenci mają dane, ale nie montują. Instalatorzy montują, ale nie mają danych. **Nikt nie łączy jednego i drugiego.**
- W segmencie premium nikt nie publikuje terminów realizacji ani orientacyjnych cen.
- Po Building Safety Act nikt nie sprzedaje „braku zamienników” i kontroli zmian jako usługi. Tymczasem w okresie 10/2023–03/2025 73% wniosków Gateway 2 zawierało za mało szczegółów.
- Wiedza konserwatorska i nowoczesne fasady to dziś dwa różne typy firm.

### 3.2 Pozycjonowanie (rekomendacja)
**„Specified as drawn. Delivered as programmed.”**
Partner techniczny architekta (dane na poziomie producenta i własny montaż) oraz pewność terminu dla inwestora. Londyńska wiedza konserwatorska służy jako lokalny dowód.

**Produkcja w UE: mówić o niej otwarcie i robić z niej atut.** Nazwać fabrykę, pokazać certyfikaty i DoP, przypomnieć, że znak CE jest uznawany w UK bezterminowo, i wspomnieć o magazynie części w Londynie oraz gwarancji brytyjskiej spółki. Ukrywanie tego zemści się na etapie DoP albo PQQ.

### 3.3 Usługi, które strona ma „sprzedawać” *(audyty 1, 2)*
1. **48 h Schedule Review:** architekt wrzuca zestawienie lub rysunki i dostaje uwagi zgodności z przepisami oraz budżet ±15%. To główne wezwanie do działania.
2. **Spec Pack dla każdego systemu:** DWG, RVT/IFC, klauzula NBS, DoP, EPD. Pobieranie bez logowania.
3. **Pakiet PQQ w jednym pliku ZIP** dla deweloperów i generalnych wykonawców.
4. **Publikowane terminy realizacji** dla każdego systemu, z datą aktualizacji i opcjonalną gwarancją.
5. **Deklaracja „bez cichych zamienników”** i macierz odpowiedzialności za projekt.
6. **Pakiet planistyczny dla stref konserwatorskich:** rysunki porównawcze i precedensy z danej gminy.
7. **Próbki w 3 dni robocze** i **CPD z akredytacją RIBA**.

### 3.4 Teksty *(audyt 2)*
Hero, rekomendowany wariant: **„Windows and doors for London’s hardest buildings.”**, z podtytułem *„From listed Georgian terraces to new-build facades: specified with you, installed by our own fitters.”* i przyciskami *Get a price* oraz *Download details*.
Zasady: liczba zamiast przymiotnika, brytyjska pisownia, bez „bespoke”, „luxury” i „precision-made”. Jeśli zdanie pasuje do strony konkurenta, skreślić je.

---

## 4. Docelowa struktura *(audyty 0, 2)*

```
Windows & Doors ▾ │ Facades │ Heritage │ Specifiers ▾ │ Developers │ Projects │ About   020… [Request a quote]
  Windows: Sash · Casement · Tilt & turn · Steel-look · Rooflights
  Doors:   Entrance · French · Sliding / lift & slide · Bi-fold
  Specifiers: Technical Library · Compliance guides (L/O/Q/B/F) · Samples · CPD · Upload a schedule
```

- **Mobile:** stały dolny pasek *Quote · Call · Library*, menu na akordeonach.
- **Strona systemu:** zdjęcie, tabela danych, pliki do pobrania, opcje, zgodność z przepisami, termin i cena „od”, realizacje, FAQ.
- **Formularz:** 3 kroki (rola → projekt z etapem RIBA, liczbą lokali i kodem pocztowym → pliki do 50 MB), walidacja w polach i strona potwierdzenia z nazwiskiem opiekuna.

Wireframe’y wszystkich kluczowych stron są w audycie 2, sekcja 3.

---

## 5. Kierunek wizualny *(audyt 3)*

**Rekomendacja: kierunek A „London Stock”** (Sky-Frame + Dinesen + rysunek warsztatowy):
- **Paleta:** tło putty `#f6f4ef`, tekst ink `#1c1b1a`, jeden akcent w kolorze ciemnej cegły `#8b3a26` (maksymalnie ok. 5% ekranu), ciemne sekcje `#161616`. Wszystkie pary kolorów sprawdzone pod WCAG AA.
- **Typografia:** grotesk Söhne (płatny) albo Inter Tight/Inter (darmowy), a do danych technicznych font mono z cyframi tabelarycznymi.
- **Obrazy:** zdjęcia realizacji na pełną szerokość z podpisem technicznym w rogu, np. „Grade II terrace, Islington · Timber box sash, Uw 1.2”.
- **Grafika:** **przekroje profili rysowane linią 1 px** jako motyw graficzny marki. To od razu pokazuje architektom kompetencje.
- **Logo:** uproszczony monogram z linii (otwór w murze z wpisanym oknem), jeden kolor, napis zamieniony na krzywe i komplet wersji (pozioma, pionowa, sam znak, odwrócona).
- **Ruch:** bez karuzel, parallaxu i dark mode na start, za to z celowo ciemnymi sekcjami.

Strona Heritage może korzystać z szeryfu w cytatach i zieleni jako koloru sekcji. To kompromis z kierunkiem B „Heritage Joinery”.

Pełny design system (tokeny, skala typografii, siatka, specyfikacje komponentów) oraz brief zdjęciowy są w audycie 3.

---

## 6. Plan wdrożenia

| Etap | Zakres | Zależy od firmy? |
|---|---|---|
| **Krok 0: dane** | Zebrać karty techniczne systemów (Uw, PAS 24, BS 6375, DoP/UKCA), akredytacje i polisy, realne terminy, widełki cen, pliki DWG/BIM/NBS od producentów, dane spółki i zdjęcia 3 realizacji. **Bez tego każda nowa strona znów będzie pełna [TBC].** | Tak |
| **Tydzień 1** | Działający formularz z uploadem plików i walidacją, przycisk wezwania do działania i telefon w nagłówku, stały pasek na mobile, nowe hero i teksty, poprawki kontrastu i nawigacji na tablecie, skip-link, logo zamienione na krzywe z wersją odwróconą i faviconem, polityka prywatności, ukrycie Projects do czasu pierwszych realizacji. | Częściowo |
| **Tydzień 2–4** | Migracja na Astro (komponenty i treść w plikach), design system „London Stock”, strony systemów z tabelami danych, strona Heritage & Sash, strona Developers & Contractors z PQQ, strona fabryki i łańcucha dostaw, schema, sitemap, OG, profil Google Business. Usunięcie `noindex` dopiero po tym etapie. | Tak (dane) |
| **Miesiąc 2** | Technical Library z filtrami, zamawianie próbek, rezerwacja CPD, 2–3 case studies z danymi, przewodniki zgodności (Part L/FHS 2027, Part O, Heritage), analityka ze zdarzeniami konwersji i CRM. | Tak |
| **Miesiąc 3+** | Kalkulator U-value dla rzeczywistego rozmiaru okna (zgodny z FHS 2027), sprawdzanie strefy konserwatorskiej po kodzie pocztowym, biblioteka EPD/WLC, strony dzielnic z prawdziwymi realizacjami, opinie. | Częściowo |
| **Przewaga długoterminowa** | Generator specyfikacji z eksportem klauzuli NBS, portal projektu dla klienta (status, dokumenty, golden thread), publiczny wskaźnik dotrzymania terminów. | Tak |

**KPI:** kwalifikowane leady w podziale na segment, odsetek projektów ze specyfikacją Brick & Pane (spec-in rate), konwersja z uploadu do oferty i do zlecenia, czas pierwszej odpowiedzi poniżej 4 h, % dotrzymanych terminów, NPS architektów. Plan pomiaru i lista zdarzeń są w audycie 1.

---

## 7. Decyzje dla właściciela

1. **Produkcja w UE:** mówić o niej otwarcie? (rekomendacja: tak)
2. **uPVC:** eksponować czy zostawić jako opcję w tle? (rekomendacja: w tle, bo obniża postrzeganą klasę marki i jest odrzucane w strefach konserwatorskich)
3. **Gwarancja terminu z rabatem za opóźnienie:** czy firma jest gotowa się do niej zobowiązać?
4. **Fonty płatne (Söhne) czy darmowe (Inter):** decyzja budżetowa.
5. **Odświeżenie logo:** uproszczenie istniejącego znaku czy nowy znak?
6. **Hosting:** zostać na GitHub Pages czy przejść na Netlify lub Cloudflare (formularze, nagłówki bezpieczeństwa)?

---

## 8. Zastrzeżenia

- Środowisko blokowało bezpośrednie wejście na strony konkurentów. Ocena konkurencji i benchmarków wizualnych opiera się na wynikach wyszukiwania, NBS, RIBAJ i opiniach. Przed użyciem w materiałach sprzedażowych warto sprawdzić te strony ręcznie.
- Dane regulacyjne (FHS 2027, statystyki Gateway 2) pochodzą ze źródeł podanych w audycie 1. Przed publikacją na stronie powinien je potwierdzić specjalista.
- Strona jest hostowana na GitHub Pages, więc pliki `.md` z repozytorium będą publicznie dostępne pod domeną po scaleniu z gałęzią publikowaną. Przed scaleniem warto przenieść `AUDYT.md` i `docs/` w inne miejsce.
