// AVIF and WebP copies of the photographs in img/photos/. Run after adding or swapping a .jpg: npm run images
// The .jpg stays the source and the fallback; outputs are rebuilt only when the .jpg is newer.
//   hero-<name>-2000.jpg -> hero-<name>-{800,1200,1600,2000}.{avif,webp} (page heroes, see HEROES in build.mjs)
//   hero-index-mobile.jpg -> hero-index-mobile-{600,900}.{avif,webp} (portrait hero on phones)
//   any other .jpg        -> same name .avif and .webp at full size (galleries, slots, backgrounds)
import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIR = new URL('./img/photos/', import.meta.url);
const at = (f) => fileURLToPath(new URL(f, DIR));
const fresh = (src, out) => existsSync(new URL(out, DIR)) && statSync(new URL(out, DIR)).mtimeMs >= statSync(new URL(src, DIR)).mtimeMs;

const jobs = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.jpg'))) {
  if (/-1000\.jpg$/.test(f) || f === 'og-image.jpg') continue; // covered by the -2000 sizes; social cards stay JPEG
  const hero = f.match(/^(hero-.+)-2000\.jpg$/);
  const widths = hero ? [800, 1200, 1600, 2000] : f === 'hero-index-mobile.jpg' ? [600, 900] : [null];
  const base = hero ? hero[1] : f.replace(/\.jpg$/, '');
  for (const w of widths) jobs.push([f, w ? `${base}-${w}` : base, w]);
}

let made = 0;
for (const [src, name, w] of jobs) {
  for (const [ext, enc] of [['avif', (s) => s.avif({ quality: 50, effort: 6 })], ['webp', (s) => s.webp({ quality: 74 })]]) {
    const out = `${name}.${ext}`;
    if (fresh(src, out)) continue;
    let s = sharp(at(src));
    if (w) s = s.resize({ width: w, withoutEnlargement: true });
    await enc(s).toFile(at(out));
    made++;
  }
}
console.log(`images: ${made} written, ${jobs.length * 2 - made} up to date`);
