# Brick & Pane — website

Static site published with GitHub Pages at brickandpane.co.uk.

- Edit pages in `src/pages/` (English) and `src/pl/pages/` (Polish), shared parts in `src/partials/` and `src/pl/partials/`.
- Build: `node build.mjs` (writes the root `*.html` and `pl/*.html`).
- Test: `npm test` (build, database policy tests, Playwright on desktop, tablet and phone). Playwright serves the site with `tests/serve.mjs`, so only Node is needed.
  - `tests/layout.spec.js`: nothing cut off, readable text, tap targets, phone shows what desktop shows.
  - `tests/a11y.spec.js`: axe WCAG 2.2 AA on every page, plus a page-weight budget.
  - `tests/visual.spec.js` (`npm run test:visual`): full-page screenshots. Baselines are per machine and not committed: run `npx playwright test --grep @visual --update-snapshots` before a design change, then `npm run test:visual` after it.
  - GitHub Actions runs everything except the visual baselines on each push and pull request.
- Captcha: the public Cloudflare Turnstile site key is the `TURNSTILE` constant in `build.mjs` (empty = no captcha). With a key, `node build.mjs` adds the Turnstile script to `contact.html` and `login.html` (EN and PL) and `js/captcha.js` sends a token to `contact-submit` and Supabase Auth. Tests stub Cloudflare (`tests/fixtures.js`). The secret key never goes in this repo: it lives in the Supabase secret `TURNSTILE_SECRET` and in Supabase Auth → Attack Protection.
- Internal audit, strategy and deployment notes live in the private repo `djmisieq/brickandpane-docs`, not here.

## Photos

Product tiles and system figures use `<figure class="photo-slot">` with a line drawing until real photographs exist.
To use a photo, add an image inside the figure (the photo covers the drawing):

```html
<figure class="photo-slot"><svg …></svg><img src="img/windows-sash.jpg" alt="Timber sash windows on a Victorian terrace" width="1200" height="900" loading="lazy"></figure>
```

Use only photos you own or that your system supplier licenses to you. Edit both the English and the Polish page, then run `node build.mjs`.
