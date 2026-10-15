// Layout and consistency checks for every public page, English and Polish, on desktop, tablet and phone.
// They catch what the eye catches: content cut off or hidden in a sideways scroller, squeezed captions,
// tiny text and tap targets, the action bar covering content, and phones losing what the desktop shows.
import { test, expect } from './fixtures.js';

const PAGES = [
  'index', 'homeowners', 'lift-and-slide-doors', 'sliding-doors', 'bifold-doors', 'products', 'architects', 'developers',
  'guide-large-sliding-doors-london', 'projects', 'about', 'contact', 'privacy', 'login', '404', 'thank-you',
  'windows', 'doors', 'facades', 'materials', 'heritage-conservation', 'guide-bifold-or-sliding', 'guide-replacing-windows',
];
const URLS = [...PAGES.map((p) => `/${p}.html`), ...PAGES.map((p) => `/pl/${p}.html`)];
// The only places where sideways scrolling is the intended design.
const SCROLLERS_ALLOWED = ['.tabs', '.section-nav ul'];
const isPhone = (page) => page.viewportSize().width < 768;
const isTouch = (page) => page.viewportSize().width < 1100;

const open = async (page, url) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
};

for (const url of URLS) {
  test.describe(url, () => {
    test('nothing is cut off or hidden in a sideways scroller', async ({ page }) => {
      await open(page, url);
      const problems = await page.evaluate((allowed) => {
        const out = [];
        const vw = document.documentElement.clientWidth;
        // 1 px boxes are visually-hidden helpers (e.g. a table head kept for screen readers).
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
        const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
        for (const el of document.querySelectorAll('main *, footer *')) {
          if (!visible(el) || el.closest('.visually-hidden, [aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          // Sideways scrollers hide part of their content on small screens.
          if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && !allowed.some((s) => el.matches(s)))
            out.push(`scrolls sideways: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
          // Clipped text: hidden overflow with more content than room, unless it is a deliberate ellipsis.
          if (/(hidden|clip)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim() && !el.matches('.photo-slot'))
            out.push(`clips text: ${name(el)}`);
          // Anything sticking out of the viewport, unless it lives inside an allowed scroller.
          const r = el.getBoundingClientRect();
          if ((r.right > vw + 1 || r.left < -1) && !el.closest(allowed.join(',')) && !el.closest('.visually-hidden'))
            out.push(`outside the screen: ${name(el)} (${Math.round(r.left)}–${Math.round(r.right)} of ${vw})`);
        }
        return [...new Set(out)].slice(0, 15);
      }, SCROLLERS_ALLOWED);
      expect(problems).toEqual([]);
    });

    test('table captions use the full width of their table', async ({ page }) => {
      await open(page, url);
      const narrow = await page.$$eval('table caption', (cs) => cs
        .filter((c) => c.getBoundingClientRect().height > 0)
        .filter((c) => c.getBoundingClientRect().width < c.closest('table').parentElement.getBoundingClientRect().width * 0.6)
        .map((c) => c.textContent.trim().slice(0, 40)));
      expect(narrow).toEqual([]);
    });

    test('text is readable and tap targets are big enough', async ({ page }) => {
      await open(page, url);
      const { tiny, small } = await page.evaluate((touch) => {
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const tiny = new Set();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!n.textContent.trim() || !el || !visible(el) || el.closest('svg, .visually-hidden, .skip')) continue;
          if (parseFloat(getComputedStyle(el).fontSize) < 11.5) tiny.add(`${el.tagName.toLowerCase()}.${el.className}: “${n.textContent.trim().slice(0, 30)}”`);
        }
        // Buttons and form controls get 44 px on touch screens; standalone links at least 24 px (WCAG 2.5.8).
        const small = [];
        if (touch) {
          for (const el of document.querySelectorAll('.btn, button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), summary, a.link-arrow, .site-footer a, .primary-nav a, .lang-switch a, .breadcrumb a')) {
            if (!visible(el) || el.closest('.choice')) continue;
            // Links inside a sentence are exempt (WCAG 2.5.8 inline exception).
            if (el.matches('a') && el.parentElement.textContent.trim() !== el.textContent.trim()) continue;
            const r = el.getBoundingClientRect();
            const min = el.matches('.btn, button, select, input, summary') ? 44 : 24;
            if (r.height < min - 0.5) small.push(`${el.tagName.toLowerCase()}.${el.className} “${el.textContent.trim().slice(0, 25)}” ${Math.round(r.height)}px < ${min}px`);
          }
        }
        return { tiny: [...tiny].slice(0, 10), small: small.slice(0, 10) };
      }, isTouch(page));
      expect(tiny, 'text under 11.5 px').toEqual([]);
      expect(small, 'tap targets').toEqual([]);
    });

    test('card grids never leave one card alone on the last row', async ({ page }) => {
      await open(page, url);
      const lone = await page.$$eval('.ptiles, .features, .configs, .roles', (grids) => grids.map((g) => {
        const tops = [...g.children].filter((c) => c.getBoundingClientRect().height > 0).map((c) => Math.round(c.getBoundingClientRect().top));
        const rows = tops.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
        const counts = [...rows.values()];
        return counts.length > 1 && counts[0] > 1 && counts[counts.length - 1] === 1 ? `${g.className}: ${counts.join('+')}` : null;
      }).filter(Boolean));
      expect(lone).toEqual([]);
    });

    test('the phone shows every section the desktop shows', async ({ page }) => {
      test.skip(!isPhone(page), 'phone only');
      const headings = () => page.$$eval('main :is(h1,h2,h3)', (hs) => hs
        .filter((h) => h.getBoundingClientRect().height > 0 && !h.closest('[hidden], details:not([open]) > :not(summary)'))
        .map((h) => h.textContent.replace(/\s+/g, ' ').trim()));
      await open(page, url);
      const phone = await headings();
      const size = page.viewportSize();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload();
      const desktop = await headings();
      await page.setViewportSize(size);
      expect(phone).toEqual(desktop);
    });

    test('the action bar never covers the end of the page', async ({ page }) => {
      test.skip(!isPhone(page), 'phone only');
      await open(page, url);
      const bar = page.locator('.action-bar');
      if (!(await bar.isVisible())) return;
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const covered = await page.evaluate(() => {
        const top = document.querySelector('.action-bar').getBoundingClientRect().top;
        const last = [...document.querySelectorAll('.site-footer *, main *')].filter((el) => el.children.length === 0 && el.getBoundingClientRect().height > 0).pop();
        return last ? last.getBoundingClientRect().bottom - top : 0;
      });
      expect(covered).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('phone layout keeps the desktop structure', () => {
  test.skip(({ viewport }) => viewport.width >= 768, 'phone only');

  test('mobile menu offers every link the desktop header has', async ({ page }) => {
    await open(page, '/index.html');
    const hrefs = await page.$$eval('#primary-nav a', (as) => as.map((a) => a.getAttribute('href')));
    await page.locator('.menu-toggle').click();
    await page.locator('.sub-toggle').click();
    const reachable = await page.$$eval('#primary-nav a', (as) => as.filter((a) => a.getBoundingClientRect().height > 0).map((a) => a.getAttribute('href')));
    expect(reachable.sort()).toEqual(hrefs.sort());
  });

  test('product tiles are compact: at least two fit on one screen', async ({ page }) => {
    for (const url of ['/index.html', '/products.html', '/pl/index.html']) {
      await open(page, url);
      const tiles = page.locator('.ptile');
      if (!(await tiles.count())) continue;
      const vh = page.viewportSize().height;
      for (const box of await tiles.evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect().height)))
        expect(box, url).toBeLessThanOrEqual(vh / 2);
    }
  });

  test('product matrix shows three material columns per row', async ({ page }) => {
    await open(page, '/products.html');
    const row = page.locator('.matrix tbody tr:not(.grp)').first();
    const cells = await row.locator('td').evaluateAll((tds) => tds.map((td) => Math.round(td.getBoundingClientRect().top)));
    expect(new Set(cells).size).toBe(1);
  });

  test('comparison tables stack into full-width cards', async ({ page }) => {
    for (const url of ['/lift-and-slide-doors.html', '/sliding-doors.html', '/bifold-doors.html', '/windows.html']) {
      await open(page, url);
      const tables = page.locator('main table.has-labels');
      for (let i = 0; i < await tables.count(); i++) {
        const w = await tables.nth(i).evaluate((t) => [t.getBoundingClientRect().width, t.parentElement.clientWidth]);
        expect(w[0], `${url} table ${i}`).toBeLessThanOrEqual(w[1] + 1);
      }
    }
  });
  test('long product pages have a section bar that jumps and follows the scroll', async ({ page }) => {
    for (const url of ['/lift-and-slide-doors.html', '/pl/windows.html']) {
      await open(page, url);
      const bar = page.locator('.section-nav');
      await expect(bar).toBeVisible();
      const link = bar.locator('a').nth(2);
      const id = (await link.getAttribute('href')).slice(1);
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'true');
      // The section heading lands below the header and the bar, not under them.
      const [barBottom, top] = await page.evaluate((i) => [document.querySelector('.section-nav').getBoundingClientRect().bottom, document.getElementById(i).getBoundingClientRect().top], id);
      expect(top, url).toBeGreaterThanOrEqual(barBottom - 1);
      await page.evaluate(() => scrollTo(0, 0));
      await page.mouse.wheel(0, 200);
      await expect(bar, url).toHaveCSS('position', 'sticky');
    }
  });

  test('the sizing tool keeps its key figures in view while you type', async ({ page }) => {
    await open(page, '/lift-and-slide-doors.html#sizing');
    const peek = page.locator('.tool-peek');
    await expect(peek).toBeVisible();
    await expect(peek.locator('[data-peek="weight"]')).toHaveText('140 kg');
    await page.fill('#t-w', '9000');
    await page.selectOption('#t-c', '2A');
    await expect(peek).toHaveAttribute('data-state', 'stop');
    await page.locator('#t-h').focus();
    const [peekBox, vh] = [await peek.boundingBox(), page.viewportSize().height];
    expect(peekBox.y + peekBox.height).toBeLessThanOrEqual(vh + 1);
  });


  test('the main call to action is above the fold', async ({ page }) => {
    for (const url of ['/index.html', '/homeowners.html', '/windows.html', '/lift-and-slide-doors.html', '/pl/index.html']) {
      await open(page, url);
      const btn = page.locator('main .btn').first();
      const box = await btn.boundingBox();
      const barH = await page.locator('.action-bar').evaluate((b) => (getComputedStyle(b).display === 'none' ? 0 : b.offsetHeight));
      expect(box.y + box.height, url).toBeLessThanOrEqual(page.viewportSize().height - barH);
    }
  });
});
