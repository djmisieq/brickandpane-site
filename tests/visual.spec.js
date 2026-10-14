// Visual baselines for the key pages on desktop, tablet and phone. Tagged @visual: baselines are per OS,
// so CI (Linux) skips them. Refresh after an intended design change: npx playwright test --grep @visual --update-snapshots
import { test, expect } from '@playwright/test';

const PAGES = ['index', 'products', 'lift-and-slide-doors', 'windows', 'contact', 'pl/bifold-doors'];

for (const name of PAGES) {
  test(`${name} looks as approved @visual`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    // The fixed bar would be painted once per screen in a full-page shot; the year changes every January.
    await page.addStyleTag({ content: '.action-bar{display:none!important}' });
    await page.evaluate(() => document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = '2026'; }));
    await expect(page).toHaveScreenshot(`${name.replace('/', '-')}.png`, { fullPage: true, scale: 'css', maxDiffPixelRatio: 0.01, animations: 'disabled' });
  });
}
