# Audyt 3: UI, marka i design system

> Raport agenta „UI / visual / brand designer”, 14.10.2026. Zakres: zrzuty Playwright 6 stron × 4 szerokości (1440/1024/768/390) plus testy logo i favicony. Nie powtarza audytu technicznego (`00-techniczny-i-seo.md`).
> **Zastrzeżenie:** proxy blokowało pobieranie stron benchmarków. Wzorce w sekcji 3 pochodzą z wiedzy agenta i wyników wyszukiwania, a nie z dzisiejszego przeglądu tych stron. Przed prezentacją klientowi warto je sprawdzić ręcznie.

## 1. Audyt wizualny obecnego UI

**Ogólnie:** strona jest schludna, ale wygląda jak szablon „boutique hotel”. Ma trzy różne rysunki cegły, trzy style kart i brass eyebrow nad każdym nagłówkiem. Minimalizm premium polega na tym, że na ekranie jest mało rzeczy, ale każda jest bardzo dopracowana. Tu jest odwrotnie: dużo drobnych ozdobników o przeciętnej jakości.

**Layout i siatka**
- 1440: kolumna tekstu w hero trzyma się `.wrap` (1200), a ilustracja wychodzi do krawędzi okna. Na dole hero nie zgrywa się z resztą siatki. Na stronie nie ma żadnej spójnej siatki kolumn, są tylko ad-hoc `.g2/.g3/.g4`.
- 768: **nawigacja się łamie**. „For Architects” spada do dwóch linii, a pozycje menu przestają być wyrównane do logo. Hero przełącza się na jedną kolumnę przy 900 px, a menu chowa się dopiero przy 760 px. Między 761 a ~980 px nav się nie mieści.
- 768: SVG z `preserveAspectRatio="slice"` w pasie o wysokości 320 px przycina okno do samej szyby bez nadproża i parapetu. Zostaje abstrakcyjny, nieczytelny kadr.
- 390: pierwszy ekran to sam tekst, bez obrazu. Baner TEST zajmuje dwie linie. Dwa przyciski jeden pod drugim mają różne szerokości (215 i 187 px). Strona główna ma 6092 px wysokości, głównie przez 4 karty z czerwoną belką ustawione jedna pod drugą.
- Contact 1024: lewa kolumna kończy się na ~930 px, a formularz ciągnie się do 1415 px. Zostaje ~500 px pustej, niezaprojektowanej przestrzeni.
- Products 1440: trzecia karta materiału („uPVC”) zostaje sama w rzędzie siatki `auto-fit`, przez co sekcja wygląda na niedokończoną.

**Rytm odstępów:** każda sekcja ma `padding:96px`, a `section-head` ma 56. Brakuje skali odstępów, więc wszystkie sekcje mają tę samą wagę i nic nie „oddycha” bardziej od reszty. Do tego wiele odstępów jest zapisanych inline (`style="margin-top:1.2rem"`).

**Typografia**
- Cormorant Garamond 500 w roli h3 (1,6 rem, ok. 25 px) jest zbyt cienki i „ślubny”. W kartach wygląda słabo, bo kontrast kreski jest za duży jak na mały stopień. Krój display trafił do ról tekstowych.
- H1 na 1440 łamie się na 3 linie, a „care.” zostaje jako sierota. Kolumna o szerokości 40% jest za wąska na 70 px.
- Eyebrow (letterspaced caps) pojawia się 4–5 razy na stronę. Przez to przestaje porządkować hierarchię i staje się szumem.
- Liczby i dane techniczne nie mają osobnego stylu (brak tabular nums i monospace), a dla architektów to podstawa.

**Kolor**
- Brick (#a4442c) pełni naraz rolę CTA, linku, belki karty, tła page-hero i tła hero. Akcent użyty wszędzie przestaje być akcentem. Do tego CTA na page-hero (`brick-bg`) zlewa się z tłem.
- **Nowy problem kontrastu:** eyebrow `#f1d9a8` na brick ma **4,43:1**, czyli nie spełnia AA dla małego tekstu (page-hero na 4 stronach).
- Karty `#fff` na `#f7f3ec` dają zbyt słabą separację, dlatego potrzebują belki. Lepiej usunąć zarówno kartę, jak i belkę.

**Komponenty**
- Są trzy style kart: czerwona belka u góry, brass po lewej i przerywana ramka placeholdera. Powinien zostać jeden.
- Przyciski są kwadratowe i letterspaced, a hover zmienia tylko kolor. Brakuje stylu `:focus-visible` i stanu disabled/loading.
- W nav aktywna pozycja ma brick tekst plus brass podkreślenie, czyli dwa kolory na jednej informacji.
- Footer: logo na „łatce” w kolorze cream (inline style), bo brakuje wersji odwróconej.
- Page-hero z cegłą z CSS gradientów (`.brick-bg`) wygląda jak tapeta w ukośne paski i jest mniej czytelny niż cegła w hero SVG oraz cegła w logo. To trzy niespójne rysunki tego samego motywu.

**Ilustracja hero (SVG):** płaska, clipartowa (gradient na szybie, trójkątny „blik”, mosiężna klamka na środku słupka). Wysyła sygnał „generic home improvement”, a nie „precyzja dla architektów”. Okno ma też proporcje i podział, które nie odpowiadają żadnej realnej typologii (to nie jest ani sash, ani casement).

## 2. Marka i logo

Ustalenia z testu:
1. **Wordmark jest elementem `<text>` w SVG wstawionym przez `<img>`**. Taki obraz nie ładuje webfontów, więc wszędzie renderuje się Georgia albo systemowy szeryf, a nie Cormorant. Logo ma więc inny krój niż nagłówki. Tekst trzeba zamienić na krzywe.
2. **Favicon to cały poziomy lockup 300×60**. Przy 16 i 32 px widać czerwoną kreskę, a znaku nie da się rozpoznać.
3. **Na ciemnym tle wordmark (#2b2a29) znika**. Zostaje sam złoty „&”. Stąd łatka w footerze.
4. Znak ma 3 kolory i spoiny o grubości 1,6 px. Przy 24 px spoiny się zlewają, a okno nie trzyma się warstw cegieł (przecina spoiny). Haft, wycinany winyl na van i grawer sprawią problem. Brakuje wersji jednokolorowej.
5. Złoty „&” w kursywie i Cormorant budują skojarzenia z weselem i luksusem, a nie z inżynierią.

**Kierunek:** uprościć logo do monogramu z linii. Kwadrat (otwór w murze) z wpisanym oknem, wszystko jednym kolorem i jedną grubością kreski, czyli tak, jak rysuje się element na rzucie. Do tego wordmark w grotesku (np. Söhne Halbfett z lekko szerszym trackingiem) albo w spokojnym, zamienionym na krzywe szeryfie, bez kursywy i bez złota. Potrzebny system wersji:
- lockup poziomy,
- lockup pionowy,
- sam znak, gotowy do faviconu (pogrubiona kreska poniżej 32 px),
- wersje 1-kolorowa, odwrócona i pozytyw,
- pole ochronne równe wysokości „B”,
- minimalna szerokość lockupu 96 px.

Na van: sam znak w dużej skali plus wordmark, ciemny lakier (antracyt) i brick tylko jako akcent. Favicon: `favicon.svg` (znak) plus `apple-touch-icon.png` 180 i wariant `prefers-color-scheme`.

## 3. Benchmarki: co sprawia, że te strony wyglądają premium

- **Sky-Frame / Vitrocsa / Panoramah:** pełnoekranowe zdjęcia, w których produkt prawie znika (sama linia widoku), nawigacja w jednej linii, bardzo mało tekstu. Osobna strefa dla architektów z CAD i dokumentacją techniczną oraz rysunki przekrojów pokazane jako ilustracje.
- **Dinesen / Plain English:** wolne tempo strony, jedno duże zdjęcie na ekran, naturalne światło, spójny grading, mała typografia przy dużych obrazach i materiał w roli głównej.
- **Crittall / Mumford & Wood / Velfac / Schüco:** dane na pierwszym planie, czyli biblioteka CAD/DWG i NBS (M&W udostępnia DWG/PDF i NBSPlus), product finder i parametry przy każdym systemie.

**Wspólny mianownik:** wąska paleta (2 neutralne kolory plus 1 akcent), jeden grotesk, duże marginesy, zdjęcia o jednolitym gradingu, a dane podane jako typografia, a nie jako ikony.

## 4. Proponowany design system (kierunek A, „London Stock”)

### Typografia
- **Płatnie (rekomendacja):** Söhne (Klim) do nagłówków i tekstu, Söhne Mono do danych. Opcjonalnie Tiempos Text do cytatów architektów.
- **Darmowo:** Inter Display / Inter Tight (nagłówki), Inter (tekst), IBM Plex Mono albo JetBrains Mono (dane), Newsreader (cytaty).
- Nagłówki: waga 500, tracking −0,02 em od step-3 w górę.
- Dane: `font-variant-numeric: tabular-nums`.

Skala fluid (1,2 do 1,333, viewport 360→1440):

```css
--step--1: clamp(.833rem, .81rem + .1vw, .875rem);
--step-0:  clamp(1rem, .979rem + .093vw, 1.0625rem);
--step-1:  clamp(1.125rem, 1.083rem + .185vw, 1.25rem);
--step-2:  clamp(1.333rem, 1.236rem + .432vw, 1.625rem);
--step-3:  clamp(1.625rem, 1.417rem + .926vw, 2.25rem);
--step-4:  clamp(2rem, 1.625rem + 1.667vw, 3.125rem);
--step-5:  clamp(2.5rem, 1.92rem + 2.59vw, 4.25rem); /* display, line-height 1.02 */
```

Body line-height 1,55, długość linii 62–68 ch. Eyebrow tylko w step--1 mono, maksymalnie 1 na sekcję.

### Kolory (kontrast sprawdzony WCAG 2.x)

| Token | Hex | Kontrast / użycie |
|---|---|---|
| `--color-bg` | #f6f4ef | tło (lime putty) |
| `--color-surface` | #ffffff | formularze, tabele |
| `--color-surface-2` | #e9e5dc | sekcje alt |
| `--color-ink` | #1c1b1a | 15,65:1 na bg |
| `--color-ink-2` | #5a564f | 6,64 na bg, 5,8 na surface-2 |
| `--color-muted` | #8a857c | 3,34, **tylko** tekst ≥24 px i ikony |
| `--color-line` | #d6d2c9 | wyłącznie dekoracyjne linie 1 px |
| `--color-accent` | #8b3a26 | ciemniejszy brick, 7,0 na bg; biały tekst na nim 7,69 |
| `--color-brick` | #a4442c | duże plamy i ilustracje; jako tekst 5,55 |
| `--color-brass-text` | #7a6440 | 5,13 na bg (zamiast #b08d57) |
| `--dark-bg` | #161616 | ciemne sekcje |
| `--dark-ink` | #ece9e2 | 14,93 |
| `--dark-ink-2` | #a6a199 | 7,05 |
| `--dark-accent` | #d9785a | 5,85 |
| `--dark-brass` | #c9a46a | 7,76 |

Zasada: accent tylko w CTA i stanach aktywnych, maksymalnie ok. 5% powierzchni ekranu.

### Odstępy i siatka
- Skala 4/8: `--space-2xs 8px, xs 12, s 16, m 24, l 32, xl 48, 2xl 64, 3xl 96, 4xl 128, 5xl 160`.
- Sekcje: `--section: clamp(4rem, 2.5rem + 6vw, 10rem)`, z celowym zróżnicowaniem: hero i case study dostają 5xl, sekcje danych 3xl.
- Siatka: 12 kolumn ≥1024, 8 kolumn 600–1023, 4 kolumny poniżej 600. `--container: 1360px`, `--margin: clamp(16px, 4vw, 64px)`, `--gutter: clamp(16px, 2vw, 32px)`.
- Tekst zajmuje maksymalnie kolumny 1–7, obrazy mogą wychodzić na pełną szerokość (full-bleed).

### Komponenty
- **Nav:** wysokość 72 px, tło `bg` z `backdrop-filter`. Po przewinięciu kurczy się do 56 px i dostaje linię 1 px. Pozycje: Windows, Doors, Facades, Heritage, Specifiers, Projects, a po prawej telefon (mono) i przycisk „Request a quote”. Burger przy **<1100 px**, pełnoekranowy panel z linkami w step-3. Aktywna pozycja: linia 1 px pod spodem w kolorze ink, bez drugiego koloru.
- **Hero:** zdjęcie full-bleed 100svh (minimum 560 px). Nagłówek step-5 w lewym dolnym rogu na kolumnach 1–8, jedno zdanie lead, jedno główne CTA plus link tekstowy. W rogu podpis zdjęcia mono („Grade II terrace, Islington · Timber box sash, Uw 1.2”). Ten podpis to sygnał dla architekta i nic nie kosztuje.
- **Product card:** bez tła i bez ramki. Zdjęcie 4:5, pod nim nazwa (step-1, 500) i linia danych mono („Uw 0.9 · Sightline 28 mm · PAS 24”). Hover: obraz scale 1.02 przez 600 ms, strzałka przesuwa się o 4 px.
- **Spec table:** pełna szerokość, wiersze 48 px, linie 1 px `--color-line`. Etykieta w ink-2 step--1, wartość mono tabular wyrównana do lewej, jednostki w muted. Przyciski „Download DWG / NBS / DoP”. Sticky nagłówek przy porównaniu systemów. Na mobile tabela zamienia się w listę definicji, bez poziomego scrolla.
- **Case-study card:** zdjęcie 3:2, pod nim dzielnica · typ budynku · system (mono), tytuł step-2 i jedna liczba („14 weeks · 46 units”). Na listingu karty w nieregularnym rytmie 7/5 kolumn.
- **CTA band:** `--dark-bg`, jedno zdanie step-4, dwa przyciski („Upload drawings”, „Book a CPD”). Bez cegły w tle.
- **Formularze:** pola 52 px, dolna linia 1 px zamiast pełnej ramki. Etykieta zawsze nad polem, błąd pod polem w kolorze accent z ikoną. Strefa drag-and-drop na pliki DWG/PDF. Focus: obrys 2 px accent z `outline-offset` 2 px.
- **Footer:** `--dark-bg`, odwrócony znak, 12 kolumn (4 kolumny linków plus newsletter dla architektów). Na dole dane spółki i akredytacje jako monochromatyczne logotypy.
- **Ikony:** linia 1,5 px na siatce 24 px, końce kwadratowe, bez wypełnień (Phosphor Light albo własne). Używać oszczędnie: pobieranie, strzałka, telefon, plik.

### Ilustracje techniczne
Przekroje profili (head, sill, jamb) i aksonometrie: linia 1 px (`--color-ink` albo `--dark-ink`), kreskowanie zgodne z konwencją BS 1192 (cegła ukośnie co 45°, izolacja falą), a szyba jako dwie cienkie linie z przekładką. Wymiary mono step--1, akcent brick tylko na elemencie Brick & Pane, czyli na ramie. Format SVG, inline, z `vector-effect: non-scaling-stroke`. Takie przekroje zastępują clipart w hero na podstronach i są dowodem kompetencji.

## 5. Brief foto i wideo

**Co fotografować (na każde zlecenie):**
1. Szeroki kadr elewacji w londyńskim kontekście: stock brick, sztukateria, ulica w tle.
2. Kadr od środka na zewnątrz, z linią widoku i ramą w 1/3 kadru.
3. Detale: narożnik profilu, putty line, glazing bar, okucie, uszczelka, styk z cegłą i parapet.
4. Okucia w makro, na mosiądzu bez flary.
5. Ekipa przy montażu: ręce, poziomica, ochrona podłóg. Bez pozowanych uśmiechów.
6. Przed i po z tej samej pozycji statywu.

**Kadrowanie:** obiektyw shift albo korekta perspektywy (pionowe linie muszą być pionowe), wysokość aparatu 1,5 m, symetria przy elewacjach.

**Światło:** pochmurne londyńskie niebo albo złota godzina na cegle. Wnętrza w świetle dziennym, bez lamp błyskowych.

**Grading:** lekko ciepłe biele (5200–5600 K), umiarkowane nasycenie z cegłą lekko schłodzoną, czernie podniesione do ok. 4% (matowe), jeden LUT na wszystkie zlecenia.

**Proporcje:** 3:2 i 4:5 jako master, minimum 6000 px długości.

**Wideo:** pętla 8–12 s, statyw albo slider, ruch ≤2%/s (np. okno uchylające się, światło przesuwające się po ramie). Bez muzyki, bez dronów nad ulicą. Wymagania techniczne:
- `muted playsinline loop` i `poster`,
- maksymalnie 2,5 MB (AV1 plus H.264 jako fallback),
- przy `prefers-reduced-motion: reduce` albo `Save-Data` pokazujemy tylko poster,
- przycisk pauzy (WCAG 2.2.2).

## 6. Mikrointerakcje, motion i dark mode

**Zasady ruchu:**
- tokeny czasu: `--dur-1 150ms` (hover), `--dur-2 300ms` (UI), `--dur-3 600ms` (obrazy),
- easing `cubic-bezier(.2,.7,.2,1)`,
- tylko `opacity` i `transform`.

**Przykłady:**
- reveal sekcji: translateY 12 px i fade, raz, przez IntersectionObserver,
- linki z podkreśleniem rysowanym od lewej,
- nav zwężający się po przewinięciu,
- przekrój profilu rysujący się kreską (stroke-dashoffset) przy pierwszym wejściu,
- licznik pobrań i potwierdzenie „Added to spec”.

Bez parallaxu, scroll-jackingu i karuzel z autoplay. W bloku `@media (prefers-reduced-motion: reduce)` zerujemy animacje i `scroll-behavior`.

**Dark mode:** nie robiłbym pełnego przełącznika na start. Zdjęcia są gradowane pod jasne tło, a architekci drukują strony i specyfikacje. Rekomenduję **ciemne sekcje celowo** (CTA, footer, „Technical Library”, prezentacja przekrojów w odwróconych liniach na `--dark-bg`) i tokeny gotowe pod `prefers-color-scheme`, żeby dark mode dało się dodać w P2 bez refaktoru.

## 7. Dwa kierunki wizualne

**A. „London Stock” (rekomendowany).** Moodboard: Sky-Frame spotyka Dinesen i rysunek warsztatowy. Putty #f6f4ef, ink #1c1b1a, ciemny brick #8b3a26 jako jedyny akcent, ciemne sekcje #161616. Söhne i Söhne Mono, przekroje 1 px, zdjęcia full-bleed z podpisami mono, sporo pustej przestrzeni.
*Dlaczego:* najlepiej mówi językiem architektów (dane, rysunek, precyzja), skaluje się na fasady i projekty komercyjne dla inwestorów, a cegła zostaje jako nazwa i akcent, nie jako ozdoba. Ten kierunek wyróżnia się w UK, gdzie dominują szablony „heritage”.

**B. „Heritage Joinery”.** Moodboard: Plain English spotyka Mumford & Wood. Lime #f3efe6, oxide green #2f4a3f (8,8:1 na jasnym tle; tekst #e7e3da na #20302a ma 10,8:1), brass-text #7a6440, ciemne drewno. Fonty: Tiempos Headline z Founders Grotesk (płatnie) albo Newsreader z Inter (darmowo). Ilustracje grawerskie i pełne kadry wnętrz.
*Ryzyko:* świetny dla sash i timber, ale osłabia wiarygodność przy aluminium, curtain walling i inwestorach.

**Proponowany kompromis:** A jako system bazowy, a podstrona Heritage może korzystać z serifu do cytatów i z zieleni jako koloru sekcji.

## 8. Uwagi wdrożeniowe

- **Tokeny:** wszystkie wartości przez CSS custom properties w `:root` (kolor, typografia, odstępy, czas). Ciemne sekcje przez `[data-theme="dark"]`, które podmienia te same tokeny. Usunąć style inline.
- **Fluid:** typografia i odstępy przez `clamp()` jak wyżej. Container queries (`@container`) dla kart, żeby layout zależał od miejsca, a nie od szerokości viewportu.
- **Obrazy:** `<picture>` z AVIF (q≈50), WebP (q≈75) i JPEG. Szerokości 480/768/1080/1440/1920/2560 z poprawnym `sizes` (np. `(min-width:1024px) 58vw, 100vw`). Zawsze `width`/`height` albo `aspect-ratio`. Hero z `fetchpriority="high"` bez lazy, reszta z `loading="lazy" decoding="async"`, a w tle dominujący kolor jako LQIP. Pipeline: `astro:assets` albo Sharp w buildzie.
- **Fonty:** self-hosted WOFF2 z subsetem Latin (z £, ², ³ i ułamkami), maksymalnie 3 pliki (np. Regular, Medium, Mono). `<link rel="preload">` tylko dla dwóch. `font-display: swap` i fallback z `size-adjust`/`ascent-override`, żeby nie było CLS. Usunąć Google Fonts CDN.
- **Logo:** SVG z tekstem zamienionym na krzywe, `currentColor` (jeden plik działa na jasnym i ciemnym tle), favicon jako sam znak.
- **Core Web Vitals (p75, mobile 4G):** LCP ≤2,0 s (hero ≤180 KB AVIF przy 1080 px), INP ≤150 ms (JS ≤30 KB, bez frameworka po stronie klienta), CLS ≤0,05, TTFB ≤0,4 s (CDN). Budżet strony: ≤500 KB bez wideo. Lighthouse ≥95 we wszystkich kategoriach, monitorowany w CI (`@lhci`).

**Priorytety:**
1. Logo: krzywe, wersja odwrócona, favicon jako sam znak.
2. Breakpoint nav i hero przy 768.
3. Kontrast `#f1d9a8` na brick.
4. Jeden styl karty, usunięcie cegły z CSS.
5. Nowe tokeny i fonty.
6. Sesja zdjęciowa 3 realizacji i przekroje SVG.

Źródła (wyszukiwanie):
- [Sky-Frame](https://www.sky-frame.com/en/)
- [Archello: Sky-Frame](https://archello.com/nl/brand/sky-frame-ag)
- [The Local Project: Vitrocsa](https://thelocalproject.com.au/articles/vitrocsas-trailblazing-window-system-product-feature-the-local-project/)
- [Barbour: M&W CAD library](https://www.barbourproductsearch.info/mumford-wood-cad-drawing-library-available-news021054.html)
- [SpecifiedBy: M&W Historic Box Sash](https://www.specifiedby.com/mumford-and-wood/historic-box-sash-window)
- [Remodelista: Plain English](https://www.remodelista.com/posts/plain-english-kitchen-designs-now-available-in-the-us/)
