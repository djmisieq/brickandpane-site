// Minimal static build, two languages. No dependencies. Run: node build.mjs
//   English: src/pages/*.html    + src/partials    -> /*.html
//   Polish:  src/pl/pages/*.html + src/pl/partials -> /pl/*.html
// Pages share slugs across languages, so each page links to its counterpart (hreflang + EN|PL switch).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';

// Search and AI output, also generated here: JSON-LD graph per page, sitemap.xml and llms.txt.
//   Front matter: "private": true (portal, admin, login, thank-you, 404) = always noindex, no canonical, schema,
//   sitemap or llms.txt entry. "crumb": short page name for breadcrumbs. "service": product pages. "updated":
//   YYYY-MM-DD of the last content change (sitemap lastmod; on guides also shown in place of {{updated}}).
//   "article": true for guides (Article schema, og:type article).

const SITE = 'https://brickandpane.co.uk';
// Pre-launch: false keeps every page noindex. At launch set true (docs: WDROZENIE.md §8).
const INDEXABLE = false;
// Portal pages (signed-in data): a Content-Security-Policy and a frame guard. GitHub Pages sends no security headers,
// so both live in the page. supabase-js is served from js/vendor (no third-party script can reach the session).
const APP_PAGES = ['portal.html', 'login.html', 'admin.html'];
const SUPABASE = 'kgnjyyzjmyilorgaeabc.supabase.co';
const appHead = (root) => `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://${SUPABASE}; font-src 'self'; connect-src 'self' https://${SUPABASE} wss://${SUPABASE}; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style id="no-frame">html{display:none!important}</style>
<script src="${root}js/portal/frame.js"></script>
<script src="${root}js/vendor/supabase-js-2.45.4.js" defer></script>
`;
const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(url(p), 'utf8');
const layout = read('./src/partials/layout.html');

const LOCALES = {
  en: {
    dir: './src/pages/', partials: './src/partials/', out: './', root: '', lang: 'en-GB', og: 'en_GB', ogAlt: 'pl_PL',
    skip: 'Skip to content',
    actionHref: 'contact.html?topic=question', actionLabel: 'Ask a question',
    org: 'Windows, doors, sliding doors and glazed facades in aluminium, timber and PVC, made to order and installed in London.',
    ogImageAlt: 'Slim aluminium sliding doors opening onto a walled garden',
    home: 'Home', products: 'Products', guides: 'Guides',
    updated: (d) => `Updated ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
  },
  pl: {
    dir: './src/pl/pages/', partials: './src/pl/partials/', out: './pl/', root: '../', lang: 'pl', og: 'pl_PL', ogAlt: 'en_GB',
    skip: 'Przejdź do treści',
    actionHref: 'contact.html?topic=question', actionLabel: 'Zadaj pytanie',
    org: 'Okna, drzwi, drzwi przesuwne i przeszklone fasady z aluminium, drewna i PVC, na zamówienie, z montażem w Londynie.',
    ogImageAlt: 'Smukłe aluminiowe drzwi przesuwne otwarte na ogród otoczony murem',
    home: 'Start', products: 'Produkty', guides: 'Poradniki',
    updated: (d) => `Aktualizacja: ${d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
  },
};
// Page hero photographs, written into the HTML so the browser finds them early and their box is reserved
// (other photos are placed by js/photos.js). [image, portrait image for phones, alt EN, alt PL]; alt '' = decorative.
// Files: img/photos/<image>-{1000,2000}.jpg plus AVIF/WebP from `npm run images`.
const HEROES = {
  'index.html': ['hero-index', 'hero-index-mobile', 'Floor-to-ceiling sliding doors looking onto a walled garden', 'Drzwi przesuwne od podłogi do sufitu z widokiem na ogród otoczony murem'],
  'products.html': ['hero-products', '', 'Back of a brick house with sliding doors and a roof lantern on the extension', 'Tył ceglanego domu z drzwiami przesuwnymi i latarnią dachową na dobudówce'],
  'windows.html': ['hero-windows', '', 'Terrace of brick houses with white sash windows', 'Szereg ceglanych domów z białymi oknami przesuwnymi pionowo'],
  'doors.html': ['hero-doors', '', 'Black panelled front door under a fanlight, between two sash windows', 'Czarne drzwi frontowe z płycinami i naświetlem, między dwoma oknami przesuwnymi'],
  'facades.html': ['hero-facades', '', 'Brick building with large dark-framed glazing on two floors', 'Ceglany budynek z dużymi przeszkleniami w ciemnych ramach na dwóch kondygnacjach'],
  'lift-and-slide-doors.html': ['hero-lift-slide', '', 'Large lift and slide door part open from a room to the garden', 'Duże drzwi podnoszono-przesuwne częściowo otwarte z pokoju do ogrodu'],
  'sliding-doors.html': ['hero-sliding', '', 'Three-panel sliding door looking onto a walled garden', 'Trzyczęściowe drzwi przesuwne z widokiem na ogród otoczony murem'],
  'bifold-doors.html': ['hero-bifold', '', 'Bi-fold doors folded open from a kitchen to a courtyard garden', 'Drzwi harmonijkowe złożone na bok, otwierające kuchnię na ogród'],
  'materials.html': ['hero-materials', '', 'Frame corners in timber, aluminium and white side by side', 'Narożniki ram z drewna, aluminium i białej ramy obok siebie'],
  'homeowners.html': ['hero-homeowners', '', 'Kitchen with sliding doors open wide to the garden', 'Kuchnia z drzwiami przesuwnymi szeroko otwartymi do ogrodu'],
  'architects.html': ['hero-architects', '', 'Window drawings and a ruler on a desk by a window', 'Rysunki okien i linijka na biurku przy oknie'],
  'developers.html': ['hero-developers', '', 'Four-storey brick block of flats', 'Czterokondygnacyjny ceglany budynek mieszkalny'],
  'heritage-conservation.html': ['hero-heritage', '', 'Georgian brick terrace with white sash windows behind railings', 'Georgiańska ceglana kamienica z białymi oknami przesuwnymi za ogrodzeniem'],
  'contact.html': ['hero-contact', '', 'Sketch of a floor plan on a desk by a window', 'Szkic rzutu na biurku przy oknie'],
  'guide-large-sliding-doors-london.html': ['hero-guide-large-sliding', '', 'Brick extension with wide sliding glass doors onto a lawn', 'Ceglana dobudówka z szerokimi przeszklonymi drzwiami przesuwnymi na trawnik'],
  'guide-bifold-or-sliding.html': ['hero-guide-bifold-sliding', '', 'Rear extension with bi-fold doors on the left and sliding doors on the right', 'Dobudówka z drzwiami harmonijkowymi po lewej i przesuwnymi po prawej'],
  'guide-replacing-windows.html': ['hero-guide-replacing', '', 'Old window taken out and leaning against the wall beside the opening', 'Wyjęte stare okno oparte o ścianę obok otworu'],
  '404.html': ['hero-404', '', '', ''],
  'thank-you.html': ['hero-thank-you', '', 'Timber sliding door looking onto a garden', 'Drewniane drzwi przesuwne z widokiem na ogród'],
};
const SIZES = '(min-width:1440px) 1296px, 92vw';
const heroFigure = ([id, mobile, en, pl], loc) => {
  const p = `${LOCALES[loc].root}img/photos/`;
  const set = (ext) => [800, 1200, 1600, 2000].map((w) => `${p}${id}-${w}.${ext} ${w}w`).join(', ');
  const phone = mobile ? ['avif', 'webp'].map((ext) => `<source media="(max-width:767px)" type="image/${ext}" srcset="${p}${mobile}-600.${ext} 600w, ${p}${mobile}-900.${ext} 900w" sizes="92vw">`).join('')
    + `<source media="(max-width:767px)" srcset="${p}${mobile}.jpg">` : '';
  return `<figure class="photo photo-hero"><picture>${phone}<source type="image/avif" srcset="${set('avif')}" sizes="${SIZES}"><source type="image/webp" srcset="${set('webp')}" sizes="${SIZES}">`
    + `<img src="${p}${id}-2000.jpg" srcset="${p}${id}-1000.jpg 1000w, ${p}${id}-2000.jpg 2000w" sizes="${SIZES}" width="2000" height="1125" alt="${esc(loc === 'pl' ? pl : en)}" fetchpriority="high"></picture></figure>\n`;
};
// Product pages sit under "Products" in the breadcrumb trail.
const PRODUCT_NAV = ['lift-slide', 'sliding', 'bifold', 'windows', 'doors', 'facades', 'heritage'];
const ORG = `${SITE}/#org`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Visible text of a fragment: tags out, entities decoded, whitespace collapsed (for FAQ answers in JSON-LD).
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').replace(/\s([.,;:!?)])/g, '$1').trim();
const pages = { en: [], pl: [] };
const pagesOf = (loc) => (existsSync(url(LOCALES[loc].dir)) ? readdirSync(url(LOCALES[loc].dir)).filter((f) => f.endsWith('.html')) : []);
const EN = new Set(pagesOf('en'));
const PL = new Set(pagesOf('pl'));
const pageUrl = (loc, file) => `${SITE}/${loc === 'pl' ? 'pl/' : ''}${file === 'index.html' ? '' : file}`;

mkdirSync(url('./pl/'), { recursive: true });

for (const [loc, L] of Object.entries(LOCALES)) {
  const header = read(`${L.partials}header.html`);
  const footer = read(`${L.partials}footer.html`);
  for (const file of pagesOf(loc)) {
    const src = read(`${L.dir}${file}`);
    const m = src.match(/^<!--(\{[\s\S]*?\})-->\s*/);
    if (!m) throw new Error(`${loc}/${file}: missing front matter`);
    const meta = JSON.parse(m[1]);
    const body = src.slice(m[0].length);

    const hasEn = EN.has(file), hasPl = PL.has(file);
    // Language switch: counterpart page if it exists, otherwise the same page with ?lang= (portal pages translate in JS).
    const enHref = loc === 'en' ? file : (hasEn ? `../${file === 'index.html' ? '' : file}` : '../');
    const plHref = loc === 'pl' ? file : (hasPl ? `pl/${file === 'index.html' ? '' : file}` : `${file}?lang=pl`);
    const alternates = hasEn && hasPl && !meta.private
      ? [`<link rel="alternate" hreflang="en-GB" href="${pageUrl('en', file)}">`, `<link rel="alternate" hreflang="pl" href="${pageUrl('pl', file)}">`, `<link rel="alternate" hreflang="x-default" href="${pageUrl('en', file)}">`].join('\n')
      : '';

    // aria-current="page" only on the link to this very page; a link to a sibling in the same section
    // (the other guides, portal while on login) gets aria-current="true".
    let nav = header.replace(new RegExp(`href="([^"]*)"([^>]*) data-nav="${meta.nav}"`, 'g'),
      (m, href) => `${m} aria-current="${href.split('#')[0] === file ? 'page' : 'true'}"`);
    if (['lift-slide', 'sliding', 'bifold', 'products', 'windows', 'doors', 'facades', 'heritage'].includes(meta.nav)) nav = nav.replace('data-group="products"', 'data-group="products" data-current');
    nav = nav.replace('{{enHref}}', enHref).replace('{{plHref}}', plHref)
      .replace('{{enCurrent}}', loc === 'en' && !meta.lang ? 'aria-current="true"' : '')
      .replace('{{plCurrent}}', loc === 'pl' ? 'aria-current="true"' : '');

    // On-page section nav (phones and tablets): inserted after the first section, the page hero.
    let content = body.trim();
    if (meta.sections) {
      const links = meta.sections.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('');
      const sn = `<nav class="section-nav" aria-label="${loc === 'pl' ? 'Na tej stronie' : 'On this page'}"><ul class="container">${links}</ul></nav>`;
      const i = content.indexOf('</section>') + '</section>'.length;
      content = `${content.slice(0, i)}\n${sn}${content.slice(i)}`;
    }

    // Technical sections (data-tech): keep the heading, fold the detail behind "Technical data for architects".
    // The h2 stays outside <summary>: a heading inside the toggle button loses its role in screen readers.
    content = content.replace(/<section([^>]*) data-tech>([\s\S]*?)<\/section>/g, (m, attrs, inner) => {
      const h2 = inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      const label = loc === 'pl' ? 'Dane techniczne dla architektów' : 'Technical data for architects';
      // Moving the h2 out can leave its wrapper empty, which would hold an empty grid column: drop it.
      const rest = inner.replace(h2[0], '').replace(/<div>\s*<\/div>/, '');
      const name = h2[1].replace(/<[^>]+>/g, '');
      return `<section${attrs} data-tech><div class="container">${h2[0].replace('<h2', '<h2 class="tech-h"')}<details class="tech"><summary><span>${label}<span class="visually-hidden">: ${name}</span></span></summary>${rest}</details></div></section>`;
    });

    // Hero photograph: under the hero copy, above the technical drawing if the hero has one.
    if (HEROES[file]) {
      const first = content.slice(0, content.indexOf('</section>'));
      const fig = first.indexOf('<figure class="hero-figure');
      const at = fig >= 0 ? fig : first.lastIndexOf('</div>');
      content = `${content.slice(0, at)}${heroFigure(HEROES[file], loc)}${content.slice(at)}`;
    }

    const updated = meta.updated ? new Date(`${meta.updated}T00:00:00Z`) : null;
    if (content.includes('{{updated}}')) {
      if (!updated) throw new Error(`${loc}/${file}: {{updated}} needs "updated" in front matter`);
      content = content.replaceAll('{{updated}}', `<time datetime="${meta.updated}">${L.updated(updated)}</time>`);
    }

    // JSON-LD: one graph per page. The business node is shared by @id; FAQPage is read from the visible
    // <details><summary> FAQ markup, so schema and page text cannot drift apart. No offers, prices or ratings.
    let jsonld = '';
    const canonical = pageUrl(loc, file);
    if (!meta.private) {
      if (!meta.crumb) throw new Error(`${loc}/${file}: missing "crumb"`);
      const name = meta.title.split(' | ')[0];
      const crumbs = [[L.home, pageUrl(loc, 'index.html')]];
      if (PRODUCT_NAV.includes(meta.nav)) crumbs.push([L.products, pageUrl(loc, 'products.html')]);
      if (meta.article) crumbs.push([L.guides, pageUrl(loc, 'guides.html')]);
      if (file !== 'index.html') crumbs.push([meta.crumb, canonical]);
      const graph = [
        { '@type': 'HomeAndConstructionBusiness', '@id': ORG, name: 'Brick & Pane', url: `${SITE}/`, email: 'daniel@brickandpane.co.uk',
          logo: `${SITE}/img/logo.svg`, image: `${SITE}/img/photos/og-image.jpg`, description: L.org,
          areaServed: { '@type': 'City', name: 'London' } },
        { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Brick & Pane', publisher: { '@id': ORG }, inLanguage: ['en-GB', 'pl'] },
        { '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name,
          description: meta.description, inLanguage: L.lang, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': ORG },
          breadcrumb: { '@id': `${canonical}#breadcrumb` }, ...(updated ? { dateModified: meta.updated } : {}) },
        { '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`,
          itemListElement: crumbs.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) },
      ];
      if (meta.service) graph.push({ '@type': 'Service', '@id': `${canonical}#service`, name: meta.crumb, serviceType: meta.service,
        provider: { '@id': ORG }, areaServed: { '@type': 'City', name: 'London' }, url: canonical });
      const h1 = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      if (meta.article) graph.push({ '@type': 'Article', '@id': `${canonical}#article`, headline: h1 ? text(h1[1]) : name,
        description: meta.description, inLanguage: L.lang, mainEntityOfPage: { '@id': `${canonical}#webpage` }, url: canonical,
        image: `${SITE}/img/photos/og-image.jpg`, author: { '@id': ORG }, publisher: { '@id': ORG },
        ...(meta.published ? { datePublished: meta.published } : {}), ...(updated ? { dateModified: meta.updated } : {}) });
      const faq = [...content.matchAll(/<details><summary>([\s\S]*?)<\/summary><div class="answer">([\s\S]*?)<\/div><\/details>/g)];
      if (faq.length) graph.push({ '@type': 'FAQPage', '@id': `${canonical}#faq`, inLanguage: L.lang, isPartOf: { '@id': `${canonical}#webpage` },
        mainEntity: faq.map(([, q, a]) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } })) });
      jsonld = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>\n`;
      pages[loc].push({ file, title: meta.title, description: meta.description, updated: meta.updated, alt: hasEn && hasPl, article: !!meta.article });
    }

    const out = layout
      .replaceAll('{{title}}', meta.title)
      .replaceAll('{{description}}', meta.description)
      .replace('{{robots}}', INDEXABLE && !meta.private ? 'index,follow' : 'noindex,nofollow')
      .replace('{{canonicalTag}}', meta.private ? '' : `<link rel="canonical" href="${canonical}">\n`)
      .replace('{{ogType}}', meta.article ? 'article' : 'website')
      .replace('{{ogLocaleAlt}}', L.ogAlt)
      .replace('{{ogImageAlt}}', esc(L.ogImageAlt))
      .replace('{{jsonld}}', () => jsonld)
      .replaceAll('{{canonical}}', canonical)
      .replaceAll('{{bodyClass}}', meta.bodyClass || '')
      .replaceAll('{{root}}', L.root)
      .replace('{{lang}}', L.lang)
      .replace('{{ogLocale}}', L.og)
      .replace('{{alternates}}', alternates)
      .replace('{{skip}}', L.skip)
      .replace('{{base}}', meta.base ? `<base href="${meta.base}">\n` : '')
      .replace('{{head}}', () => (meta.head || '') + (APP_PAGES.includes(file) ? appHead(L.root) : ''))
      .replace('{{header}}', nav)
      .replace('{{footer}}', footer
        .replace('{{actionHref}}', meta.actionHref || L.actionHref)
        .replace('{{actionLabel}}', meta.actionLabel || L.actionLabel))
      .replace('{{content}}', content);

    // Always LF: sources may be checked out with CRLF (Windows), and CI compares the output byte for byte.
    writeFileSync(url(`${L.out}${file}`), out.replace(/\r\n/g, '\n'));
    console.log('built', `${loc}/${file}`);
  }
}

// sitemap.xml: every public page in both languages, with hreflang alternates and lastmod from "updated".
const sitemapUrls = Object.entries(pages).flatMap(([loc, list]) => list.map((p) => {
  const alt = p.alt ? ['en', 'pl'].map((l) => `\n    <xhtml:link rel="alternate" hreflang="${l === 'en' ? 'en-GB' : 'pl'}" href="${pageUrl(l, p.file)}"/>`).join('')
    + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl('en', p.file)}"/>` : '';
  return `  <url>\n    <loc>${pageUrl(loc, p.file)}</loc>${p.updated ? `\n    <lastmod>${p.updated}</lastmod>` : ''}${alt}\n  </url>`;
}));
writeFileSync(url('./sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapUrls.join('\n')}\n</urlset>\n`);

// llms.txt: a plain index of the public pages for AI assistants (llmstxt.org format).
const llmsList = (list, loc) => list.map((p) => `- [${p.title.split(' | ')[0]}](${pageUrl(loc, p.file)}): ${p.description}`).join('\n');
writeFileSync(url('./llms.txt'), `# Brick & Pane

> ${LOCALES.en.org} Every project is quoted individually; the site publishes system data, Building Regulations guidance and how we work.

Contact: daniel@brickandpane.co.uk

## Guides (English)

${llmsList(pages.en.filter((p) => p.article), 'en')}

## Pages (English)

${llmsList(pages.en.filter((p) => !p.article), 'en')}

## Poradniki (polski)

${llmsList(pages.pl.filter((p) => p.article), 'pl')}

## Strony (polski)

${llmsList(pages.pl.filter((p) => !p.article), 'pl')}
`);
console.log('built sitemap.xml, llms.txt');
