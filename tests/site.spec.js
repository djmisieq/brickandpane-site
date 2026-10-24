// End-to-end tests for the public site. Run with `npm test`.
import { test, expect } from './fixtures.js';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login', '404',
  'windows', 'doors', 'facades', 'materials', 'heritage-conservation', 'guide-bifold-or-sliding', 'guide-replacing-windows', 'guide-steel-windows-conservation-areas', 'guide-roof-lantern-or-rooflight', 'guide-planning-bifold-sliding-doors', 'guide-aluminium-or-steel-windows', 'guide-slim-double-or-secondary-glazing', 'guide-25-percent-glazing-rule', 'guide-what-affects-the-price', 'guide-windows-leasehold-flat', 'guide-fensa-certificates',
];
const isMobileNav = (page) => page.viewportSize().width < 1100;

test.describe('every page', () => {
  for (const name of PAGES) {
    test(`${name}: loads cleanly, one h1, no horizontal scroll`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const res = await page.goto(`/${name}.html`);
      expect(res.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
});

test('internal links all resolve', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  const hrefs = new Set();
  for (const name of PAGES) {
    await page.goto(`/${name}.html`);
    (await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))))
      .filter((h) => /^[\w-]+\.html/.test(h)).forEach((h) => hrefs.add(h.split(/[?#]/)[0]));
  }
  for (const h of hrefs) expect((await request.get(`/${h}`)).status(), h).toBe(200);
});

test.describe('navigation', () => {
  test('mobile menu covers the screen and works', async ({ page }) => {
    test.skip(!isMobileNav(page), 'mobile/tablet only');
    await page.goto('/contact.html');
    const toggle = page.locator('.menu-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const nav = page.locator('#primary-nav');
    await expect(nav).toBeVisible();

    // The panel must start under the header, reach the bottom of the viewport and sit on top of the page.
    const vp = page.viewportSize();
    const box = await nav.boundingBox();
    const headerBottom = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().bottom);
    expect(Math.abs(box.y - headerBottom)).toBeLessThanOrEqual(2);
    expect(box.y + box.height).toBeGreaterThanOrEqual(vp.height - 1);
    expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
    const onTop = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight - 40);
      return !!el && !!el.closest('#primary-nav');
    });
    expect(onTop).toBe(true);
    expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

    // Dropdown works as an accordion inside the menu.
    const sub = page.locator('.sub-toggle');
    await expect(page.locator('#sub-products')).toBeHidden();
    await sub.click();
    await expect(sub).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#sub-products a[href="bifold-doors.html"]')).toBeVisible();

    // Escape closes and returns focus to the toggle.
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();

    // A link navigates.
    await toggle.click();
    await page.locator('#primary-nav a[href="architects.html"]').click();
    await expect(page).toHaveURL(/architects\.html$/);
  });

  test('mobile menu shows the client portal without scrolling, above the language switch', async ({ page }) => {
    test.skip(!isMobileNav(page), 'mobile/tablet only');
    for (const url of ['/index.html', '/pl/index.html']) {
      await page.goto(url);
      await page.locator('.menu-toggle').click();
      const portal = await page.locator('.nav-login').boundingBox();
      expect(portal.y + portal.height, `${url}: portal below the fold`).toBeLessThanOrEqual(page.viewportSize().height);
      expect(portal.y).toBeLessThan((await page.locator('.primary-nav .lang-switch').boundingBox()).y);
    }
  });

  test('mobile menu opens with the current group expanded after scrolling', async ({ page }) => {
    test.skip(!isMobileNav(page), 'mobile/tablet only');
    await page.goto('/bifold-doors.html');
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(200);
    await page.locator('.menu-toggle').click();
    const box = await page.locator('#primary-nav').boundingBox();
    expect(box.y).toBeLessThanOrEqual(90);
    await expect(page.locator('.sub-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#sub-products a[aria-current="page"]')).toHaveAttribute('href', 'bifold-doors.html');
  });

  test('desktop dropdown opens, closes on Escape and outside click', async ({ page }) => {
    test.skip(isMobileNav(page), 'desktop only');
    await page.goto('/index.html');
    const sub = page.locator('.sub-toggle');
    const panel = page.locator('#sub-products');
    await expect(panel).toBeHidden();
    await sub.click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.mega-h')).toHaveCount(4);
    await expect(panel.locator('a[href="windows.html"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(sub).toBeFocused();
    await sub.click();
    await page.mouse.click(5, page.viewportSize().height - 5);
    await expect(panel).toBeHidden();
    await sub.click();
    await panel.locator('a[href="sliding-doors.html"]').click();
    await expect(page).toHaveURL(/sliding-doors\.html$/);
    await expect(page.locator('.has-sub')).toHaveAttribute('data-current', '');
  });
});

test.describe('sizing tools', () => {
  test('lift & slide: weights, limits and quote hand-off', async ({ page }) => {
    await page.goto('/lift-and-slide-doors.html#sizing');
    await expect(page.locator('[data-out="panelw"]')).toHaveText('1,418 mm');
    await expect(page.locator('[data-out="weight"]')).toHaveText('140 kg');
    await page.fill('#t-w', '9000');
    await page.selectOption('#t-c', '2A');
    await expect(page.locator('[data-messages]')).toContainText('beyond the 400 kg hardware class');
    await expect(page.locator('[data-messages]')).toContainText('over the 3,300 mm limit');
    await page.fill('#t-a', '30');
    await expect(page.locator('[data-messages]')).toContainText('Building Regulations (Part L)');
    await page.locator('[data-tool-quote]').click();
    await expect(page).toHaveURL(/contact\.html\?system=lift-slide/);
    await expect(page.locator('input[name="systems"][value="lift-slide"]')).toBeChecked();
    await page.fill('#f-name', 'Sam'); await page.fill('#f-email', 'sam@example.com');
    await page.locator('#step-1 [data-next]').click();
    const row = page.locator('[data-op]').first();
    await expect(row.locator('[data-k="system"]')).toHaveValue('lift-slide');
    await expect(row.locator('[data-k="width_mm"]')).toHaveValue('9000');
    await expect(row.locator('[data-k="note"]')).toHaveValue(/2 panels/);
  });

  test('slim sliding: recommends lift & slide when too heavy', async ({ page }) => {
    await page.goto('/sliding-doors.html#sizing');
    await expect(page.locator('[data-messages]')).toContainText('inside the 250 kg inline hardware range');
    await page.fill('#t-w', '6000'); await page.fill('#t-h', '3000');
    await page.selectOption('#t-c', '2A'); await page.selectOption('#t-g', 't');
    await expect(page.locator('[data-messages]')).toContainText('consider lift & slide');
    await page.locator('[data-tool-quote]').click();
    await expect(page.locator('[data-op] [data-k="system"]').first()).toHaveValue('sliding');
  });

  test('bi-fold: traffic door, stack projection, leaf limits', async ({ page }) => {
    await page.goto('/bifold-doors.html#sizing');
    await expect(page.locator('[data-messages]')).toContainText('traffic door');
    await expect(page.locator('[data-out="stack"]')).not.toHaveText('—');
    await page.selectOption('#t-l', '2+2');
    await expect(page.locator('[data-messages]')).toContainText('No traffic door');
    await page.selectOption('#t-l', '3+0'); await page.fill('#t-w', '6000');
    await expect(page.locator('[data-messages]')).toContainText('over the 1,200 mm limit');
    await page.selectOption('#t-s', 'in');
    await expect(page.locator('[data-messages]')).toContainText('into the room');
    await expect(page.locator('[data-elevation] text', { hasText: 'door' })).toHaveCount(1);
  });

  test('invalid sizes show a prompt instead of numbers', async ({ page }) => {
    await page.goto('/bifold-doors.html#sizing');
    await page.fill('#t-w', '200');
    await expect(page.locator('[data-out="weight"]')).toHaveText('—');
    await expect(page.locator('[data-messages]')).toContainText('Enter an opening');
  });
});

test.describe('no automatic prices', () => {
  // Every project is quoted individually: the tools never show an amount, whatever the URL says.
  for (const url of ['/lift-and-slide-doors.html#sizing', '/bifold-doors.html?preview=pricing#sizing', '/pl/sliding-doors.html#sizing']) {
    test(`sizing tool shows no amount: ${url}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('[data-estimate]')).toContainText(/priced individually|wyceniamy indywidualnie/);
      await expect(page.locator('[data-sizing-tool]')).not.toContainText('£');
    });
  }
});

test.describe('homeowner & mobile details', () => {
  test('contact form adapts to a homeowner and carries opening sizes', async ({ page }) => {
    await page.goto('/contact.html?role=homeowner&system=bifold&w=4800&h=2400');
    await expect(page.locator('[data-preview-note]')).toBeHidden(); // the form is connected to Supabase
    await page.fill('#f-name', 'Sam'); await page.fill('#f-email', 'sam@example.com');
    await page.locator('#step-1 [data-next]').click();
    await expect(page.locator('[data-op] [data-k="width_mm"]')).toHaveValue('4800');
    await expect(page.locator('[data-op] [data-k="height_mm"]')).toHaveValue('2400');
    const visible = await page.$$eval('#f-topic option', (os) => os.filter((o) => !o.hidden).map((o) => o.value));
    expect(visible).not.toContain('cpd');
    expect(visible).not.toContain('pqq');
    expect(visible).toContain('question');
  });
  test('comparison table keeps column names on small screens', async ({ page }) => {
    test.skip(page.viewportSize().width > 600, 'mobile only');
    await page.goto('/lift-and-slide-doors.html#compare');
    const cell = page.locator('#compare tbody tr').first().locator('td').first();
    await expect(cell).toHaveAttribute('data-label', 'Lift & slide');
    const before = await cell.evaluate((el) => getComputedStyle(el, '::before').content);
    expect(before).toContain('Lift');
  });
});

test.describe('quote form', () => {
  test('validates each step and never pretends to send', async ({ page }) => {
    // Never reach the real Supabase function from tests: fail the first send, accept the second.
    const sent = [];
    await page.route('**/functions/v1/contact-submit', (route) => {
      sent.push(route.request().postData() || '');
      return route.fulfill(sent.length === 1 ? { status: 500, body: '{}' } : { status: 200, contentType: 'application/json', body: '{"ok":true,"ref":"BP-TEST"}' });
    });
    await page.goto('/contact.html?role=architect&system=bifold');
    await expect(page.locator('input[name="role"][value="architect"]')).toBeChecked();
    await page.fill('#f-email', 'bad');
    await page.locator('#step-1 [data-next]').click();
    await expect(page.locator('#step-1 .field.has-error')).toHaveCount(2);
    await page.fill('#f-name', 'Anna Clarke');
    await page.fill('#f-email', 'anna@practice.co.uk');
    await page.locator('#step-1 [data-next]').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await expect(page.locator('#f-stage')).toBeVisible();
    await expect(page.locator('input[name="systems"][value="bifold"]')).toBeChecked();
    await page.locator('#step-2 [data-next]').click();
    await expect(page.locator('#step-2 .field.has-error')).toHaveCount(1);
    await page.fill('#f-loc', 'Hackney E5');
    await page.locator('#step-2 [data-next]').click();
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('#step-3 .field.has-error')).toHaveCount(1);
    await page.check('input[name="consent"]');
    await page.fill('#f-link', 'wetransfer');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('#f-link')).toBeFocused();
    expect(sent).toHaveLength(0);
    await page.fill('#f-link', 'https://we.tl/t-abc123');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('[data-form-status]')).toContainText('couldn’t send');
    expect(sent[0]).toContain('https://we.tl/t-abc123');
    await page.locator('#step-3 [data-prev]').click();
    await page.locator('#step-2 [data-prev]').click();
    await expect(page.locator('#f-name')).toHaveValue('Anna Clarke');
    await page.locator('#step-1 [data-next]').click();
    await page.locator('#step-2 [data-next]').click();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/thank-you\.html\?ref=BP-TEST$/);
  });

  test('a list of openings built on product pages goes out with one enquiry, no account', async ({ page }) => {
    test.slow(); // several page loads in one flow
    const sent = [];
    await page.route('**/functions/v1/contact-submit', (route) => {
      sent.push(route.request().postData() || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ref":"BP-LIST"}' });
    });
    await page.goto('/lift-and-slide-doors.html#sizing');
    await page.locator('[data-tool-add]').click();
    await expect(page.locator('[data-tool-list]')).toContainText('Added as D01. Your list has 1 opening.');
    await page.goto('/bifold-doors.html#sizing');
    await page.fill('#t-w', '4200');
    await page.locator('[data-tool-add]').click();
    await expect(page.locator('[data-tool-list]')).toContainText('Your list has 2 openings');
    // Adding opens the list panel; it sends the list to the quote form.
    await page.locator('.list-drawer [data-list-send]').click();
    // The rows are drawn by the page script: once they are there, the form's buttons work too.
    await expect(page.locator('[data-op]')).toHaveCount(2);
    await page.locator('label.choice', { has: page.locator('input[value="homeowner"]') }).click();
    await page.fill('#f-name', 'Sam'); await page.fill('#f-email', 'sam@example.com');
    await page.locator('#step-1 [data-next]').click();
    await page.locator('[data-openings-add]').click();
    const third = page.locator('[data-op]').nth(2);
    await third.locator('[data-k="system"]').selectOption('windows');
    await expect(third.locator('[data-op-ref]')).toHaveText('W01');
    await third.locator('[data-k="width_mm"]').fill('1200');
    await third.locator('[data-k="height_mm"]').fill('140');
    await third.locator('[data-k="qty"]').fill('3');
    await page.fill('#f-loc', 'E17');
    await page.locator('#step-2 [data-next]').click();
    await expect(page.locator('[data-openings]')).toHaveClass(/has-error/);
    await third.locator('[data-k="height_mm"]').fill('1400');
    // The list survives a reload while the visitor is still filling in the form.
    await page.reload();
    await expect(page.locator('[data-op]')).toHaveCount(3);
    await page.locator('label.choice', { has: page.locator('input[value="homeowner"]') }).click();
    await page.fill('#f-name', 'Sam'); await page.fill('#f-email', 'sam@example.com');
    await page.locator('#step-1 [data-next]').click();
    await page.fill('#f-loc', 'E17');
    await page.locator('#step-2 [data-next]').click();
    await page.check('input[name="consent"]');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/thank-you\.html\?ref=BP-LIST$/);
    const json = sent[0].match(/name="openings"\r\n\r\n(.*)\r\n/)[1];
    const openings = JSON.parse(json);
    expect(openings.map((o) => [o.ref, o.system, o.width_mm, o.qty])).toEqual([['D01', 'lift-slide', 5600, 1], ['D02', 'bifold', 4200, 1], ['W01', 'windows', 1200, 3]]);
    expect(await page.evaluate(() => localStorage.getItem('bp-openings-list'))).toBeNull();
  });
});

test.describe('the list of openings is visible and nothing typed is lost', () => {
  test('adding opens the list panel, the counter follows the list across pages, edits stick', async ({ page }) => {
    await page.goto('/lift-and-slide-doors.html#sizing');
    const btn = page.locator(isMobileNav(page) ? '.site-header .list-btn' : '.list-fab');
    await expect(btn).toBeHidden();
    await page.locator('[data-tool-add]').click();
    const drawer = page.locator('.list-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-list-status]')).toHaveText('Added D01 to your list.');
    await expect(drawer.locator('.list-row')).toHaveCount(1);
    await expect(drawer.locator('.list-row-note')).toContainText('4 panels — centre opening');
    await drawer.locator('[data-k="qty"]').fill('3');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.locator('[data-tool-add]')).toBeFocused();
    await page.goto('/about.html');
    await expect(btn).toBeVisible();
    await expect(btn.locator('[data-list-count]')).toHaveText('1');
    await expect(btn).toHaveAttribute('aria-label', 'Your list: 1 opening');
    await btn.click();
    await expect(drawer.locator('[data-k="qty"]')).toHaveValue('3');
    await drawer.locator('[data-list-remove]').click();
    await expect(drawer.locator('.list-empty')).toBeVisible();
    await expect(drawer.locator('[data-list-send]')).toBeHidden();
    await drawer.locator('[data-list-close]').click();
    await expect(btn).toBeHidden();
  });

  test('a shared link brings the list to the quote form in another browser', async ({ page, browser }) => {
    await page.addInitScript(() => { navigator.clipboard.writeText = async (s) => { window.__copied = s; }; });
    await page.goto('/pl/bifold-doors.html#sizing');
    await page.fill('#t-w', '4200');
    await page.locator('[data-tool-add]').click();
    await page.locator('.list-drawer [data-k="qty"]').fill('2');
    await page.locator('[data-list-share]').click();
    let link = await page.evaluate(() => window.__copied || document.querySelector('.list-link')?.value);
    expect(link).toContain('/pl/contact.html?list=');
    link = link.replace(/^https?:\/\/[^/]+/, '');
    const other = await browser.newPage();
    await other.goto(link);
    await expect(other.locator('.list-drawer [data-list-status]')).toHaveText('Dodaliśmy z udostępnionej listy: 1 otwór.');
    await expect(other).toHaveURL(/\/pl\/contact\.html$/);
    await other.locator('[data-list-close]').click();
    await expect(other.locator('[data-op] [data-k="width_mm"]')).toHaveValue('4200');
    await expect(other.locator('[data-op] [data-k="qty"]')).toHaveValue('2');
    // Opening it again adds nothing twice.
    await other.goto(link);
    await expect(other.locator('.list-drawer')).toBeHidden();
    await expect(other.locator('[data-op]')).toHaveCount(1);
    await other.close();
  });

  test('a bad shared link adds nothing and breaks nothing', async ({ page }) => {
    await page.goto('/contact.html?list=not-a-list');
    await expect(page.locator('.list-drawer')).toBeHidden();
    await expect(page.locator('[data-op]')).toHaveCount(1);
  });

  test('the quote form keeps choices as well as text after a reload, but not consent', async ({ page }) => {
    await page.goto('/contact.html');
    await page.locator('label.choice', { has: page.locator('input[value="architect"]') }).click();
    await page.fill('#f-name', 'Sam');
    // Products (step 2) and consent (step 3) sit in steps that are still hidden: tick them as a click would.
    await page.evaluate(() => ['input[name="systems"][value="bifold"]', 'input[name="consent"]'].forEach((s) => {
      const el = document.querySelector(s); el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    await page.reload();
    await expect(page.locator('input[name="role"][value="architect"]')).toBeChecked();
    await expect(page.locator('input[name="systems"][value="bifold"]')).toBeChecked();
    await expect(page.locator('#f-name')).toHaveValue('Sam');
    await expect(page.locator('input[name="consent"]')).not.toBeChecked();
  });

  test('the material advisor remembers the last answers', async ({ page }) => {
    await page.goto('/materials.html#advisor');
    await page.locator('[data-advisor] label', { has: page.locator('input[name="why"][value="cost"]') }).click();
    const answer = await page.locator('[data-out-material]').textContent();
    await page.reload();
    await expect(page.locator('input[name="why"][value="cost"]')).toBeChecked();
    await expect(page.locator('[data-out-material]')).toHaveText(answer);
  });

  test('"Email me this list" sends the list code to the mail function', async ({ page }) => {
    await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://test.supabase.co'; export const SUPABASE_ANON_KEY = 'k';" }));
    let sent = null;
    await page.route('https://test.supabase.co/functions/v1/list-email', (r) => { sent = r.request().postDataJSON(); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto('/pl/lift-and-slide-doors.html#sizing');
    await page.locator('[data-tool-add]').click();
    const drawer = page.locator('.list-drawer');
    await drawer.locator('[data-list-mail-open]').click();
    await drawer.locator('#list-mail-email').fill('nie-adres');
    await drawer.locator('[data-list-mail] button[type=submit]').click();
    await expect(drawer.locator('[data-list-status]')).toHaveText('Sprawdź adres e-mail.');
    await drawer.locator('#list-mail-email').fill('jo@example.com');
    await drawer.locator('[data-list-mail] button[type=submit]').click();
    await expect(drawer.locator('[data-list-status]')).toContainText('Wysłane na jo@example.com');
    await expect(drawer.locator('[data-list-mail]')).toBeHidden();
    expect(sent.email).toBe('jo@example.com');
    expect(sent.lang).toBe('pl');
    expect(sent.list).toMatch(/^[\w-]+$/);
  });

  test('files picked in the quote form survive a reload, add up and can be removed', async ({ page }) => {
    await page.goto('/contact.html');
    const input = page.locator('#f-files');
    const file = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF ${name}`) });
    await input.setInputFiles([file('plan.pdf'), file('elevations.pdf')]);
    await input.setInputFiles([file('schedule.pdf')]);
    const items = page.locator('[data-file-list] li');
    await expect(items).toHaveCount(3);
    await page.reload();
    await expect(items).toHaveCount(3);
    await expect(items.first()).toContainText('plan.pdf');
    expect(await input.evaluate((el) => el.files.length)).toBe(3);
    await items.filter({ hasText: 'elevations.pdf' }).locator('[data-file-remove]').evaluate((b) => b.click());
    await expect(items).toHaveCount(2);
    await page.reload();
    await expect(items).toHaveCount(2);
    await expect(page.locator('[data-file-list]')).not.toContainText('elevations.pdf');
  });

  test('signed in, the list is kept on the account and follows removals from another device', async ({ page }) => {
    // Live mode against a stand-in for supabase-js: the "account" row lives in localStorage so it survives reloads.
    await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://test.supabase.co'; export const SUPABASE_ANON_KEY = 'k';" }));
    await page.addInitScript(() => {
      const A = { ref: 'D01', system: 'lift-slide', material: '', width_mm: 4000, height_mm: 2400, qty: 1, config: '4C', glazing: '3', note: 'From the phone' };
      const B = { ref: 'D01', system: 'bifold', material: '', width_mm: 3000, height_mm: 2200, qty: 1, config: '3L', glazing: '2', note: 'From this laptop' };
      if (!localStorage.getItem('__init')) {
        localStorage.setItem('__init', '1');
        localStorage.setItem('sb-test-auth-token', '{}');
        localStorage.setItem('__acct', JSON.stringify([A]));
        localStorage.setItem('bp-openings-list', JSON.stringify([B]));
      }
      const acct = () => JSON.parse(localStorage.getItem('__acct') || 'null');
      self.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: acct() && { items: acct() }, error: null }) }) }),
          upsert: async (row) => { localStorage.setItem('__acct', JSON.stringify(row.items)); return { error: null }; },
        }),
      }) };
    });
    const acct = () => page.evaluate(() => JSON.parse(localStorage.getItem('__acct')).map((o) => o.note));
    await page.goto('/about.html');
    const btn = page.locator(isMobileNav(page) ? '.site-header .list-btn' : '.list-fab');
    await expect(btn.locator('[data-list-count]')).toHaveText('2');
    await expect.poll(acct).toEqual(['From this laptop', 'From the phone']);
    await btn.click();
    const drawer = page.locator('.list-drawer');
    await expect(drawer.locator('.list-where')).toContainText('on your account');
    await expect(drawer.locator('.list-row', { hasText: 'From the phone' })).toContainText('D02');
    await drawer.locator('.list-row', { hasText: 'From this laptop' }).locator('[data-list-remove]').click();
    await expect.poll(acct).toEqual(['From the phone']);
    // Removed on another device: this browser has seen it on the account, so it goes here too instead of coming back.
    await page.evaluate(() => { localStorage.setItem('__acct', '[]'); sessionStorage.clear(); });
    await page.reload();
    await expect(btn).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('bp-openings-list'))).toBeNull();
  });
});

test.describe('full product range', () => {
  test('homepage explorer links every product family and highlights from the list', async ({ page }) => {
    await page.goto('/index.html');
    const hots = page.locator('.explorer .hot');
    await expect(hots).toHaveCount(5);
    for (const href of ['windows.html', 'doors.html', 'products.html#sliding', 'facades.html#lanterns', 'facades.html#curtain-walling']) {
      await expect(page.locator(`.explorer .hot[href="${href}"]`)).toHaveCount(1);
    }
    await page.locator('.explorer-list li[data-hot="2"]').hover();
    await expect(page.locator('.hot[data-hot="2"]')).toHaveClass(/is-hot/);
    await page.locator('.explorer-list a[href="windows.html"]').click();
    await expect(page).toHaveURL(/windows\.html$/);
    await expect(page.locator('#sash')).toBeVisible();
  });

  test('product matrix shows availability by material', async ({ page }) => {
    await page.goto('/products.html');
    const sash = page.locator('.matrix tr', { has: page.locator('a[href="windows.html#sash"]') });
    await expect(sash.locator('td').nth(0).locator('.no')).toHaveCount(1);
    await expect(sash.locator('td').nth(1).locator('.yes')).toHaveCount(1);
    await expect(page.locator('.matrix a[href="facades.html#rooflights"]')).toBeVisible();
  });

  test('material advisor changes its answer and hands off to the form', async ({ page }) => {
    await page.goto('/materials.html#advisor');
    const out = page.locator('[data-out-material]');
    await expect(out).toHaveText('Aluminium');
    await page.locator('label', { hasText: 'Listed building' }).click();
    await expect(out).toHaveText('Timber');
    await expect(page.locator('[data-out-why]')).toContainText('listed building consent');
    await page.locator('label', { hasText: 'Neither' }).click();
    await page.locator('label', { hasText: 'Lowest cost' }).click();
    await expect(out).toHaveText('PVC');
    await page.locator('[data-out-link]').click();
    await expect(page).toHaveURL(/contact\.html\?system=windows&material=pvc/);
    await expect(page.locator('input[name="systems"][value="windows"]')).toBeChecked();
    await expect(page.locator('input[name="material"][value="pvc"]')).toBeChecked();
  });
});

test('structured data parses and FAQ answers match what the page shows', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  for (const url of [...PAGES.map((p) => `/${p}.html`), ...PAGES.map((p) => `/pl/${p}.html`)]) {
    await page.goto(url);
    const blocks = await page.$$eval('script[type="application/ld+json"]', (ss) => ss.map((s) => s.textContent));
    const data = blocks.map((b) => JSON.parse(b));
    const faq = data.find((d) => d['@type'] === 'FAQPage');
    if (!faq) continue;
    const shown = await page.$$eval('.faq summary', (ss) => ss.map((s) => s.textContent.trim()));
    expect(faq.mainEntity.map((q) => q.name), url).toEqual(shown);
  }
});

test('technical detail is folded behind its heading and opens from links', async ({ page }) => {
  await page.goto('/lift-and-slide-doors.html');
  const tech = page.locator('#performance details.tech');
  await expect(page.locator('#performance > .container > h2')).toBeVisible();
  await expect(tech.locator('summary h2')).toHaveCount(0);
  await expect(tech).not.toHaveAttribute('open', '');
  await expect(page.locator('#performance table')).toBeHidden();
  // "Sizes and technical data" in the hero opens it.
  await page.locator('.hero-aside a[href="#performance"]').click();
  await expect(tech).toHaveAttribute('open', '');
  await expect(page.locator('#performance table')).toBeVisible();
  // A deep link opens the right section too.
  await page.goto('/pl/bifold-doors.html#downloads');
  await expect(page.locator('#downloads details.tech')).toHaveAttribute('open', '');
});
