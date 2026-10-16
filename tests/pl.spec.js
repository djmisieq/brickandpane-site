// Polish version under /pl/: pages, language switch, tools, form and client portal.
import { test, expect } from './fixtures.js';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login',
  'windows', 'doors', 'facades', 'materials', '404', 'heritage-conservation', 'guide-bifold-or-sliding', 'guide-replacing-windows',
];

test.describe('every Polish page', () => {
  for (const name of PAGES) {
    test(`pl/${name}: loads cleanly in Polish, no horizontal scroll`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const res = await page.goto(`/pl/${name}.html`);
      expect(res.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
      await expect(page.locator('h1')).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
});

test('Polish internal links all resolve', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  const hrefs = new Set();
  for (const name of PAGES) {
    await page.goto(`/pl/${name}.html`);
    (await page.$$eval('a[href]', (as) => as.map((a) => new URL(a.getAttribute('href'), location.href).href)))
      .filter((h) => h.startsWith(new URL(page.url()).origin) && /\.html/.test(h)).forEach((h) => hrefs.add(h.split(/[?#]/)[0]));
  }
  for (const h of hrefs) expect((await request.get(h)).status(), h).toBe(200);
});

test('language switch and hreflang link the two versions', async ({ page }) => {
  await page.goto('/lift-and-slide-doors.html');
  await expect(page.locator('link[hreflang="pl"]')).toHaveAttribute('href', /\/pl\/lift-and-slide-doors\.html$/);
  const pl = page.locator('.lang-switch a[hreflang="pl"]');
  if (!(await pl.isVisible())) await page.locator('.menu-toggle').click();
  await pl.click();
  await expect(page).toHaveURL(/\/pl\/lift-and-slide-doors\.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.locator('link[hreflang="en-GB"]')).toHaveAttribute('href', /\/lift-and-slide-doors\.html$/);
  const en = page.locator('.lang-switch a[hreflang="en"]');
  if (!(await en.isVisible())) await page.locator('.menu-toggle').click();
  await en.click();
  await expect(page).toHaveURL(/\/lift-and-slide-doors\.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
});

test('Polish sizing tool speaks Polish and hands off to the Polish form', async ({ page }) => {
  await page.goto('/pl/lift-and-slide-doors.html#sizing');
  await expect(page.locator('[data-out="weight"]')).toHaveText(/140\s?kg/);
  await page.fill('#t-w', '9000');
  await page.selectOption('#t-c', '2A');
  await expect(page.locator('[data-messages]')).toContainText('400 kg');
  await expect(page.locator('[data-messages]')).not.toContainText('beyond the');
  await page.locator('[data-tool-quote]').click();
  await expect(page).toHaveURL(/\/pl\/contact\.html\?system=lift-slide/);
  await expect(page.locator('#f-msg')).toHaveValue(/9000 × 2700 mm/);
});

test('Polish quote form validates in Polish', async ({ page }) => {
  await page.goto('/pl/contact.html');
  await page.fill('#f-email', 'zly');
  await page.locator('#step-1 [data-next]').click();
  const errors = page.locator('#step-1 .field.has-error .error');
  await expect(errors).toHaveCount(3);
  for (const t of await errors.allTextContents()) expect(t).not.toMatch(/required|enter|choose|select|please/i);
});

test.describe('Polish client portal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pl/login.html');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  });

  test('architect demo sees the portal in Polish', async ({ page }) => {
    await page.goto('/pl/portal.html');
    await expect(page).toHaveURL(/\/pl\/login\.html/);
    await page.locator('[data-demo-login="client"]').click();
    await expect(page).toHaveURL(/\/pl\/portal\.html/);
    await expect(page.locator('.appbar-title')).toHaveText('Twoje projekty');
    await expect(page.locator('.stats')).toContainText('Czeka na Ciebie');
    await page.locator('.pcard', { hasText: 'Hartley Road' }).click();
    await expect(page.locator('.now-card')).toContainText('Oferta wysłana');
    await expect(page.locator('[data-tab="documents"]')).toContainText('Dokumenty');
    await page.locator('[data-tab="documents"]').click();
    await page.locator('[data-approve] button[value="approved"]').click();
    await expect(page.locator('.toast')).toHaveText('Najpierw zaznacz potwierdzenie.');
  });

  test('homeowner demo gets Polish order tracking and price form', async ({ page }) => {
    await page.locator('[data-demo-login="homeowner"]').click();
    await expect(page.locator('.appbar-title')).toHaveText('Twoje zamówienia');
    await expect(page.locator('.tracker').first()).toContainText('Oferta');
    await page.goto('/pl/portal.html#/new');
    await expect(page.locator('h1')).toHaveText('Dodaj swój otwór');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.field.has-error .error').first()).toHaveText('Pole wymagane.');
  });
});

test('Polish material advisor answers in Polish', async ({ page }) => {
  await page.goto('/pl/materials.html#advisor');
  await page.locator('label', { hasText: 'Zabytek' }).click();
  await expect(page.locator('[data-out-material]')).toHaveText('Drewno');
  await expect(page.locator('[data-out-why]')).toContainText('zgody konserwatora');
});

test('Polish staff CRM', async ({ page }) => {
  await page.goto('/pl/login.html');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('/pl/admin.html');
  await expect(page).toHaveURL(/\/pl\/login\.html/);
  await page.locator('[data-demo-login="staff"]').click();
  await expect(page).toHaveURL(/\/pl\/admin\.html/);
  await expect(page.locator('h1')).toHaveText('Lejek projektów');
  await expect(page.locator('.appbar-title')).toHaveText('CRM projektów');
  await expect(page.locator('.stats')).toContainText('Czeka na klienta');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await expect(page.locator('[data-stage] .panel-h')).toHaveText('Zmień etap');
  await page.locator('[data-stage] button[type="submit"]').click();
  await expect(page.locator('.toast')).toHaveText('Najpierw wybierz nowy etap.');
  await page.locator('[data-tab="messages"]').click();
  await expect(page.locator('.composer')).toContainText('Wiadomość do klienta');
});
