// Page photographs. Each page's images go into its existing .photo-slot placeholders, under the hero,
// or as a gallery at the end of a section. Swap a file in img/photos/ to replace an image.
(() => {
  const BASE = new URL('../img/photos/', document.currentScript.src).href;
  const PORTRAIT = /^(hero-index-mobile|hero-login)$|-(corner|handle|stack)$/;
  const ratio = (id) => (PORTRAIT.test(id) ? '4 / 5' : /^mat-/.test(id) ? '1 / 1'
    : /^hero-/.test(id) ? '16 / 9' : /^(family|windows|doors|facades)-/.test(id) ? '4 / 3' : '3 / 2');
  const src = (id) => `${BASE}${id}.jpg`;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  const fig = (id, cls = '') => {
    const [w, h] = ratio(id).split(' / ').map(Number);
    if (w < h) cls += ' photo-portrait';
    return `<figure class="photo ${cls}" style="aspect-ratio:${ratio(id)};flex-grow:${(w / h).toFixed(3)}"><img src="${src(id)}" alt="" loading="lazy" decoding="async"></figure>`;
  };
  const gallery = (ids) => el(`<div class="photo-row">${ids.map((id) => fig(id)).join('')}</div>`);

  // Full-width image under the hero copy, above any technical drawing.
  const hero = (id, mobile) => {
    const box = document.querySelector('.hero .container, .page-hero .container');
    if (!box) return;
    box.insertBefore(el(`<figure class="photo photo-hero"><picture>
      ${mobile ? `<source media="(max-width:767px)" srcset="${src(mobile)}">` : ''}
      <img src="${BASE}${id}-2000.jpg" srcset="${BASE}${id}-1000.jpg 1000w, ${BASE}${id}-2000.jpg 2000w" sizes="(min-width:1440px) 1296px, 92vw" alt="" fetchpriority="high"></picture></figure>`),
    box.querySelector('.hero-figure'));
  };
  // Existing .photo-slot placeholders, in document order.
  const slots = (ids) => document.querySelectorAll('.photo-slot').forEach((s, i) => {
    if (ids[i]) s.append(el(`<img src="${src(ids[i])}" alt="" loading="lazy" decoding="async">`));
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
  const bg = (sel, id) => document.querySelectorAll(sel).forEach((s) => { s.classList.add('photo-bg'); s.style.setProperty('--photo-bg', `url("${src(id)}")`); });

  const PAGES = {
    index: () => { hero('hero-index', 'hero-index-mobile'); slots(['family-windows', 'family-doors', 'family-sliding', 'family-facades']); },
    products: () => { hero('hero-products'); slots(['family-windows', 'family-doors', 'family-sliding', 'family-facades']); },
    windows: () => { hero('hero-windows'); slots(['windows-casement', 'windows-tilt-turn', 'windows-sash', 'windows-steel-look', 'windows-fixed']); },
    doors: () => { hero('hero-doors'); slots(['doors-entrance', 'doors-french', 'doors-garden']); },
    facades: () => { hero('hero-facades'); slots(['facades-curtain', 'facades-lanterns', 'facades-rooflights', 'facades-shopfronts']); },
    'lift-and-slide-doors': () => { hero('hero-lift-slide'); into('#how-it-works', ['lift-slide-corner']); into('#threshold', ['lift-slide-threshold']); into('#options', ['lift-slide-handle']); },
    'sliding-doors': () => { hero('hero-sliding'); into('#when', ['sliding-open']); into('#how-it-works', ['sliding-corner']); into('#threshold', ['sliding-threshold']); },
    'bifold-doors': () => { hero('hero-bifold'); into('#how-it-works', ['bifold-stack']); into('#configurations', ['bifold-traffic']); into('#london', ['bifold-closed']); },
    materials: () => { hero('hero-materials'); into('#compare', ['mat-timber', 'mat-alu', 'mat-pvc', 'mat-alutimber']); },
    homeowners: () => { hero('hero-homeowners'); into('#cost', ['homeowners-cost']); bg('#worries', 'bg-light'); },
    architects: () => { hero('hero-architects'); into('#services', ['architects-review']); },
    developers: () => { hero('hero-developers'); into('main section:nth-of-type(3)', ['developers-site', 'about-install']); },
    'heritage-conservation': () => { hero('hero-heritage'); after('#repair', ['windows-sash']); },
    about: () => into('main section:nth-of-type(2)', ['about-install']),
    contact: () => hero('hero-contact'),
    login: () => document.querySelector('#auth .span-5')?.append(el(fig('hero-login', 'mt-l photo-login'))),
    'guide-large-sliding-doors-london': () => hero('hero-guide-large-sliding'),
    'guide-bifold-or-sliding': () => hero('hero-guide-bifold-sliding'),
    'guide-replacing-windows': () => hero('hero-guide-replacing'),
    404: () => hero('hero-404'),
    'thank-you': () => hero('hero-thank-you'),
  };

  PAGES[(location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '')]?.();
  bg('main .cta-band.theme-dark', 'bg-street');
})();
