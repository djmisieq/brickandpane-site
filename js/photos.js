// Page photographs. Each page's images go into its existing .photo-slot placeholders or as a gallery at the end
// of a section; page heroes are written into the HTML by build.mjs (HEROES). Swap a .jpg in img/photos/ to replace
// an image, then run `npm run images` for its AVIF and WebP copies.
(() => {
  const BASE = new URL('../img/photos/', document.currentScript.src).href;
  const PL = document.documentElement.lang === 'pl';
  // Alt text says what the picture shows. Images inside a link that already names the product stay alt="".
  const ALT = {
    'about-install': ['Two fitters lifting a large glass pane into place with suction handles', 'Dwóch monterów osadza dużą taflę szkła za pomocą przyssawek'],
    'architects-review': ['Hand marking up a section drawing of a window frame, with an aluminium profile beside it', 'Ręka nanosi uwagi na przekrój ramy okiennej, obok profil aluminiowy'],
    'bifold-closed': ['Closed bi-fold doors across the back of a brick extension, kitchen lit inside', 'Zamknięte drzwi harmonijkowe na całej szerokości ceglanej dobudówki, w środku oświetlona kuchnia'],
    'bifold-stack': ['Bi-fold leaves folded into a stack at the side of the opening', 'Skrzydła drzwi harmonijkowych złożone w pakiet z boku otworu'],
    'bifold-traffic': ['Kitchen with bi-fold doors closed and the end traffic door open', 'Kuchnia z zamkniętymi drzwiami harmonijkowymi i otwartym skrzydłem przejściowym na końcu'],
    'developers-site': ['Crated window frames in front of a brick building under scaffolding', 'Ramy okienne w skrzyni przed ceglanym budynkiem w rusztowaniach'],
    'doors-entrance': ['Dark grey front door with a long bar handle and a glazed side panel', 'Ciemnoszare drzwi wejściowe z długim pochwytem i przeszklonym naświetlem bocznym'],
    'doors-french': ['White French doors with glazing bars open onto a paved garden', 'Białe drzwi dwuskrzydłowe ze szprosami otwarte na wybrukowany ogród'],
    'doors-garden': ['Dark grey side door with a narrow glass panel in a brick side return', 'Ciemnoszare drzwi boczne z wąskim przeszkleniem w ceglanym przejściu'],
    'facades-curtain': ['Two-storey glazing in slim dark frames on a brick house', 'Dwukondygnacyjne przeszklenie w smukłych ciemnych ramach na ceglanym domu'],
    'facades-lanterns': ['Roof lantern with dark glazing bars, seen from below', 'Latarnia dachowa z ciemnymi szprosami, widok od dołu'],
    'facades-rooflights': ['Flat rooflight with no visible frame over a white room', 'Płaskie okno dachowe bez widocznej ramy nad białym pomieszczeniem'],
    'facades-shopfronts': ['Glazed shopfront with a central door below a blank sign board', 'Przeszklona witryna z drzwiami pośrodku pod pustym szyldem'],
    'homeowners-cost': ['Sliding doors in a dark brick extension at dusk, kitchen lit inside', 'Drzwi przesuwne w dobudówce z ciemnej cegły o zmierzchu, w środku oświetlona kuchnia'],
    'lift-slide-corner': ['Close-up of where two lift and slide panels meet', 'Zbliżenie styku dwóch skrzydeł drzwi podnoszono-przesuwnych'],
    'lift-slide-handle': ['Lift and slide door handle on a dark grey frame', 'Klamka drzwi podnoszono-przesuwnych na ciemnoszarej ramie'],
    'lift-slide-threshold': ['Large sliding door with a threshold level with the floor and the terrace', 'Duże drzwi przesuwne z progiem na poziomie podłogi i tarasu'],
    'mat-alu': ['Corner of a bronze-coloured aluminium frame', 'Narożnik ramy aluminiowej w kolorze brązu'],
    'mat-alutimber': ['Section through a timber frame with aluminium cladding', 'Przekrój drewnianej ramy z nakładką aluminiową'],
    'mat-pvc': ['Corner of a white PVC window frame', 'Narożnik białej ramy okna PVC'],
    'mat-timber': ['Corner of an oak window frame', 'Narożnik dębowej ramy okiennej'],
    'sliding-corner': ['Slim meeting stile of a sliding door, close up', 'Smukły słupek styku skrzydeł drzwi przesuwnych z bliska'],
    'sliding-open': ['Sliding door open onto a small garden, curtain drawn aside', 'Otwarte drzwi przesuwne na niewielki ogród, firanka odsunięta'],
    'sliding-threshold': ['Sliding door with a flush threshold between the floor and the terrace', 'Drzwi przesuwne z progiem w poziomie podłogi i tarasu'],
    'windows-casement': ['White casement window with one side open', 'Białe okno rozwierane z jednym otwartym skrzydłem'],
    'windows-fixed': ['Large fixed window with a window seat, looking onto trees', 'Duże okno stałe z siedziskiem, z widokiem na drzewa'],
    'windows-sash': ['White sash window in a yellow brick wall', 'Białe okno przesuwne pionowo w ścianie z żółtej cegły'],
    'windows-steel-look': ['Slim black glazed screen in a steel style dividing a loft', 'Smukła czarna przeszklona ściana w stylu stalowym dzieląca loft'],
    'hero-login': ['Dark-framed window in a white room with an armchair', 'Okno w ciemnej ramie w białym pokoju z fotelem'],
  };
  const alt = (id) => (ALT[id] ? ALT[id][PL ? 1 : 0] : '').replace(/"/g, '&quot;');
  const PORTRAIT = /^hero-login$|-(corner|handle|stack)$/;
  const ratio = (id) => (PORTRAIT.test(id) ? '4 / 5' : /^mat-/.test(id) ? '1 / 1'
    : /^(family|windows|doors|facades)-/.test(id) ? '4 / 3' : '3 / 2');
  const src = (id, ext = 'jpg') => `${BASE}${id}.${ext}`;
  const pic = (id, a) => `<picture><source type="image/avif" srcset="${src(id, 'avif')}"><source type="image/webp" srcset="${src(id, 'webp')}"><img src="${src(id)}" alt="${a}" loading="lazy" decoding="async"></picture>`;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  const fig = (id, cls = '') => {
    const [w, h] = ratio(id).split(' / ').map(Number);
    if (w < h) cls += ' photo-portrait';
    return `<figure class="photo ${cls}" style="aspect-ratio:${ratio(id)};flex-grow:${(w / h).toFixed(3)}">${pic(id, alt(id))}</figure>`;
  };
  const gallery = (ids) => el(`<div class="photo-row">${ids.map((id) => fig(id)).join('')}</div>`);

  // Existing .photo-slot placeholders, in document order.
  const slots = (ids) => document.querySelectorAll('.photo-slot').forEach((s, i) => {
    if (ids[i]) s.append(el(pic(ids[i], s.closest('a') ? '' : alt(ids[i]))));
  });
  // Gallery at the end of a section; inside a 12-column grid it spans the full row.
  const into = (sel, ids) => {
    const s = document.querySelector(sel);
    const box = s?.querySelector('.container') || s;
    if (!box) return;
    const g = gallery(ids);
    if (getComputedStyle(box).display === 'grid') g.style.gridColumn = '1 / -1';
    box.append(g);
  };
  const after = (sel, ids) => document.querySelector(sel)?.after(gallery(ids));
  const bg = (sel, id) => document.querySelectorAll(sel).forEach((s) => {
    s.classList.add('photo-bg');
    s.style.setProperty('--photo-bg', `image-set(url("${src(id, 'avif')}") type("image/avif"), url("${src(id, 'webp')}") type("image/webp"), url("${src(id)}") type("image/jpeg"))`);
  });

  const PAGES = {
    index: () => slots(['family-windows', 'family-doors', 'family-sliding', 'family-facades']),
    products: () => slots(['family-windows', 'family-doors', 'family-sliding', 'family-facades']),
    windows: () => slots(['windows-casement', '', 'windows-sash', '', 'windows-steel-look', 'windows-fixed']),
    doors: () => slots(['doors-entrance', 'doors-french', 'doors-garden']),
    facades: () => slots(['facades-curtain', 'facades-lanterns', 'facades-rooflights', 'facades-shopfronts']),
    'lift-and-slide-doors': () => { into('#how-it-works', ['lift-slide-corner']); into('#threshold', ['lift-slide-threshold']); into('#options', ['lift-slide-handle']); },
    'sliding-doors': () => { into('#when', ['sliding-open']); into('#how-it-works', ['sliding-corner']); into('#threshold', ['sliding-threshold']); },
    'bifold-doors': () => { into('#how-it-works', ['bifold-stack']); into('#configurations', ['bifold-traffic']); into('#london', ['bifold-closed']); },
    materials: () => into('#compare', ['mat-timber', 'mat-alu', 'mat-pvc', 'mat-alutimber']),
    homeowners: () => { into('#cost', ['homeowners-cost']); bg('#worries', 'bg-light'); },
    architects: () => into('#services', ['architects-review']),
    developers: () => into('main section:nth-of-type(3)', ['developers-site', 'about-install']),
    'heritage-conservation': () => after('#repair', ['windows-sash']),
    about: () => into('main section:nth-of-type(2)', ['about-install']),
    login: () => document.querySelector('#auth .span-5')?.append(el(fig('hero-login', 'mt-l photo-login'))),
  };

  PAGES[(location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '')]?.();
  bg('main .cta-band.theme-dark', 'bg-street');
})();
