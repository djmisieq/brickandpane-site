# Nowa strona: co zbudowano i co trzeba potwierdzić przed startem

**Data:** 14.10.2026 · **Branch:** `claude/carpentry-website-audit-5m3nf9`

## 1. Co zbudowano

Strona jest zbudowana od nowa według audytu (`AUDYT.md`). Jej osią jest **aluminiowy system lift & slide**, czyli ten sam typ produktu co na stronie DM Window Solutions. Treść jest jednak w całości **oryginalna**: żadne zdanie, zdjęcie ani grafika nie zostały skopiowane z innej strony.

| Strona | Plik | Rola |
|---|---|---|
| Home | `index.html` | Pozycjonowanie „Specified as drawn. Delivered as programmed.”, wybór roli (architekt / deweloper / właściciel domu), dowody zamiast portfolio |
| **Lift & slide** | `lift-and-slide-doors.html` | Strona flagowa, opisana niżej |
| Systemy | `products.html` | Przegląd systemów: sliding, bi-fold, drzwi uchylne, okna. Uczciwie oznaczone jako „System page in preparation” |
| Architekci | `architects.html` | Usługi z czasem realizacji, biblioteka techniczna (status plików), tabela Part L/O/K/M/Q/F, obietnica „bez zamienników” |
| Deweloperzy | `developers.html` | Ryzyka przejmowane przez firmę, proces pakietu, pakiet PQQ z jawnym statusem każdego dokumentu |
| Design guide | `guide-large-sliding-doors-london.html` | Poradnik ekspercki: ugięcie belki, próg, transport szkła w Londynie, przepisy, lista kontrolna Stage 3 |
| Founding projects | `projects.html` | Sposób na start bez realizacji: sprawdzalne gwarancje zamiast pożyczonych zdjęć |
| O firmie | `about.html` | 5 zasad, miejsce produkcji (do uzupełnienia), zespół |
| Kontakt | `contact.html` | Formularz w 3 krokach: rola, projekt (etap RIBA / liczba lokali / typ budynku), pliki do 25 MB i zgoda RODO |
| Prywatność, 404, podziękowanie | `privacy.html`, `404.html`, `thank-you.html` | |

**Strona lift & slide jest lepsza od wzorca, bo:**
1. ma **porównanie lift & slide / inline slider / bi-fold**, które pomaga podjąć decyzję;
2. ma **schemat działania mechanizmu** (własny rysunek);
3. pokazuje **6 konfiguracji** w widoku z góry (LS-2, LS-3T, LS-4C, LS-6C, narożnik bez słupka, pocket);
4. ma **kalkulator rozmiaru**: szerokość i waga panelu, prześwit, logistyka w Londynie, reguła 25% z Part L dla rozbudów oraz przekazanie wyników do formularza;
5. ma **tabelę parametrów** z odniesieniem do przepisów;
6. opisuje **próg bez stopnia jako detal stropu** (własny przekrój);
7. ma **4 londyńskie pułapki projektowe**;
8. pokazuje, **co architekt dostaje na każdym etapie RIBA**;
9. ma **spec pack z jawnym statusem plików** i FAQ.

**Technicznie:**
- design system „London Stock” (`css/style.css`),
- fonty Inter Tight i IBM Plex Mono hostowane lokalnie (licencja OFL, pliki w `fonts/`),
- nowy znak liniowy jako logo i favicon,
- dostępność: skip-link, `aria-current`, zamykanie menu klawiszem Esc, `aria-live` w kalkulatorze i formularzu, kontrast AA, `prefers-reduced-motion`,
- dla wyszukiwarek: canonical, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`.

**Szablony i budowanie:** źródła stron są w `src/pages`, a wspólne fragmenty (nagłówek, stopka, layout) w `src/partials`. Po każdej zmianie trzeba uruchomić:

```
node build.mjs
```

Skrypt generuje gotowe pliki `.html` w katalogu głównym, więc GitHub Pages działa bez żadnych zmian.

## 2. Zasada: żadnych zmyślonych faktów

Firma nie ma jeszcze realizacji, certyfikatów ani danych z badań. Dlatego na stronie:
- **nie ma** zdjęć stockowych podpisanych jako realizacje, wymyślonych opinii ani logotypów akredytacji;
- parametry są podane jako **zakresy typowe dla tej klasy systemów** i oznaczone etykietą **„Indicative”**, a pasek na górze strony wyjaśnia, co ona znaczy;
- pliki, akredytacje i dokumenty mają **jawny status**: „Preparing”, „In progress” albo „Planned”.

## 3. Do potwierdzenia przez właściciela przed startem

Strona składa poniższe obietnice. Każdą trzeba potwierdzić albo zmienić:

| Obietnica na stronie | Gdzie |
|---|---|
| Przegląd rysunków w **2 dni robocze** | Home, Architects, Lift & slide, Contact |
| Budżet dla dewelopera w **5 dni roboczych** | Developers, Contact |
| Próbki w **3 dni robocze**, dostarczane osobiście w centrum Londynu | Architects |
| **Własna ekipa montażowa**, bez podwykonawców | wszędzie |
| **Pełnowymiarowa próbka narożnika** przed zamówieniem | Home, Founding projects |
| Płatności **etapowane** i gwarancja **brytyjskiej spółki** | Home, Founding projects |
| Projekty founding prowadzone **osobiście przez dyrektora** | Founding projects |
| Żadnych zamienników bez pisemnej zgody | Home, Architects, Lift & slide |
| CPD 45 min, akredytacja „in progress” | Architects |
| Obszar działania: „London & South East” | stopka |

## 4. Dane do zebrania (zastąpią wartości „Indicative”)

Po wyborze dostawcy systemu (np. Aluprof, Reynaers, Schüco, Aluk) i okuć (np. Siegenia, Hautau):
- Uw dla typowych rozmiarów (podwójna i potrójna szyba), maksymalna waga i wymiar skrzydła, szerokość styku, głębokość ramy;
- raport PAS 24:2022, klasy BS 6375-1 / EN 12207 / 12208 / 12210, Rw;
- dopuszczalne ugięcie nadproża i głębokość wpustu progu (do poradnika i detali);
- DWG (head, sill, jamb, próg), RVT/IFC, klauzula specyfikacji, DoP;
- nazwa i certyfikaty zakładu produkcyjnego (strona About);
- dane spółki: nazwa, numer, adres siedziby, VAT. Są wymagane w stopce i polityce prywatności. Do tego telefon.

Granice w kalkulatorze są zapisane w jednym miejscu: `js/main.js`, obiekt `LIMITS`.

## 5. Formularz

Formularz nie jest jeszcze podłączony i uczciwie to komunikuje. Nic nie wysyła, a wpisane dane zostają. Żeby go podłączyć:
1. Załóż formularz w Formspree, Basin albo Netlify Forms. Muszą obsługiwać pliki.
2. Wpisz adres endpointu w `src/pages/contact.html`, w atrybucie `data-endpoint=""`.
3. Uruchom `node build.mjs`.

Po wysłaniu użytkownik trafia na `thank-you.html`. Pole `company_website` to pułapka na boty (honeypot).

## 6. Zdjęcia: legalne źródła i plan

Środowisko, w którym pracowałem, blokowało pobieranie z Unsplash i Pexels oraz wejście na dmwindowsolutions.com. Strona opiera się więc na **własnych rysunkach technicznych SVG** (elewacje, przekroje, konfiguracje). Są w 100% oryginalne i pasują do języka architektów. Kiedy pojawią się zdjęcia:
- **Zdjęcia własne** to priorytet: pierwsza realizacja founding, fabryka, próbki. Brief zdjęciowy jest w `docs/audyt/03-ui-marka-design-system.md`.
- **Stock** (licencja Unsplash lub Pexels pozwala na użycie komercyjne) tylko jako ilustracja klimatu, **nigdy podpisana jako nasza realizacja**.
- **Materiały producenta systemu**: zdjęcia i rendery, za jego pisemną zgodą i z podpisem źródła.

## 7. Źródła treści regulacyjnych

Streszczenia Approved Documents L, O, K, M, Q i F pochodzą z dokumentów rządowych (GOV.UK). Licencja Open Government Licence v3.0 pozwala na ich użycie, a wymagana atrybucja jest w stopce i w poradniku. Przed startem specjalista powinien zweryfikować wartości (U-value 1,4 / 1,6 W/m²K, reguła 25%, próg 15 mm).

## 8. Przed startem (checklista)

- [ ] Potwierdzić obietnice z sekcji 3
- [ ] Zastąpić wartości „Indicative” certyfikowanymi danymi i usunąć baner pre-launch
- [ ] Uzupełnić dane spółki, telefon i nazwę zakładu
- [ ] Podłączyć formularz
- [ ] Usunąć `noindex` w `src/partials/layout.html`, uruchomić `node build.mjs`
- [ ] Założyć profil Google Business
- [ ] Przenieść `AUDYT.md` i `docs/` poza publikowaną gałąź (GitHub Pages opublikuje pliki `.md`)
