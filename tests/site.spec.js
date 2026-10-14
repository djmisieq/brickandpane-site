// End-to-end tests for the public site. Run with `npm test`.
import { test, expect } from '@playwright/test';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login', '404',
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
    await expect(page.locator('#sub-doors')).toBeHidden();
    await sub.click();
    await expect(sub).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#sub-doors a[href="bifold-doors.html"]')).toBeVisible();

    // Escape closes and returns focus to the toggle.
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();

    // A link navigates.
    await toggle.click();
    await page.locator('#primary-nav a[href="architects.html"]').click();
    await expect(page).toHaveURL(/architects\.html$/);
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
    await expect(page.locator('#sub-doors a[aria-current="page"]')).toHaveAttribute('href', 'bifold-doors.html');
  });

  test('desktop dropdown opens, closes on Escape and outside click', async ({ page }) => {
    test.skip(isMobileNav(page), 'desktop only');
    await page.goto('/index.html');
    const sub = page.locator('.sub-toggle');
    const panel = page.locator('#sub-doors');
    await expect(panel).toBeHidden();
    await sub.click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('a')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(sub).toBeFocused();
    await sub.click();
    await page.locator('h1').click();
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
    await expect(page.locator('#f-msg')).toHaveValue(/Lift & slide opening approx\. 9000 × 2700 mm, 2 panels/);
    await expect(page.locator('input[name="systems"][value="lift-slide"]')).toBeChecked();
  });

  test('slim sliding: recommends lift & slide when too heavy', async ({ page }) => {
    await page.goto('/sliding-doors.html#sizing');
    await expect(page.locator('[data-messages]')).toContainText('inside the 250 kg inline hardware range');
    await page.fill('#t-w', '6000'); await page.fill('#t-h', '3000');
    await page.selectOption('#t-c', '2A'); await page.selectOption('#t-g', 't');
    await expect(page.locator('[data-messages]')).toContainText('consider lift & slide');
    await page.locator('[data-tool-quote]').click();
    await expect(page.locator('#f-msg')).toHaveValue(/Slim sliding opening/);
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

test.describe('budget estimates', () => {
  test('hidden on public tools until the price list is live', async ({ page }) => {
    await page.goto('/lift-and-slide-doors.html#sizing');
    await expect(page.locator('[data-estimate]')).toContainText('Save this opening to your portal');
    await expect(page.locator('[data-estimate]')).not.toContainText('£');
  });
  test('preview mode shows a labelled example estimate', async ({ page }) => {
    await page.goto('/bifold-doors.html?preview=pricing#sizing');
    await expect(page.locator('[data-estimate]')).toContainText(/£[\d,]+–£[\d,]+ \+ VAT/);
    await expect(page.locator('[data-estimate]')).toContainText('Example rates');
  });
});

test.describe('homeowner & mobile details', () => {
  test('contact form adapts to a homeowner and carries opening sizes', async ({ page }) => {
    await page.goto('/contact.html?role=homeowner&system=bifold&w=4800&h=2400');
    await expect(page.locator('[data-preview-note]')).toBeVisible();
    await page.fill('#f-name', 'Sam'); await page.fill('#f-email', 'sam@example.com');
    await page.locator('#step-1 [data-next]').click();
    await expect(page.locator('#f-ow')).toHaveValue('4800');
    await expect(page.locator('#f-oh')).toHaveValue('2400');
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
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('[data-form-status]')).toContainText('Preview mode');
    await page.locator('#step-3 [data-prev]').click();
    await page.locator('#step-2 [data-prev]').click();
    await expect(page.locator('#f-name')).toHaveValue('Anna Clarke');
  });
});
