// Automated accessibility audit (axe-core, WCAG 2.2 A/AA) of every public page, English and Polish.
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login', '404', 'thank-you',
  'windows', 'doors', 'facades', 'materials', 'heritage-conservation', 'guide-bifold-or-sliding', 'guide-replacing-windows', 'guide-steel-windows-conservation-areas', 'guide-roof-lantern-or-rooflight', 'guide-planning-bifold-sliding-doors', 'guide-aluminium-or-steel-windows', 'guide-slim-double-or-secondary-glazing', 'guide-25-percent-glazing-rule', 'guide-what-affects-the-price', 'guide-windows-leasehold-flat', 'guide-fensa-certificates',
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
    // Only the Turnstile captcha script may come from elsewhere (contact and login, when build.mjs has a site key).
    page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('https://challenges.cloudflare.com/turnstile/')) foreign.push(r.url()); });
    page.on('response', async (r) => { try { const n = (await r.body()).length; if (r.url().includes('/img/photos/')) photoBytes += n; else bytes += n; } catch { /* redirects have no body */ } });
    await page.goto(url, { waitUntil: 'networkidle' });
    expect(foreign, url).toEqual([]);
    // Budget: HTML + CSS + JS + fonts. Today about 350 kB. Photos have their own budget (lazy-loaded below the fold).
    expect(bytes, url).toBeLessThan(500 * 1024);
    expect(photoBytes, url).toBeLessThan(900 * 1024);
    page.removeAllListeners('request'); page.removeAllListeners('response');
  }
});

// Colour audit 26.11.2026: the CRM and the client portal had no contrast check. Every main view, in demo mode.
test('CRM and portal: text contrast holds on every main view', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  test.setTimeout(120000);
  const bad = [];
  const check = async (where) => {
    await page.waitForTimeout(300);
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    violations.forEach((v) => v.nodes.slice(0, 5).forEach((n) => bad.push(`${where}: ${n.target.join(' ')} ${n.any[0]?.message || ''}`)));
  };
  await page.goto('/admin.html#/today');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.today').waitFor();
  await check('today');
  for (const hash of ['#/board', '#/list', '#/my', '#/calendar', '#/enquiries', '#/owner', '#/companies', '#/quotes', '#/playbook', '#/automations', '#/inbox', '#/timeline']) {
    await page.goto(`/admin.html${hash}`);
    await check(hash);
  }
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('.project-head').waitFor();
  await check('project card');
  expect(bad).toEqual([]);
});

// UX audit U3: the same check in the CRM's dark mode.
test('CRM in dark mode: text contrast holds on every main view', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  test.setTimeout(120000);
  await page.addInitScript(() => { try { localStorage.setItem('bp-crm-theme', 'dark'); } catch {} });
  const bad = [];
  const check = async (where) => {
    await page.waitForTimeout(300);
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    violations.forEach((v) => v.nodes.slice(0, 5).forEach((n) => bad.push(`${where}: ${n.target.join(' ')} ${n.any[0]?.message || ''}`)));
  };
  await page.goto('/admin.html#/today');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.today').waitFor();
  await check('today');
  for (const hash of ['#/board', '#/list', '#/my', '#/calendar', '#/enquiries', '#/owner', '#/companies', '#/quotes', '#/playbook', '#/automations', '#/inbox', '#/timeline']) {
    await page.goto(`/admin.html${hash}`);
    await check(hash);
  }
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('.project-head').waitFor();
  await check('project card');
  expect(bad).toEqual([]);
});

test('client portal: text contrast holds on the dashboard and a project', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  await page.goto('/portal.html');
  await page.locator('[data-demo-login="client"]').click();
  await page.locator('.pcard').first().waitFor();
  const bad = [];
  const check = async (where) => {
    await page.waitForTimeout(300);
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    violations.forEach((v) => v.nodes.slice(0, 5).forEach((n) => bad.push(`${where}: ${n.target.join(' ')} ${n.any[0]?.message || ''}`)));
  };
  await check('portal');
  await page.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await page.locator('.now-card').waitFor();
  await check('project');
  expect(bad).toEqual([]);
});
