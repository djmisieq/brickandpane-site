// Checks added after the UX/UI audit of October 2026: the things three reviewers found by eye.
// Each sets its own viewport, so they run once (desktop project) instead of three times.
import { test, expect } from './fixtures.js';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login', '404', 'thank-you',
  'windows', 'doors', 'facades', 'materials', 'heritage-conservation', 'guide-bifold-or-sliding', 'guide-replacing-windows',
];
const URLS = [...PAGES.map((p) => `/${p}.html`), ...PAGES.map((p) => `/pl/${p}.html`)];

test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'sets its own viewport, runs once'); });

test('content makes no promise the company has not confirmed', async ({ page }) => {
  // Confirmed services: survey of existing windows and measurement. No corner samples, nothing "free",
  // no budget "straight away", no "own team only" claims.
  // No prices at all (18.10.2026): every project is quoted individually, so no amounts, rates, ranges, discounts
  // or deadlines for a budget anywhere on the site. Relative cost (£ / ££ / £££) is a comparison, not a price.
  const PRICES = [/£\s?\d/, /£\/m²/, /±\s?\d/, /discount/i, /rabat/i, /zniżk/i, /promoc/i, /example rates/i, /stawki przykładowe/i,
    /budget within/i, /budżet w (ciągu )?\d/i, /budżet (wróci|przyślemy) w/i, /(quote|price) (arrives|follows) within/i, /wycena przyjdzie w/i, /price\s+within/i,
    /fixed (price|quot)/i, /included in (our|the) price/i, /w cenie/i, /stał\w* (cen|wycen)/i, /wiążąc\w* wycen/i];
  const BANNED = [...PRICES,/corner sample/i, /full-size (corner|sample)/i, /\bit'?s free\b/i, /, free\./i, /próbk\w* narożnik/i, /pełnowymiarow/i, /za darmo/i,
    /nic nie kosztuje/i, /straight away/i, /od razu zobaczysz/i, /our own (team|installers|london team)/i, /własn\w+ zesp/i, /podwykonawc/i, /subcontract/i,
    /project manager/i, /one (named )?person/i, /named person/i, /kierownik\w* projektu/i, /jedn\w* osob/i];
  for (const url of URLS) {
    await page.goto(url);
    const text = await page.evaluate(() => `${document.title} ${document.querySelector('meta[name=description]')?.content || ''} ${document.body.innerText}`);
    for (const re of BANNED) expect(text, `${url} contains ${re}`).not.toMatch(re);
  }
});

test('headings never skip a level and each folded section keeps its layout', async ({ page }) => {
  for (const url of URLS) {
    await page.goto(url);
    const { skips, empty } = await page.evaluate(() => {
      const levels = [...document.querySelectorAll('main :is(h1,h2,h3,h4)')].map((h) => +h.tagName[1]);
      const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
      // Moving the h2 into <summary> must not leave an empty grid cell behind.
      const empty = document.querySelectorAll('.section-head > :empty, details.tech > .section-head > div:empty').length;
      return { skips, empty };
    });
    expect(skips, `${url}: heading level skipped`).toBe(0);
    expect(empty, `${url}: empty section-head column`).toBe(0);
  }
});

test('at 320 px nothing overflows and the action bar leaves the end of the page visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const url of URLS) {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${url} scrolls sideways`).toBeLessThanOrEqual(0);
    const bar = page.locator('.action-bar');
    if (!(await bar.isVisible())) continue;
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const covered = await page.evaluate(() => {
      const top = document.querySelector('.action-bar').getBoundingClientRect().top;
      const last = [...document.querySelectorAll('.site-footer *')].filter((el) => el.children.length === 0 && el.getBoundingClientRect().height > 0).pop();
      return last.getBoundingClientRect().bottom - top;
    });
    expect(covered, `${url}: action bar covers the footer`).toBeLessThanOrEqual(0);
  }
});

test('the header fits on one line at 1100 px in both languages, and the tablet keeps a quote button', async ({ page }) => {
  for (const url of ['/index.html', '/pl/index.html', '/pl/lift-and-slide-doors.html']) {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const box = await page.evaluate(() => {
      const inner = document.querySelector('.header-inner').getBoundingClientRect();
      const items = [...document.querySelectorAll('.primary-nav > ul > li, .primary-nav > .lang-switch, .primary-nav > .nav-login, .primary-nav > .nav-cta')].map((el) => el.getBoundingClientRect());
      return { right: Math.max(...items.map((r) => r.right)) - inner.right, rows: new Set(items.map((r) => Math.round(r.top + r.height / 2))).size, height: document.querySelector('.site-header').offsetHeight };
    });
    expect(box.right, `${url}: header overflows`).toBeLessThanOrEqual(1);
    expect(box.rows, `${url}: header wraps`).toBe(1);
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.locator('.header-cta')).toBeVisible();
  }
});

test('five steps or five options never leave one alone on a row', async ({ page }) => {
  for (const width of [900, 1000, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ['/about.html', '/developers.html', '/homeowners.html', '/materials.html', '/contact.html']) {
      await page.goto(url);
      const lonely = await page.evaluate(() => [...document.querySelectorAll('.process, .choice-grid')].filter((g) => {
        const kids = [...g.children].filter((c) => c.getBoundingClientRect().height > 0);
        if (kids.length < 3) return false;
        const rows = new Map();
        kids.forEach((k) => { const top = Math.round(k.getBoundingClientRect().top); rows.set(top, (rows.get(top) || 0) + 1); });
        const counts = [...rows.values()];
        return counts.length > 1 && Math.max(...counts) > 1 && counts[counts.length - 1] === 1;
      }).length);
      expect(lonely, `${url} at ${width}px`).toBe(0);
    }
  }
});

test('one route to a quote: the action bar and page buttons go to the form, not to sign-up', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 });
  for (const url of URLS) {
    await page.goto(url);
    expect(await page.locator('a[href*="signup=homeowner"]').count(), `${url} links to sign-up as a price route`).toBe(0);
    const bar = page.locator('.action-bar');
    if (await bar.isVisible()) await expect(bar.locator('a.btn:not(.btn-ghost)')).toHaveAttribute('href', 'contact.html');
  }
});

test('mobile menu keeps keyboard focus inside while open', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto('/pl/index.html');
  await page.locator('.menu-toggle').click();
  await expect(page.locator('#primary-nav a, #primary-nav button').first()).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(true);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#primary-nav, .site-header'))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(false);
});

test('aria-current="page" only marks the page you are on', async ({ page }) => {
  await page.goto('/guide-bifold-or-sliding.html');
  expect(await page.locator('.primary-nav [aria-current="page"]').count()).toBe(0);
  await expect(page.locator('.primary-nav [data-nav="guide"]')).toHaveAttribute('aria-current', 'true');
  await page.goto('/about.html');
  await expect(page.locator('.primary-nav [data-nav="about"]')).toHaveAttribute('aria-current', 'page');
});

test('language switch keeps the query, and portal pages keep the switch', async ({ page }) => {
  await page.goto('/contact.html?role=architect&topic=samples');
  await expect(page.locator('.lang-switch a[hreflang="pl"]')).toHaveAttribute('href', /pl\/contact\.html\?role=architect&topic=samples$/);
  await page.goto('/login.html');
  await page.locator('[data-demo-login="homeowner"]').click();
  await expect(page.locator('.lang-switch')).toBeVisible();
});

test('quote form: Enter moves to the next step, sends the language, and the thank-you page shows the reference', async ({ page }) => {
  const sent = [];
  await page.route('**/functions/v1/contact-submit', (route) => {
    sent.push(route.request().postData() || '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ref":"BP-TEST-1","rejected":["big.dwg"]}' });
  });
  await page.goto('/pl/contact.html?role=homeowner');
  await page.fill('#f-name', 'Jan Kowalski');
  await page.fill('#f-email', 'jan@example.com');
  await page.locator('#f-email').press('Enter');
  await expect(page.locator('#step-2')).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.fill('#f-loc', 'SE22');
  await page.locator('#f-loc').press('Enter');
  await expect(page.locator('#step-3')).toBeVisible();
  await page.locator('#step-3 button[type=submit]').click();
  await expect(page.locator('#step-3 .field.has-error input[name=consent]')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('input[name=consent]').check();
  await page.locator('#step-3 button[type=submit]').click();
  await expect(page).toHaveURL(/thank-you\.html\?ref=BP-TEST-1/);
  expect(sent[0]).toContain('name="lang"\r\n\r\npl');
  await expect(page.locator('[data-ref-value]')).toHaveText('BP-TEST-1');
  await expect(page.locator('[data-rejected-list]')).toHaveText('big.dwg');
  await page.locator('[data-portal-signup]').click();
  await expect(page.locator('#su-email')).toHaveValue('jan@example.com');
});

test('login never puts the password in the address, even before the script runs', async ({ page }) => {
  await page.route('**/js/portal/login.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/login.html');
  await page.fill('#si-email', 'a@b.co');
  await page.fill('#si-pw', 'secret-password');
  await page.locator('#si-pw').press('Enter');
  await page.waitForLoadState();
  expect(page.url()).not.toContain('secret-password');
});

test('a homeowner sees the enquiries sent through the website form in the portal', async ({ page }) => {
  await page.goto('/pl/login.html');
  await page.locator('[data-demo-login="homeowner"]').click();
  await expect(page.locator('.list-h', { hasText: 'Twoje zapytania' })).toBeVisible();
  await expect(page.locator('.pcard', { hasText: 'BP-261013-7A3C' })).toContainText('Odpowiedzieliśmy mailem');
});

test('right-hand columns line up: content starts at grid column 7 or 9, never in between', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let seen = 0;
  for (const url of URLS) {
    await page.goto(url);
    const starts = await page.evaluate(() => {
      const out = [];
      for (const grid of document.querySelectorAll('main .grid-12, main .section-head, main .system, main .cta-band .container, main .hero .container')) {
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        if (cols !== 12) continue;
        const left = grid.getBoundingClientRect().left;
        const step = (grid.clientWidth + parseFloat(getComputedStyle(grid).columnGap)) / 12;
        for (const el of grid.children) {
          const x = el.getBoundingClientRect().left - left;
          if (x > step / 2 && el.offsetWidth) out.push(Math.round(x / step) + 1);
        }
      }
      return out;
    });
    seen += starts.length;
    for (const s of starts) expect([7, 9], `${url} right column starts at ${s}`).toContain(s);
  }
  expect(seen).toBeGreaterThan(40);
});

test('page markup keeps spacing on the scale: no inline margins or paddings', async ({ page }) => {
  for (const url of URLS) {
    await page.goto(url);
    const inline = await page.evaluate(() => [...document.querySelectorAll('main [style]')]
      .map((el) => el.getAttribute('style')).filter((s) => /(margin|padding)(-top|-bottom)?\s*:/.test(s)));
    expect(inline, url).toEqual([]);
  }
});
