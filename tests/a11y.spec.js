// Automated accessibility audit (axe-core, WCAG 2.2 A/AA) of every public page, English and Polish.
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login', '404', 'thank-you',
  'windows', 'doors', 'facades', 'materials', 'heritage-conservation', 'guide-bifold-or-sliding', 'guide-replacing-windows', 'guide-steel-windows-conservation-areas', 'guide-roof-lantern-or-rooflight', 'guide-pas-24-secure-doors',
];

for (const url of [...PAGES.map((p) => `/${p}.html`), ...PAGES.map((p) => `/pl/${p}.html`)]) {
  test(`${url}: no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('pages stay light and load nothing from other domains', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'runs once');
  for (const url of ['/index.html', '/lift-and-slide-doors.html', '/pl/bifold-doors.html', '/contact.html']) {
    const foreign = [];
    let bytes = 0;
    let photoBytes = 0;
    page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) foreign.push(r.url()); });
    page.on('response', async (r) => { try { const n = (await r.body()).length; if (r.url().includes('/img/photos/')) photoBytes += n; else bytes += n; } catch { /* redirects have no body */ } });
    await page.goto(url, { waitUntil: 'networkidle' });
    expect(foreign, url).toEqual([]);
    // Budget: HTML + CSS + JS + fonts. Today about 350 kB. Photos have their own budget (lazy-loaded below the fold).
    expect(bytes, url).toBeLessThan(500 * 1024);
    expect(photoBytes, url).toBeLessThan(900 * 1024);
    page.removeAllListeners('request'); page.removeAllListeners('response');
  }
});
