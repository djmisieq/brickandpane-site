# Audyt 0: techniczny, SEO i treść (pierwszy przegląd)

**Data:** 14.10.2026 · **Zakres:** cały kod repozytorium (6 stron HTML, `css/style.css`, `js/main.js`, logo), zrzuty ekranu desktop 1440 px i mobile 390 px.
**Cel biznesowy:** najlepsza strona w branży stolarki okiennej i drzwiowej w UK, głównie w Londynie. Ma być minimalistyczna i nowoczesna, ale przede wszystkim ma rozwiązywać problemy **architektów** i **inwestorów**.

---

## 1. Werdykt w skrócie

| Obszar | Ocena | Komentarz |
|---|---|---|
| Fundament techniczny | 7/10 | Lekki, czysty statyczny HTML/CSS, szybki, responsywny, bez poziomego scrolla na mobile. Dobra baza. |
| Wygląd / marka | 5/10 | Porządny, ale „szablonowy”: karty z czerwoną belką, klipartowe okno SVG. Nie jest ani minimalistyczny, ani premium. |
| Treść i pozycjonowanie | 3/10 | Ogólniki („precision-made”, „London care”). Brak konkretów, które interesują architekta: U-value, PAS 24, Part L/B/O, konserwacja zabytków, terminy. |
| Rozwiązywanie problemów architektów | 2/10 | Wszystko jest „on request”. Nie ma biblioteki technicznej, detali DWG, specyfikacji NBS, BIM ani narzędzi. |
| Rozwiązywanie problemów inwestorów | 1/10 | Brak terminów, cen orientacyjnych, gwarancji, ubezpieczeń, akredytacji, referencji i realizacji. |
| Zaufanie (trust) | 1/10 | Ponad 20 znaczników [TBC], brak telefonu, adresu, numeru firmy, zdjęć i projektów. Formularz niczego nie wysyła. |
| SEO | 2/10 | `noindex,nofollow` na wszystkich stronach, brak schema, sitemap, OG, canonical. Opisy meta typu „About Brick & Pane.”, brak treści lokalnych. |
| Dostępność (WCAG 2.2 AA) | 6/10 | Dobre etykiety formularza i `lang`. Złoty kolor „eyebrow” nie spełnia wymogów kontrastu, brak skip-linka i `aria-live`. |
| Prawo (UK) | 2/10 | Brak polityki prywatności (UK GDPR), cookies i danych spółki, które są wymagane przez Companies Act 2006. |

**Wniosek:** to jest dobry **szkielet wersji testowej**, a nie jeszcze strona firmy. Kod nie jest problemem. Największa luka leży w **treści, dowodach i narzędziach dla specyfikujących**, i to właśnie te elementy budują pozycję „numer 1”. Najlepsze strony w branży (np. Crittall, Clement, Fineline, Mumford & Wood, Velfac, Schüco, Rationel, Idealcombi) wygrywają danymi technicznymi, zdjęciami realizacji i łatwością specyfikacji, a nie samym wyglądem.

---

## 2. Blokery przed publikacją (P0)

1. **`<meta name="robots" content="noindex,nofollow">` na wszystkich 6 stronach.** Na teście to poprawne, ale przy starcie trzeba to usunąć, bo inaczej Google nie zaindeksuje strony.
2. **Baner „TEST SITE” oraz stopka „Test build — not for publication”.**
3. **Ponad 20 placeholderów [TBC]**: certyfikaty, terminy, gwarancja, telefon, adres, dane spółki, CPD i formaty plików.
4. **Formularz kontaktowy nie jest podłączony** (`js/main.js` tylko pokazuje komunikat). Potrzebny backend, np. Formspree, Basin, Netlify Forms albo własny endpoint, a do tego ochrona antyspamowa (Turnstile lub honeypot) i e-mail potwierdzający.
5. **Strona Projects jest pusta** (6 placeholderów). W tej branży portfolio to najważniejsza sekcja. Lepiej nie publikować jej wcale niż publikować pustą. Wystarczą 3 prawdziwe realizacje.
6. **Brak zdjęć.** Wszystkie obrazy to placeholdery albo rysunek SVG.
7. **Dane prawne:** pełna nazwa spółki, numer rejestrowy, adres siedziby i numer VAT. Companies Act 2006 i Company Regulations 2015 wymagają ich na stronie.
8. **Polityka prywatności i cookies** (UK GDPR / PECR) oraz zgoda przy formularzu.
9. **Błąd w treści:** `index.html`, karta 02, „…with careful craftsmanship, with careful site practice…” (podwojone „with careful”).
10. **Spójność przekazu „UK team”.** Słowa „UK team” i „UK installation” powtarzają się tak często, że brzmią defensywnie. Jeśli produkcja odbywa się w UE (np. w Polsce), lepiej powiedzieć to otwarcie i zrobić z tego atut: „Engineered and manufactured in our EU partner factory, surveyed and installed by our own London team”. Architekci i inwestorzy cenią transparentność łańcucha dostaw, zwłaszcza po Building Safety Act.

---

## 3. Pozycjonowanie: czego naprawdę szukają klienci w Londynie

Obecna strona mówi, **kim jesteśmy**. Strona numer 1 mówi, **jaki problem rozwiązujemy**. Poniżej problemy, które powinny wyznaczać strukturę treści.

### 3.1 Architekt / projektant
| Problem | Jak strona ma go rozwiązać |
|---|---|
| **Strefy konserwatorskie i budynki zabytkowe** (Londyn ma ponad 1000 conservation areas, Article 4 i listed buildings) | Osobna sekcja „Heritage & conservation”: okna przesuwne **sash** (box sash, spring balance), slim/vacuum double glazing, putty-line, glazing bars, wzory dla planning officers, pomoc w Listed Building Consent. **Na stronie w ogóle nie ma okien sash, a to najważniejszy produkt w Londynie.** |
| **Approved Document L (2021)**: U-value okien wymiennych ≤1,4 W/m²K; w nowej zabudowie limit 1,6 przy wartości referencyjnej 1,2 (zob. też Future Homes Standard od 03/2027 w raporcie produktowym) | Tabela parametrów dla każdego systemu: Uw, Ug, g-value, Rw (dB), PAS 24, klasy szczelności i wodoszczelności (BS 6375). Bez „TBC” i bez „on request”. |
| **Part F (trickle vents), Part O (przegrzewanie), Part B (drogi ewakuacji, ognioodporność), Part Q (PAS 24 w nowej zabudowie), Part K/M** | Krótkie przewodniki „How our systems help you comply with Part L / O / Q / B”, każdy z listą kontrolną do pobrania (PDF). |
| **Fasady i Building Safety Act 2022** (Gateway 2/3, budynki HRB) | Dla curtain walling: testy CWCT / EN 13830, klasyfikacja ogniowa materiałów, zasady design responsibility (Contractor’s Design Portion) i pakiet dokumentacji do Golden Thread. |
| **Brak czasu na szukanie danych** | **Technical Library** bez obowiązkowego logowania: DWG (head/sill/jamb, w tym detal na styku z cegłą i cavity closer), RVT/IFC, specyfikacje NBS, karty DoP/UKCA, instrukcje montażu. Formularz z e-mailem tylko dla plików premium. |
| **Odpowiedź po tygodniu** | Konkretne SLA: „Window schedule review in 48 h”, upload rysunków w formularzu, wybór etapu RIBA. |
| **Próbki** | Formularz zamówienia próbek: narożnik profilu, karta RAL, gatunki drewna. Dostawa do studia w Londynie w ciągu X dni. |
| **CPD** | Lista tematów (np. „Specifying windows in London conservation areas”, „Part L & O for glazing”), akredytacja RIBA CPD lub CPD Certification Service i rezerwacja online. |

### 3.2 Inwestor / deweloper / generalny wykonawca
| Problem | Rozwiązanie na stronie |
|---|---|
| Pewność terminu | Opublikowane terminy realizacji dla każdego systemu (np. „Aluminium: 8–10 weeks from signed drawings”), aktualizowane co miesiąc. |
| Pewność ceny | Orientacyjne widełki: £/okno lub £/m² dla typowych systemów, a także itemised quote w X dni i value engineering. |
| Ryzyko wykonawcy | Akredytacje: **FENSA / CERTASS**, Constructionline, CHAS / SafeContractor, ubezpieczenia (PL, PI, EL wraz z kwotami), gwarancja (najlepiej insurance-backed), zgodność z NHBC / LABC Warranty. |
| Moce przerobowe | Skala projektów („from a single sash to 200-unit schemes”), własne ekipy montażowe i kierownik projektu. |
| Logistyka w Londynie | Doświadczenie z dostawami na wąskie ulice, w strefach CPZ i ULEZ, montaż z rusztowania lub od środka, praca w zamieszkanych domach. |
| Dowód | Case studies z danymi: dzielnica, typ budynku, ograniczenia (np. conservation area w Camden), system, U-value, czas realizacji, cytat architekta. |

### 3.3 Klient prywatny (ważny trzeci segment, nawet jeśli nie główny)
Widełki cen, etapy procesu, pomoc z planning permission, certyfikat FENSA, FAQ i finansowanie.

---

## 4. Architektura informacji (propozycja)

Obecnie: Home · Products · For Architects · Projects · About · Contact.

Proponowana:

```
Home
Windows ─ Sash · Casement · Tilt & turn · Steel-look (Crittall-style) · Rooflights
Doors ─ Entrance · French · Sliding / lift & slide · Bi-fold · Steel-look internal screens
Facades ─ Curtain walling · Shopfronts · Glazed screens
Heritage & Conservation      ← osobna strona, kluczowa dla Londynu
Specifiers ─ Technical Library · Compliance guides (Part L/O/Q/B) · Samples · CPD · NBS / BIM
Developers & Contractors     ← terminy, akredytacje, skala, proces
Projects (filtry: dzielnica · typ · materiał · heritage)
About ─ Team · Factory / quality · Accreditations
Contact / Request a quote (upload rysunków)
```

Strony lokalne (SEO), np. „Sash windows Islington”, „Aluminium windows Hampstead” albo „Crittall-style doors Clapham”, mają sens tylko z prawdziwą treścią: realizacją w danej dzielnicy i lokalnymi zasadami konserwatorskimi. Nie warto tworzyć ich masowo.

**Brakujące produkty:** okna **sash** (krytyczne), styl **steel-look / Crittall-style** (bardzo popularny w Londynie), **rooflights / świetliki**, wewnętrzne przeszklone przegrody. Warto też rozważyć, czy uPVC pasuje do pozycjonowania premium. W tej grupie docelowej obniża postrzeganą klasę marki, więc lepiej zostawić je jako niewyeksponowaną opcję.

---

## 5. Design: od „ładnego szablonu” do minimalizmu premium

**Co działa:** paleta cegła, off-white i grafit jest trafna i „londyńska”. Spójna typografia, dużo światła, czytelny układ.

**Co zmienić:**
1. **Hero:** klipartowe okno SVG zastąpić pełnoekranowym, dobrym zdjęciem realizacji (londyńska kamienica, cegła i smukła rama) albo krótkim, cichym wideo. Nagłówek powinien mówić o problemie, np. *„Windows and doors for London’s most demanding buildings — from listed terraces to new-build facades.”*
2. **Mniej elementów dekoracyjnych:** zrezygnować z czerwonych belek nad kartami, ramek, „01/02/03” wszędzie i wzoru cegły w każdym page-hero. Minimalizm to dużo bieli, siatka i jedna mocna fotografia na sekcję.
3. **Język wizualny dla architektów:** cienkie **rysunki przekrojów profili** (linia 1 px) jako motyw graficzny. To od razu sygnalizuje kompetencję techniczną i nikt w branży nie robi tego dobrze.
4. **Typografia:** Cormorant Garamond z Inter jest elegancki, ale typowy dla „luksusowych” szablonów. Lepszy będzie nowoczesny grotesk dla nagłówków (np. Inter Tight, Söhne, Neue Haas) z opcjonalnym szeryfem do cytatów. Dane techniczne warto składać w kroju tabelarycznym z cyframi tabular-nums.
5. **Tabele specyfikacji** jako element designu: czyste, porównywalne, z możliwością pobrania.
6. **Sticky CTA** na mobile („Request a quote” / „Upload drawings”) i telefon klikalny w nagłówku.
7. Logo w stopce ma doklejone tło inline (`style="background:#f7f3ec;padding:6px"`). Potrzebna wersja logo na ciemne tło.

---

## 6. SEO techniczne i lokalne

- [ ] Usunąć `noindex` przy starcie i dodać `robots.txt` oraz `sitemap.xml`.
- [ ] `<link rel="canonical">` na każdej stronie oraz tagi Open Graph i Twitter Card z obrazem.
- [ ] Schema.org (JSON-LD): `LocalBusiness`/`HomeAndConstructionBusiness` z `areaServed` (London, Home Counties), `Organization`, `Product` dla systemów, `FAQPage` i `BreadcrumbList`.
- [ ] Opisy meta są zbyt krótkie: „About Brick & Pane.”, „Contact Brick & Pane.” i „Project gallery (placeholder).”. Każdy powinien mieć 140–160 znaków z frazą i lokalizacją.
- [ ] Tytuły: zamiast „Products | Brick & Pane” użyć np. „Timber & Aluminium Windows, Doors and Facades in London | Brick & Pane”.
- [ ] Profil **Google Business** z adresem lub service area, zdjęciami i opiniami. Dla lokalnej firmy w Londynie to najważniejszy pojedynczy kanał SEO.
- [ ] Treści eksperckie (guides), które odpowiadają na realne zapytania: „Do I need planning permission to replace sash windows in a conservation area?”, „Part L U-value for replacement windows 2026”, „Crittall vs aluminium steel-look” czy „Slim double glazing for listed buildings”.
- [ ] Strona 404, favicon PNG / apple-touch-icon, `manifest`.
- [ ] Opinie: Google, Trustpilot lub Houzz i ich prezentacja na stronie.

---

## 7. Dostępność (WCAG 2.2 AA)

| Problem | Gdzie | Poprawka |
|---|---|---|
| Kontrast złotego `#b08d57` na `#f7f3ec` wynosi **2,79:1**, a na `#ece5d9` **2,47:1** (wymagane 4,5:1) | `.eyebrow`, `.card .num` | Przyciemnić do ok. `#7d6234` albo użyć grafitu. Na ciemnym tle (4,63:1) jest OK. |
| Brak skip-linka „Skip to content” | wszystkie strony | Dodać jako pierwszy element `<body>`. |
| Komunikat formularza bez `aria-live`, brak walidacji (`novalidate` bez własnej walidacji) | `contact.html` | `role="status" aria-live="polite"`, `required`, komunikaty błędów przy polach. |
| `select#interest`, `#loc`, `#msg` bez atrybutu `name` | `contact.html` | Dodać `name`, bo inaczej po podłączeniu backendu dane nie zostaną wysłane. |
| Aktywna pozycja menu tylko wizualnie | nav | Dodać `aria-current="page"`. |
| Menu mobilne nie zamyka się klawiszem Esc ani po kliknięciu linku | `js/main.js` | Drobna poprawka JS. |
| Brak `prefers-reduced-motion` przy `scroll-behavior:smooth` | `style.css` | Owinąć w media query. |

---

## 8. Wydajność i kod

- Strona jest lekka (cały CSS ma 53 linie, JS 3 linie). To świetna baza.
- Google Fonts (2 rodziny, 7 odmian) blokują renderowanie. Lepiej **hostować fonty lokalnie**, ograniczyć się do 2–3 odmian i dodać `font-display: swap` oraz `preload`.
- Przy dodawaniu zdjęć: AVIF/WebP, `srcset`/`sizes`, `loading="lazy"` (poza hero), stałe `width`/`height` dla CLS. Cel to LCP poniżej 2 s na 4G.
- Wiele stylów inline w HTML warto przenieść do CSS.
- Nagłówek, menu i stopka są skopiowane w 6 plikach. Przy rozbudowie do 30+ stron (produkty, dzielnice, case studies, guides) potrzebny będzie generator statyczny (**Astro** albo Eleventy) z komponentami i plikami treści (Markdown/JSON), a także prosty CMS (np. Decap lub Sanity), żeby zespół mógł sam dodawać realizacje.
- Hosting: CNAME wskazuje na GitHub Pages. Działa, ale nie obsłuży formularzy ani nagłówków bezpieczeństwa (CSP, HSTS). Lepiej rozważyć Netlify, Cloudflare Pages albo Vercel.
- Analityka z poszanowaniem prywatności (Plausible lub GA4 z Consent Mode) i **zdarzenia konwersji**: wysłanie formularza, pobranie DWG, zamówienie próbki, klik w telefon.

---

## 9. Funkcje, które dadzą pozycję „numer 1”

Tego nie ma prawie nikt w branży w UK:

1. **Technical Library**: filtrowalna biblioteka (system, materiał, typ pliku: DWG, RVT, NBS, PDF), pobieranie jednym kliknięciem.
2. **Window Schedule Upload → 48 h review**: architekt wrzuca zestawienie lub rysunki (PDF, DWG, XLSX) i dostaje uwagi techniczne oraz wycenę.
3. **Conservation area checker**: kod pocztowy → informacja, czy adres leży w strefie konserwatorskiej lub pod Article 4 (dane otwarte Historic England i gmin londyńskich) oraz jakie rozwiązania zwykle akceptują planning officers.
4. **Kalkulator zgodności z Part L**: wybór systemu i szyby → Uw oraz informacja „compliant / not compliant”.
5. **Configurator / spec builder**: wybór systemu, koloru RAL, szklenia i okuć → PDF ze specyfikacją gotową do wklejenia (NBS-style clause).
6. **Live lead times**: widget z aktualnymi terminami dla każdego systemu.
7. **Case studies z danymi technicznymi** zamiast samej galerii zdjęć.
8. **Strefa dla inwestora**: akredytacje, polisy, gwarancje, wzór harmonogramu i proces. Wszystko do pobrania jako „Pre-qualification pack”, gotowe pod PQQ.

---

## 10. Roadmapa

**P0, przed publikacją (1–2 tygodnie):** sekcja 2 w całości, 3 prawdziwe case studies, telefon i adres, działający formularz z uploadem plików, polityka prywatności, poprawki kontrastu.

**P1, pierwsze 30 dni:** nowe IA (sekcja 4), strona Heritage & Sash, tabele parametrów dla każdego systemu, Technical Library v1 (PDF i DWG), strona dla deweloperów, schema i sitemap, Google Business Profile, przebudowa designu (hero ze zdjęciem, rysunki przekrojów), migracja na Astro.

**P2, 60–90 dni:** zamawianie próbek i rezerwacja CPD online, upload schedule z SLA 48 h, conservation checker, kalkulator Part L, 6–10 przewodników eksperckich, strony dzielnic z prawdziwymi realizacjami, opinie.

**P3, przewaga długoterminowa:** spec builder z eksportem NBS, live lead times, portal projektu dla klienta (status zamówienia, dokumenty, gwarancja).

---

## 11. Czego potrzebujemy od firmy, żeby to zrobić

- Lista systemów i producentów z kartami technicznymi (Uw, PAS 24, BS 6375, DoP/UKCA).
- Akredytacje i ubezpieczenia (FENSA/CERTASS, Constructionline, polisy) oraz warunki gwarancji.
- Realne terminy realizacji i widełki cenowe.
- Zdjęcia realizacji (najlepiej profesjonalna sesja 3–5 projektów) ze zgodą klientów.
- Dane spółki, telefon, adres (lub service area) i zdjęcia zespołu.
- Pliki DWG, BIM i NBS od producentów systemów.
- Decyzja: transparentność co do miejsca produkcji (zalecane) i rola uPVC w ofercie.
