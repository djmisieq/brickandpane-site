// Minimal static build, two languages. No dependencies. Run: node build.mjs
//   English: src/pages/*.html    + src/partials    -> /*.html
//   Polish:  src/pl/pages/*.html + src/pl/partials -> /pl/*.html
// Pages share slugs across languages, so each page links to its counterpart (hreflang + EN|PL switch).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';

const SITE = 'https://brickandpane.co.uk';
const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(url(p), 'utf8');
const layout = read('./src/partials/layout.html');

const LOCALES = {
  en: {
    dir: './src/pages/', partials: './src/partials/', out: './', root: '', lang: 'en-GB', og: 'en_GB',
    skip: 'Skip to content',
    prelaunch: 'Pre-launch preview. Values marked <span class="tag">Indicative</span> are being verified against test certificates.',
    actionHref: 'login.html?next=portal.html%23%2Fnew&signup=homeowner', actionLabel: 'Get a price',
  },
  pl: {
    dir: './src/pl/pages/', partials: './src/pl/partials/', out: './pl/', root: '../', lang: 'pl', og: 'pl_PL',
    skip: 'Przejdź do treści',
    prelaunch: 'Wersja przedpremierowa. Wartości oznaczone <span class="tag">Orientacyjnie</span> są weryfikowane na podstawie certyfikatów badań.',
    actionHref: 'login.html?next=portal.html%23%2Fnew&signup=homeowner', actionLabel: 'Poznaj cenę',
  },
};
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
    const enHref = loc === 'en' ? file : (hasEn ? `../${file}` : '../index.html');
    const plHref = loc === 'pl' ? file : (hasPl ? `pl/${file === 'index.html' ? '' : file}` : `${file}?lang=pl`);
    const alternates = hasEn && hasPl
      ? [`<link rel="alternate" hreflang="en-GB" href="${pageUrl('en', file)}">`, `<link rel="alternate" hreflang="pl" href="${pageUrl('pl', file)}">`, `<link rel="alternate" hreflang="x-default" href="${pageUrl('en', file)}">`].join('\n')
      : '';

    let nav = header.replace(new RegExp(`data-nav="${meta.nav}"`, 'g'), `data-nav="${meta.nav}" aria-current="page"`);
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
    content = content.replace(/<section([^>]*) data-tech>([\s\S]*?)<\/section>/g, (m, attrs, inner) => {
      const h2 = inner.match(/<h2[^>]*>[\s\S]*?<\/h2>/)[0];
      const label = loc === 'pl' ? 'Dane techniczne dla architektów' : 'Technical data for architects';
      return `<section${attrs} data-tech><div class="container"><details class="tech"><summary><span class="tech-label">${label}</span>${h2}</summary>${inner.replace(h2, '')}</details></div></section>`;
    });

    const out = layout
      .replaceAll('{{title}}', meta.title)
      .replaceAll('{{description}}', meta.description)
      .replaceAll('{{canonical}}', pageUrl(loc, file))
      .replaceAll('{{bodyClass}}', meta.bodyClass || '')
      .replaceAll('{{root}}', L.root)
      .replace('{{lang}}', L.lang)
      .replace('{{ogLocale}}', L.og)
      .replace('{{alternates}}', alternates)
      .replace('{{skip}}', L.skip)
      .replace('{{prelaunch}}', L.prelaunch)
      .replace('{{base}}', meta.base ? `<base href="${meta.base}">\n` : '')
      .replace('{{head}}', meta.head || '')
      .replace('{{header}}', nav)
      .replace('{{footer}}', footer
        .replace('{{actionHref}}', meta.actionHref || L.actionHref)
        .replace('{{actionLabel}}', meta.actionLabel || L.actionLabel))
      .replace('{{content}}', content);

    writeFileSync(url(`${L.out}${file}`), out);
    console.log('built', `${loc}/${file}`);
  }
}
