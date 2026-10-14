# Brick & Pane — website

Static site published with GitHub Pages at brickandpane.co.uk.

- Edit pages in `src/pages/` (English) and `src/pl/pages/` (Polish), shared parts in `src/partials/` and `src/pl/partials/`.
- Build: `node build.mjs` (writes the root `*.html` and `pl/*.html`).
- Test: `npm test` (build, database policy tests, Playwright).
- Internal audit, strategy and deployment notes live in the private repo `djmisieq/brickandpane-docs`, not here.

## Photos

Product tiles and system figures use `<figure class="photo-slot">` with a line drawing until real photographs exist.
To use a photo, add an image inside the figure (the photo covers the drawing):

```html
<figure class="photo-slot"><svg …></svg><img src="img/windows-sash.jpg" alt="Timber sash windows on a Victorian terrace" width="1200" height="900" loading="lazy"></figure>
```

Use only photos you own or that your system supplier licenses to you. Edit both the English and the Polish page, then run `node build.mjs`.
