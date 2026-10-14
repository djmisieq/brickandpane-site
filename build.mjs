// Minimal static build: src/pages/*.html + src/partials -> *.html in the repo root.
// No dependencies. Run: node build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const SITE = 'https://brickandpane.co.uk';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const layout = read('./src/partials/layout.html');
const header = read('./src/partials/header.html');
const footer = read('./src/partials/footer.html');

const pages = readdirSync(new URL('./src/pages/', import.meta.url)).filter((f) => f.endsWith('.html'));

for (const file of pages) {
  const src = read(`./src/pages/${file}`);
  const m = src.match(/^<!--(\{[\s\S]*?\})-->\s*/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = JSON.parse(m[1]);
  const body = src.slice(m[0].length);
  const path = file === 'index.html' ? '' : file;

  // Mark the active nav item.
  const nav = header.replace(new RegExp(`data-nav="${meta.nav}"`, 'g'), `data-nav="${meta.nav}" aria-current="page"`);

  const out = layout
    .replaceAll('{{title}}', meta.title)
    .replaceAll('{{description}}', meta.description)
    .replaceAll('{{canonical}}', `${SITE}/${path}`)
    .replaceAll('{{bodyClass}}', meta.bodyClass || '')
    .replace('{{head}}', meta.head || '')
    .replace('{{header}}', nav)
    .replace('{{footer}}', footer)
    .replace('{{content}}', body.trim());

  writeFileSync(new URL(`./${file}`, import.meta.url), out);
  console.log('built', file);
}
