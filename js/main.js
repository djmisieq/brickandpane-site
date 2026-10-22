/* Brick & Pane — site behaviour. No dependencies. */
import { readList, writeList, addToList, clearList, nextRef } from './openings-list.js';

(() => {
  const PL = document.documentElement.lang === 'pl';
  const t = (en, pl) => (PL ? pl : en);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- header & navigation ---------- */
  const header = $('.site-header');
  const nav = $('#primary-nav');
  const toggle = $('.menu-toggle');

  const navTop = () => nav?.style.setProperty('--nav-top', `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
  const setMenu = (open) => {
    if (!nav || !toggle) return;
    if (open) {
      navTop();
      $$('.has-sub[data-current] .sub-toggle', nav).forEach((b) => b.setAttribute('aria-expanded', 'true'));
    }
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    $('.menu-toggle-label', toggle).textContent = open ? t('Close', 'Zamknij') : 'Menu';
    document.body.classList.toggle('nav-open', open);
    // The open menu covers the page: keep keyboard focus inside it, starting at the first item.
    $$('main, .site-footer, .action-bar, .header-cta').forEach((el) => { el.inert = open; });
    if (open) $('a, button', nav)?.focus();
  };
  addEventListener('resize', () => { if (nav?.classList.contains('is-open')) navTop(); });
  toggle?.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  nav?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav?.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
  });
  matchMedia('(min-width:1100px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // Dropdowns (desktop: floating panel; mobile: accordion inside the menu)
  const subs = $$('.sub-toggle');
  const closeSubs = (except) => subs.forEach((b) => { if (b !== except) b.setAttribute('aria-expanded', 'false'); });
  subs.forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = b.getAttribute('aria-expanded') !== 'true';
    closeSubs(b); b.setAttribute('aria-expanded', String(open));
  }));
  document.addEventListener('click', (e) => { if (!e.target.closest('.has-sub') && matchMedia('(min-width:1100px)').matches) closeSubs(); });
  $$('.has-sub').forEach((li) => li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget) && matchMedia('(min-width:1100px)').matches) closeSubs(); }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = subs.find((b) => b.getAttribute('aria-expanded') === 'true');
    if (open && matchMedia('(min-width:1100px)').matches) { closeSubs(); open.focus(); }
  });

  // House explorer: hovering a list item lights up its opening in the drawing, and the other way round.
  $$('[data-explorer]').forEach((ex) => {
    const set = (n) => $$('[data-hot]', ex).forEach((el) => el.classList.toggle('is-hot', el.dataset.hot === n));
    $$('[data-hot]', ex).forEach((el) => {
      el.addEventListener('mouseenter', () => set(el.dataset.hot));
      el.addEventListener('focusin', () => set(el.dataset.hot));
      el.addEventListener('mouseleave', () => set(null));
      el.addEventListener('focusout', () => set(null));
    });
  });

  // Small screens: matrix tables become stacked cards, so give each cell its column name.
  const labelTables = (root = document) => {
    $$('table', root).forEach((t) => {
      const heads = $$('thead th', t).map((th) => th.textContent.trim());
      if (!heads.length) return;
      $$('tbody tr', t).forEach((tr) => [...tr.children].forEach((cell, i) => { if (!cell.dataset.label && heads[i] && cell.colSpan === 1) cell.dataset.label = heads[i]; }));
      // The product matrix stacks its own way on phones; the generic card layout would repeat its row heading.
      if (!t.classList.contains('matrix')) t.classList.add('has-labels');
    });
  };
  labelTables();
  let lt = null;
  new MutationObserver(() => { clearTimeout(lt); lt = setTimeout(() => labelTables(), 60); }).observe(document.body, { childList: true, subtree: true });

  // Hide the sticky mobile action bar while typing so it never covers a field.
  document.addEventListener('focusin', (e) => { if (e.target.matches('input, select, textarea')) document.body.classList.add('is-typing'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.('input, select, textarea')) document.body.classList.remove('is-typing'); }, 50));

  $$('.lang-switch a').forEach((a) => { if (!a.hasAttribute('aria-current')) a.href = a.href.split(/[?#]/)[0] + location.search + location.hash; });

  // The sticky action bar can wrap to two lines on narrow phones: pad the page by its real height.
  const actionBar = $('.action-bar');
  const barHeight = () => { if (actionBar?.offsetHeight) document.documentElement.style.setProperty('--action-bar-h', `${actionBar.offsetHeight}px`); };
  barHeight(); addEventListener('resize', barHeight);

  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- folded technical sections: open when a link or the address points into them ---------- */
  const openTech = (hash) => {
    const el = hash && hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1)));
    const d = el && (el.querySelector(':scope > .container > details.tech') || el.closest('details.tech'));
    if (d && !d.open) d.open = true;
  };
  openTech(location.hash);
  addEventListener('hashchange', () => openTech(location.hash));
  document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a) openTech(a.getAttribute('href')); });

  /* ---------- on-page section nav ---------- */
  const secNav = $('.section-nav');
  if (secNav && 'IntersectionObserver' in window) {
    const links = $$('a', secNav);
    const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
    const visible = new Set();
    const mark = () => {
      const current = [...byId.keys()].find((id) => visible.has(id));
      links.forEach((a) => a.toggleAttribute('aria-current', false));
      const a = byId.get(current);
      if (!a) return;
      a.setAttribute('aria-current', 'true');
      const ul = a.parentElement.parentElement;
      ul.scrollTo({ left: a.offsetLeft - ul.clientWidth / 2 + a.offsetWidth / 2, behavior: 'smooth' });
    };
    const so = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target.id) : visible.delete(en.target.id)));
      mark();
    }, { rootMargin: '-35% 0px -60% 0px' });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) so.observe(el); });
  }

  /* ---------- sizing tools (lift & slide, slim sliding, bi-fold) ---------- */
  // Indicative envelopes for each system class. Update from the certified system data sheets.
  const GLASS = { // total glass thickness in mm; glass weighs ~2.5 kg per m² per mm
    d: { t: 12, label: 'Double, 6 / 20 / 6 toughened' },
    dl: { t: 14.8, label: 'Double, 8.8 laminated / 18 / 6 toughened' },
    t: { t: 16, label: 'Triple, 6 / 14 / 4 / 14 / 6' },
    tl: { t: 18.8, label: 'Triple, 8.8 laminated / 14 / 4 / 14 / 6' },
  };
  // dirs: sliding panels and the direction they open (-1 left, 1 right).
  const SLIDERS = {
    'lift-slide': {
      limits: { panelKg: 400, heavyKg: 300, sashH: 3200, sashHMax: 3500, sashW: 3300, sashWMin: 700, handKg: 150, liftKg: 250 },
      okText: t('Panel weight is inside the standard 300 kg hardware class (heavy-duty goes to 400 kg).', 'Waga skrzydła mieści się w standardowej klasie okuć 300 kg (wzmocnione do 400 kg).'),
      heavyText: t('Heavy-duty roller carriages needed (300–400 kg class). Fine for the system, but it affects the track and the floor detail.', 'Potrzebne wzmocnione wózki jezdne (klasa 300–400 kg). System to obsłuży, ale ma to wpływ na tor i detal posadzki.'),
      configs: {
        '2A': { panels: 2, dirs: { 1: -1 }, open: 1 / 2, label: '2 panels — 1 sliding, 1 fixed' },
        '3T': { panels: 3, dirs: { 1: -1, 2: -1 }, open: 2 / 3, label: '3 panels on 3 tracks — 2 sliding' },
        '4C': { panels: 4, dirs: { 1: -1, 2: 1 }, open: 1 / 2, label: '4 panels — centre opening' },
        '6C': { panels: 6, dirs: { 1: -1, 2: -1, 3: 1, 4: 1 }, open: 2 / 3, label: '6 panels on 3 tracks — centre opening' },
      },
    },
    sliding: {
      limits: { panelKg: 250, heavyKg: 200, sashH: 3000, sashHMax: 3200, sashW: 2800, sashWMin: 600, handKg: 150, liftKg: 220 },
      okText: t('Panel weight is well inside the 250 kg inline hardware range.', 'Waga skrzydła mieści się z zapasem w zakresie okuć 250 kg.'),
      heavyText: t('Upper end of the 250 kg inline hardware range (over 200 kg). If panels grow, lift & slide hardware is the safer choice.', 'Górna granica zakresu okuć 250 kg (ponad 200 kg). Jeśli skrzydła urosną, bezpieczniejsze będą okucia podnoszono-przesuwne.'),
      configs: {
        '2A': { panels: 2, dirs: { 1: -1 }, open: 1 / 2, label: '2 panels — 1 sliding, 1 fixed' },
        '2B': { panels: 2, dirs: { 0: 1, 1: -1 }, open: 1 / 2, label: '2 panels — both sliding' },
        '3T': { panels: 3, dirs: { 1: -1, 2: -1 }, open: 2 / 3, label: '3 panels on 3 tracks — 2 sliding' },
        '4C': { panels: 4, dirs: { 1: -1, 2: 1 }, open: 1 / 2, label: '4 panels — centre opening' },
      },
    },
  };
  const BIFOLD = { leafKg: 100, warnKg: 80, leafW: 1200, leafWMin: 500, leafH: 2600, leafHMax: 3000, frame: 60, stackPerLeaf: 70 };
  const FRAME = 70, OVERLAP = 70, SASH_PROFILE = 140, HEAD_SILL = 150;
  const fmt = (n, d = 0) => n.toLocaleString(PL ? 'pl-PL' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const partL = (totalM2, area) => {
    if (!(area > 0)) return null;
    const pct = (totalM2 / area) * 100;
    return [pct > 25 ? 'warn' : 'ok', pct > 25
      ? t(`Lots of glass: this door is ${fmt(pct)}% of the extension floor area. That's allowed. Above about 25%, Building Regulations (Part L) just ask for an energy calculation called SAP instead of the simple check. An energy assessor or your architect does it routinely, and we supply the figures. Tell them early.`,
          `Dużo szkła: te drzwi to ${fmt(pct)}% powierzchni dobudowy. To dozwolone. Powyżej ok. 25% brytyjskie przepisy (część L) wymagają po prostu obliczeń energetycznych SAP zamiast prostego sprawdzenia. Rutynowo robi je audytor energetyczny lub architekt, a my dostarczamy dane. Powiedz im o tym wcześnie.`)
      : t(`This door is ${fmt(pct)}% of the extension floor area, inside the simple 25% allowance in Building Regulations. Remember to count rooflights and other windows too.`,
          `Te drzwi to ${fmt(pct)}% powierzchni dobudowy, w granicach prostej reguły 25% z przepisów. Pamiętaj, żeby doliczyć świetliki i inne okna.`)];
  };

  const drawSlider = (svg, cfg, W, H) => {
    const vbW = 600, pad = 20;
    const s = Math.min((vbW - pad * 2) / W, 260 / H);
    const w = W * s, x0 = (vbW - w) / 2, y0 = pad, h = H * s;
    const pw = w / cfg.panels;
    let g = `<rect class="ln2" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`;
    for (let i = 0; i < cfg.panels; i++) {
      const x = x0 + i * pw, dir = cfg.dirs[i];
      g += `<rect class="${dir ? 'acc' : 'ln'}" x="${x + 4}" y="${y0 + 4}" width="${pw - 8}" height="${h - 8}"/>`;
      if (dir) {
        const cx = x + pw / 2, cy = y0 + h / 2, a = Math.min(pw * 0.28, 40);
        g += `<path class="acc" d="M${cx - a * dir} ${cy}H${cx + a * dir}m${-8 * dir} -6l${8 * dir} 6l${-8 * dir} 6"/>`;
      } else {
        g += `<text class="dim" x="${x + pw / 2}" y="${y0 + h / 2 + 4}" text-anchor="middle">${t('F', 'S')}</text>`;
      }
    }
    g += `<text class="dim" x="${x0 + w / 2}" y="${y0 + h + 16}" text-anchor="middle">${fmt(W)} mm</text>`;
    svg.setAttribute('viewBox', `0 0 ${vbW} ${y0 + h + 24}`);
    svg.innerHTML = g;
  };

  const drawBifold = (svg, left, right, W, H) => {
    const n = left + right, vbW = 600, pad = 20;
    const s = Math.min((vbW - pad * 2) / W, 260 / H);
    const w = W * s, x0 = (vbW - w) / 2, y0 = pad, h = H * s, lw = w / n;
    let g = `<rect class="ln2" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * lw;
      g += `<rect class="ln" x="${x + 3}" y="${y0 + 4}" width="${lw - 6}" height="${h - 8}"/>`;
      // Hinge chevron points to the side the leaf folds towards.
      const toLeft = i < left;
      const xa = toLeft ? x + lw - 6 : x + 6, xb = toLeft ? x + 8 : x + lw - 8;
      g += `<path class="acc" d="M${xa} ${y0 + 8}L${xb} ${y0 + h / 2}L${xa} ${y0 + h - 8}"/>`;
    }
    const door = (count, side) => (count % 2 === 1 ? (side === 'L' ? 0 : n - 1) : -1);
    [door(left, 'L'), door(right, 'R')].filter((i) => i >= 0 && n > 0).forEach((i) => {
      g += `<text class="dim" x="${x0 + i * lw + lw / 2}" y="${y0 + h - 14}" text-anchor="middle">${t('door', 'drzwi')}</text>`;
    });
    g += `<text class="dim" x="${x0 + w / 2}" y="${y0 + h + 16}" text-anchor="middle">${fmt(W)} mm · ${left}+${right}</text>`;
    svg.setAttribute('viewBox', `0 0 ${vbW} ${y0 + h + 24}`);
    svg.innerHTML = g;
  };

  const DRAFT_OPENING = 'bp-draft-opening';
  // No automatic prices: every project is quoted individually by the team.
  const renderEstimate = (tool) => {
    const box = $('[data-estimate]', tool);
    if (!box) return;
    box.innerHTML = t('<span class="estimate-label">Price</span><span class="estimate-text">Every project is priced individually. Add this opening to your list or send it to us, and we’ll prepare a quote.</span>',
      '<span class="estimate-label">Wycena</span><span class="estimate-text">Każdy projekt wyceniamy indywidualnie. Dodaj ten otwór do listy albo wyślij go nam, a przygotujemy wycenę.</span>');
  };
  const bindPortalDraft = (tool, opening) => {
    const a = $('[data-tool-portal]', tool);
    if (a) a.onclick = () => { try { localStorage.setItem(DRAFT_OPENING, JSON.stringify(opening)); } catch { /* ignore */ } };
    // Build a list of several openings across product pages, then send it with the quote form.
    const add = $('[data-tool-add]', tool), note = $('[data-tool-list]', tool);
    if (add) add.onclick = () => {
      const { kg, ...o } = opening; void kg;
      const saved = addToList(o);
      const n = readList().length;
      note.innerHTML = t(`Added as ${saved.ref}. Your list has ${n} opening${n === 1 ? '' : 's'}. <a href="contact.html">Send the list for a quote</a>`,
        `Dodano jako ${saved.ref}. Na liście: ${n} ${n === 1 ? 'otwór' : n < 5 ? 'otwory' : 'otworów'}. <a href="contact.html">Wyślij listę do wyceny</a>`);
      note.hidden = false;
    };
  };

  const tool = $('[data-sizing-tool]');
  if (tool) {
    const system = tool.dataset.sizingTool || 'lift-slide';
    const f = $('form', tool);
    const out = (k, v) => { const el = $(`[data-out="${k}"]`, tool); if (el) el.textContent = v; };
    // Severity is spelled out for screen readers, not only shown by colour (WCAG 1.4.1). A screen reader hears
    // the messages once typing pauses, from a separate live region, instead of the whole panel on every key.
    const SEV = { warn: t('Check: ', 'Uwaga: '), stop: t('Out of range: ', 'Poza zakresem: ') };
    const msgBox = $('[data-messages]', tool);
    const live = document.createElement('p');
    live.className = 'visually-hidden'; live.setAttribute('aria-live', 'polite');
    msgBox.after(live);
    let liveTimer;
    const show = (msgs) => {
      msgBox.innerHTML = msgs.filter(Boolean).map(([c, txt]) => `<li class="${c === 'ok' ? '' : c}">${SEV[c] ? `<span class="visually-hidden">${SEV[c]}</span>` : ''}${txt}</li>`).join('');
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { live.textContent = msgBox.textContent; }, 800);
    };
    const invalid = (W, H) => {
      if (W >= 1200 && W <= 20000 && H >= 1800 && H <= 4000) return false;
      $$('[data-out]', tool).forEach((el) => { el.textContent = '—'; });
      show([['warn', t('Enter an opening between 1,200–20,000 mm wide and 1,800–4,000 mm high.', 'Wpisz otwór o szerokości 1200–20 000 mm i wysokości 1800–4000 mm.')]]);
      return true;
    };

    const runSlider = () => {
      const def = SLIDERS[system], L = def.limits;
      const W = +f.width.value, H = +f.height.value, cfg = def.configs[f.config.value], glass = GLASS[f.glass.value];
      if (invalid(W, H)) return;
      const sashW = (W - 2 * FRAME + (cfg.panels - 1) * OVERLAP) / cfg.panels;
      const sashH = H - HEAD_SILL;
      const kg = (Math.max(sashW - SASH_PROFILE, 0) * Math.max(sashH - SASH_PROFILE, 0) / 1e6) * glass.t * 2.5 * 1.15;
      const totalM2 = (W * H) / 1e6;
      out('panelw', `${fmt(sashW)} mm`);
      out('weight', `${fmt(Math.round(kg / 5) * 5)} kg`);
      out('clear', `${fmt(Math.round((W * cfg.open - 100) / 10) * 10)} mm`);
      out('area', `${fmt(totalM2, 1)} m²`);
      const msgs = [];
      if (kg > L.panelKg) msgs.push(['stop', t(`At about ${fmt(kg)} kg per panel this is beyond the ${L.panelKg} kg hardware class. Add a panel, reduce the height${system === 'sliding' ? ', or consider lift &amp; slide' : ''}.`, `Przy ok. ${fmt(kg)} kg na skrzydło przekraczasz klasę okuć ${L.panelKg} kg. Dodaj skrzydło, zmniejsz wysokość${system === 'sliding' ? ' albo rozważ drzwi podnoszono-przesuwne' : ''}.`)]);
      else if (kg > L.heavyKg) msgs.push(['warn', def.heavyText]);
      else msgs.push(['ok', def.okText]);
      if (sashW > L.sashW) msgs.push(['stop', t(`Each panel would be about ${fmt(sashW)} mm wide, over the ${fmt(L.sashW)} mm limit. Choose a configuration with more panels.`, `Każde skrzydło miałoby ok. ${fmt(sashW)} mm szerokości, ponad limit ${fmt(L.sashW)} mm. Wybierz konfigurację z większą liczbą skrzydeł.`)]);
      if (sashW < L.sashWMin) msgs.push(['warn', t(`Panels under ~${fmt(L.sashWMin)} mm wide waste the slim interlock. Fewer panels will look better and cost less.`, `Skrzydła węższe niż ok. ${fmt(L.sashWMin)} mm marnują zaletę smukłego styku. Mniej skrzydeł będzie wyglądać lepiej i kosztować mniej.`)]);
      if (sashH > L.sashHMax) msgs.push(['stop', t(`A ${fmt(sashH)} mm panel height is outside the system range. Talk to us about a transom or a different system.`, `Wysokość skrzydła ${fmt(sashH)} mm wykracza poza zakres systemu. Porozmawiaj z nami o naświetlu albo innym systemie.`)]);
      else if (sashH > L.sashH) msgs.push(['warn', t(`Panel height over ${fmt(L.sashH)} mm needs an engineering check (deflection, glass and handling).`, `Skrzydło wyższe niż ${fmt(L.sashH)} mm wymaga sprawdzenia technicznego (ugięcie, szkło i transport).`)]);
      if (kg > L.liftKg) msgs.push(['warn', t('Handling: plan for a glazing robot or a crane. On a London terrace with no rear access, that can mean a road licence or parking suspension from the borough, so build it into the programme.', 'Transport: zaplanuj robota do szkła albo dźwig. W londyńskim szeregowcu bez dojazdu od tyłu może to oznaczać pozwolenie na zajęcie drogi lub zawieszenie miejsc parkingowych z urzędu dzielnicy, więc uwzględnij to w harmonogramie.')]);
      else if (kg > L.handKg) msgs.push(['warn', t('Handling: too heavy to carry by hand safely. We plan a vacuum lifter and check the route from the kerb to the opening at survey.', 'Transport: za ciężkie, żeby bezpiecznie przenieść ręcznie. Przy pomiarze planujemy przyssawkę próżniową i sprawdzamy trasę od krawężnika do otworu.')]);
      msgs.push(partL(totalM2, +f.floor.value));
      show(msgs);
      drawSlider($('[data-elevation]', tool), cfg, W, H);
      const opening = { system, width_mm: W, height_mm: H, config: f.config.value, glazing: f.glass.value, qty: 1, kg };
      renderEstimate(tool); bindPortalDraft(tool, opening);
      $('[data-tool-quote]', tool).href = `contact.html?${new URLSearchParams({ system, w: W, h: H, config: f.config.value, glass: f.glass.value })}`;
    };

    const runBifold = () => {
      const B = BIFOLD, W = +f.width.value, H = +f.height.value, glass = GLASS[f.glass.value];
      const [left, right] = f.layout.value.split('+').map(Number); const n = left + right;
      if (invalid(W, H)) return;
      const leafW = (W - 2 * B.frame) / n, leafH = H - 100;
      const kg = (Math.max(leafW - 120, 0) * Math.max(leafH - 120, 0) / 1e6) * glass.t * 2.5 * 1.2;
      const stack = (count) => (count ? count * B.stackPerLeaf + 30 : 0);
      const clear = W - 2 * B.frame - stack(left) - stack(right);
      const totalM2 = (W * H) / 1e6;
      out('panelw', `${fmt(leafW)} mm`);
      out('weight', `${fmt(Math.round(kg / 5) * 5)} kg`);
      out('clear', `${fmt(Math.round(clear / 10) * 10)} mm`);
      out('stack', `${fmt(Math.round(leafW / 10) * 10)} mm`);
      const msgs = [];
      if (kg > B.leafKg) msgs.push(['stop', t(`At about ${fmt(kg)} kg per leaf this is beyond the ${B.leafKg} kg bi-fold hardware range. Add leaves or consider a slider.`, `Przy ok. ${fmt(kg)} kg na skrzydło przekraczasz zakres okuć harmonijkowych ${B.leafKg} kg. Dodaj skrzydła albo rozważ drzwi przesuwne.`)]);
      else if (kg > B.warnKg) msgs.push(['warn', t('Heavy leaves (80–100 kg): fine for the hardware, but the head must be stiff. Get your engineer to design to the system deflection limit.', 'Ciężkie skrzydła (80–100 kg): okucia to obsłużą, ale nadproże musi być sztywne. Niech konstruktor zaprojektuje je według limitu ugięcia systemu.')]);
      else msgs.push(['ok', t(`Leaf weight is comfortably inside the hardware range (up to ${B.warnKg} kg).`, `Waga skrzydła mieści się z zapasem w zakresie okuć (do ${B.warnKg} kg).`)]);
      if (leafW > B.leafW) msgs.push(['stop', t(`Each leaf would be about ${fmt(leafW)} mm wide, over the ${fmt(B.leafW)} mm limit. Choose a layout with more leaves.`, `Każde skrzydło miałoby ok. ${fmt(leafW)} mm szerokości, ponad limit ${fmt(B.leafW)} mm. Wybierz układ z większą liczbą skrzydeł.`)]);
      if (leafW < B.leafWMin) msgs.push(['warn', t('Leaves under ~500 mm wide look busy and add frames. Choose fewer leaves.', 'Skrzydła węższe niż ok. 500 mm wyglądają na zatłoczone i dodają ram. Wybierz mniej skrzydeł.')]);
      if (leafH > B.leafHMax) msgs.push(['stop', t(`A ${fmt(leafH)} mm leaf height is outside the bi-fold range. Consider a slider for this opening.`, `Wysokość skrzydła ${fmt(leafH)} mm wykracza poza zakres drzwi harmonijkowych. Rozważ drzwi przesuwne.`)]);
      else if (leafH > B.leafH) msgs.push(['warn', t('Tall leaves (over 2.6 m) need stiffer profiles and careful head detailing. We confirm at Stage 3.', 'Wysokie skrzydła (ponad 2,6 m) wymagają sztywniejszych profili i starannego detalu nadproża. Potwierdzimy to na etapie koncepcji.')]);
      const doors = (left % 2) + (right % 2);
      msgs.push([doors ? 'ok' : 'warn', doors
        ? t(`This layout has ${doors === 2 ? 'two traffic doors' : 'a traffic door'}, so you can go in and out without folding the whole set.`, `Ten układ ma ${doors === 2 ? 'dwoje drzwi przechodnich' : 'drzwi przechodnie'}, więc wychodzisz bez składania całości.`)
        : t('No traffic door: an even number of leaves on each side means folding the set every time you go out. Consider an odd leaf on one side.', 'Brak drzwi przechodnich: parzysta liczba skrzydeł po każdej stronie oznacza składanie całości przy każdym wyjściu. Rozważ nieparzystą liczbę po jednej stronie.')]);
      msgs.push(['ok', t(`When folded, the stack projects about ${fmt(Math.round(leafW / 10) * 10)} mm ${f.swing?.value === 'in' ? 'into the room' : 'into the garden'}. Keep it clear of steps, furniture and planting.`, `Po złożeniu pakiet wystaje na ok. ${fmt(Math.round(leafW / 10) * 10)} mm ${f.swing?.value === 'in' ? 'do pomieszczenia' : 'do ogrodu'}. Zostaw tam wolne miejsce, bez schodów, mebli i roślin.`)]);
      msgs.push(partL(totalM2, +f.floor.value));
      show(msgs);
      drawBifold($('[data-elevation]', tool), left, right, W, H);
      const opening = { system, width_mm: W, height_mm: H, config: f.layout.value, glazing: f.glass.value, qty: 1, kg };
      renderEstimate(tool); bindPortalDraft(tool, opening);
      $('[data-tool-quote]', tool).href = `contact.html?${new URLSearchParams({ system, w: W, h: H, config: f.layout.value, glass: f.glass.value })}`;
    };

    // Small screens: the results sit below the inputs, so mirror the two key figures in a bar that stays in view.
    const peek = document.createElement('div');
    peek.className = 'tool-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.innerHTML = ['panelw', 'weight']
      .map((k) => `<span>${$(`[data-out="${k}"]`, tool)?.previousElementSibling?.textContent || ''}<b data-peek="${k}"></b></span>`).join('');
    f.append(peek);
    const syncPeek = () => {
      $$('[data-peek]', peek).forEach((el) => { el.textContent = $(`[data-out="${el.dataset.peek}"]`, tool).textContent; });
      const msgs = $('[data-messages]', tool);
      peek.dataset.state = $('li.stop', msgs) ? 'stop' : $('li.warn', msgs) ? 'warn' : 'ok';
    };
    const run = () => { (system === 'bifold' ? runBifold : runSlider)(); syncPeek(); };
    f.addEventListener('input', run);
    f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    run();
  }

  /* ---------- quote form ---------- */
  const form = $('[data-quote-form]');
  if (form) {
    const steps = $$('.form-step', form);
    const markers = $$('.steps-indicator li', form);
    const status = $('[data-form-status]', form);
    let current = 0;
    const DRAFT = 'bp-quote-draft';

    const params = new URLSearchParams(location.search);
    const role = params.get('role') || params.get('type');
    if (role) { const r = form.querySelector(`input[name="role"][value="${role}"]`); if (r) r.checked = true; }
    const sys = params.get('system');
    if (sys) { const c = form.querySelector(`input[name="systems"][value="${sys}"]`); if (c) c.checked = true; }
    const mat = params.get('material');
    if (mat) { const m = form.querySelector(`input[name="material"][value="${CSS.escape(mat)}"]`); if (m) m.checked = true; }
    const topic = params.get('topic');
    if (topic && form.topic) form.topic.value = topic;
    if (!form.dataset.endpoint) { const note = $('[data-preview-note]', form); if (note) note.hidden = false; }
    /* Openings: one row per window or door, kept in the visitor's list (js/openings-list.js). */
    const SYS_NAMES = PL
      ? { 'lift-slide': 'Podnoszono-przesuwne', sliding: 'Przesuwne slim', bifold: 'Harmonijkowe', hinged: 'Balkonowe / wejściowe', windows: 'Okna', facades: 'Fasada słupowo-ryglowa', rooflights: 'Latarnia dachowa / świetlik' }
      : { 'lift-slide': 'Lift & slide', sliding: 'Slim sliding', bifold: 'Bi-fold', hinged: 'French / entrance door', windows: 'Windows', facades: 'Curtain walling', rooflights: 'Roof lantern / rooflight' };
    const MAT_NAMES = PL ? { '': 'Doradźcie', alu: 'Aluminium', timber: 'Drewno', pvc: 'PVC', alutimber: 'Drewno-aluminium' } : { '': 'Advise me', alu: 'Aluminium', timber: 'Timber', pvc: 'PVC', alutimber: 'Timber-aluminium' };
    const opBox = $('[data-openings-rows]', form);
    if (params.get('w') && params.get('h')) {
      // Arriving from a sizing tool: add that opening to the list once, with its layout and glass in the note.
      const sysKey = SYS_NAMES[params.get('system')] ? params.get('system') : 'lift-slide';
      const cfg = SLIDERS[sysKey]?.configs[params.get('config')]; const gl = GLASS[params.get('glass')];
      const glPl = { d: 'szyba podwójna', dl: 'szyba podwójna laminowana', t: 'szyba potrójna', tl: 'szyba potrójna laminowana' }[params.get('glass')];
      const layout = PL ? (params.get('config') ? `układ ${params.get('config')}` : '') : cfg ? cfg.label : (sysKey === 'bifold' && params.get('config') ? `${params.get('config')} leaves` : '');
      const o = { system: sysKey, width_mm: +params.get('w'), height_mm: +params.get('h'), config: params.get('config') || '', glazing: params.get('glass') || '', note: [layout, PL ? glPl : gl?.label].filter(Boolean).join(', ') };
      if (!readList().some((x) => x.system === o.system && x.width_mm === o.width_mm && x.height_mm === o.height_mm && (x.config || '') === o.config)) addToList(o);
    }
    // Each row is a group named by its reference, so "Width" or "Remove" says which opening it belongs to.
    const opRow = (o) => { const ref = String(o.ref || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); return `
      <div class="op-row" data-op role="group" aria-label="${ref || t('Opening', 'Otwór')}">
        <span class="op-ref" data-op-ref aria-hidden="true">${ref}</span>
        <label class="op-f op-sys"><span>${t('Product', 'Produkt')}</span><select data-k="system">${Object.entries(SYS_NAMES).map(([k, v]) => `<option value="${k}"${k === o.system ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="op-f op-mat"><span>${t('Material', 'Materiał')}</span><select data-k="material">${Object.entries(MAT_NAMES).map(([k, v]) => `<option value="${k}"${k === (o.material || '') ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="op-f op-w"><span>${t('Width (mm)', 'Szerokość (mm)')}</span><input data-k="width_mm" type="number" inputmode="numeric" min="300" max="30000" placeholder="${t('e.g. 4800', 'np. 4800')}" value="${o.width_mm || ''}"></label>
        <label class="op-f op-h"><span>${t('Height (mm)', 'Wysokość (mm)')}</span><input data-k="height_mm" type="number" inputmode="numeric" min="300" max="6000" placeholder="${t('e.g. 2400', 'np. 2400')}" value="${o.height_mm || ''}"></label>
        <label class="op-f op-qty"><span>${t('Qty', 'Szt.')}</span><input data-k="qty" type="number" inputmode="numeric" min="1" max="999" value="${o.qty || 1}"></label>
        <label class="op-f op-note"><span>${t('Note', 'Uwagi')}</span><input data-k="note" type="text" maxlength="200" value="${String(o.note || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"></label>
        <button type="button" class="linkish op-remove" data-op-remove aria-label="${t('Remove', 'Usuń')} ${ref}">${t('Remove', 'Usuń')}</button>
      </div>`; };
    // Keys the rows don't show (layout, glass) ride along unchanged.
    const opRead = () => (opBox ? $$('[data-op]', opBox) : []).map((row) => {
      const o = { ...row._o };
      $$('[data-k]', row).forEach((el) => { o[el.dataset.k] = el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value; });
      o.qty = o.qty || 1;
      return o;
    });
    const opRender = (list) => {
      opBox.innerHTML = list.map(opRow).join('');
      $$('[data-op]', opBox).forEach((row, i) => { row._o = list[i]; });
    };
    if (opBox) {
      // An empty list still shows one blank row; it is only saved once something is typed in it.
      const start = readList();
      const sys0 = SYS_NAMES[params.get('system')] ? params.get('system') : 'windows';
      opRender(start.length ? start : [{ system: sys0, material: '', ref: nextRef([], sys0), qty: 1 }]);
      opBox.addEventListener('input', () => writeList(opRead()));
      opBox.addEventListener('change', (e) => {
        // A new product type gets a matching reference (W for windows, D for doors) if it still has the default one.
        if (e.target.dataset.k !== 'system') return;
        const list = opRead(); const row = e.target.closest('[data-op]'); const i = $$('[data-op]', opBox).indexOf(row);
        list[i].ref = nextRef(list.filter((_, j) => j !== i), list[i].system); list[i].config = ''; list[i].glazing = '';
        writeList(list); opRender(list);
      });
      opBox.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-op-remove]'); if (!rm) return;
        const list = opRead(); list.splice($$('[data-op]', opBox).indexOf(rm.closest('[data-op]')), 1);
        writeList(list); opRender(list);
        $('[data-openings-add]', form).focus();
      });
      $('[data-openings-add]', form).addEventListener('click', () => {
        const list = opRead(); const last = list[list.length - 1];
        const sys = last?.system || params.get('system') || 'windows';
        list.push({ system: SYS_NAMES[sys] ? sys : 'windows', material: last?.material || '', ref: nextRef(list, SYS_NAMES[sys] ? sys : 'windows'), qty: 1 });
        writeList(list); opRender(list);
        $('[data-op]:last-child [data-k="width_mm"]', opBox).focus();
      });
    }
    const openingsValid = () => opRead().every((o) => (o.width_mm == null || (o.width_mm >= 300 && o.width_mm <= 30000)) && (o.height_mm == null || (o.height_mm >= 300 && o.height_mm <= 6000)))
      || t('Check the sizes: width 300–30,000 mm, height 300–6,000 mm. Leave a size blank if you don’t know it yet.', 'Sprawdź wymiary: szerokość 300–30 000 mm, wysokość 300–6000 mm. Zostaw pole puste, jeśli jeszcze nie znasz wymiaru.');

    // Restore an unsent draft (text fields only).
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || '{}');
      Object.entries(d).forEach(([k, v]) => { const el = form.elements[k]; if (el && 'value' in el && !el.value && el.type !== 'file' && el.type !== 'radio' && el.type !== 'checkbox') el.value = v; });
    } catch { /* storage unavailable */ }
    form.addEventListener('input', () => {
      try {
        const d = {};
        $$('input[type=text],input[type=email],input[type=tel],textarea,select', form).forEach((el) => { if (el.name) d[el.name] = el.value; });
        localStorage.setItem(DRAFT, JSON.stringify(d));
      } catch { /* ignore */ }
    });

    const showRoleFields = () => {
      const r = form.querySelector('input[name="role"]:checked')?.value;
      $$('[data-for-role]', form).forEach((el) => { el.hidden = !(el.dataset.forRole.split(' ').includes(r)); });
      // Only offer what makes sense for this kind of client.
      const sel = form.topic;
      if (sel) {
        [...sel.options].forEach((o) => { const roles = o.dataset.roles; const show = !roles || !r || roles.split(' ').includes(r); o.hidden = !show; o.disabled = !show; });
        if (sel.selectedOptions[0]?.disabled) sel.value = 'quote';
      }
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'role') showRoleFields(); });
    showRoleFields();

    const validators = {
      name: (v) => v.trim().length > 1 || t('Enter your name.', 'Wpisz imię i nazwisko.'),
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || t('Enter an email like name@practice.co.uk.', 'Wpisz e-mail, np. imie@firma.co.uk.'),
      files_link: (v) => !v.trim() || /^https?:\/\/\S+\.\S+$/i.test(v.trim()) || t('Paste the full link, starting with https://', 'Wklej pełny link, zaczynający się od https://'),
      location: (v) => v.trim().length > 1 || t('Enter a postcode or borough.', 'Wpisz kod pocztowy lub dzielnicę.'),
    };
    let errId = 0;
    const fieldError = (field, msg) => {
      field.classList.toggle('has-error', !!msg);
      const err = $('.error', field); if (err) err.textContent = msg || '';
      const ctl = $('[role=radiogroup], input:not([type=hidden]), select, textarea', field);
      if (!ctl || !err) return;
      if (!err.id) err.id = `err-${++errId}`;
      // The openings list marks the size boxes that are out of range, not the first control in the list.
      const sizes = $$('[data-op] input[data-k$="_mm"]', field);
      if (sizes.length) {
        sizes.forEach((inp) => {
          const bad = !!msg && inp.value !== '' && (+inp.value < +inp.min || +inp.value > +inp.max);
          if (bad) { inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', err.id); }
          else { inp.removeAttribute('aria-invalid'); inp.removeAttribute('aria-describedby'); }
        });
        return;
      }
      if (msg) { ctl.setAttribute('aria-invalid', 'true'); ctl.setAttribute('aria-describedby', err.id); }
      else { ctl.removeAttribute('aria-invalid'); ctl.removeAttribute('aria-describedby'); }
    };
    const validateStep = (i) => {
      let ok = true, first = null;
      $$('[data-validate]', steps[i]).forEach((el) => {
        const field = el.closest('.field');
        let res = true;
        if (el.dataset.validate === 'radio') res = !!form.querySelector(`input[name="${el.dataset.name}"]:checked`) || t('Choose one option.', 'Wybierz jedną opcję.');
        else if (el.dataset.validate === 'consent') res = el.checked || t('Please confirm so we can reply to you.', 'Potwierdź, żebyśmy mogli Ci odpowiedzieć.');
        else if (el.dataset.validate === 'openings') res = openingsValid();
        else res = validators[el.name] ? validators[el.name](el.value) : true;
        fieldError(field, res === true ? '' : res);
        if (res !== true) { ok = false; first = first || el; }
      });
      if (first) first.focus();
      return ok;
    };
    const go = (i) => {
      steps[current].hidden = true; current = i; steps[current].hidden = false;
      markers.forEach((m, j) => { m.classList.toggle('is-active', j === current); m.classList.toggle('is-done', j < current); m.removeAttribute('aria-current'); });
      markers[current]?.setAttribute('aria-current', 'step');
      const h = $('h2,legend', steps[current]); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    };
    $$('[data-next]', form).forEach((b) => b.addEventListener('click', () => { if (validateStep(current)) go(current + 1); }));
    $$('[data-prev]', form).forEach((b) => b.addEventListener('click', () => go(current - 1)));

    // Files
    const fileInput = $('input[type=file]', form), list = $('[data-file-list]', form), zone = $('.dropzone', form);
    const MAX_MB = 50, MAX_TOTAL = 100;
    const renderFiles = () => {
      const files = [...fileInput.files]; let total = 0, err = '';
      list.innerHTML = files.map((fl) => { total += fl.size; if (fl.size > MAX_MB * 1e6) err = t(`${fl.name} is over ${MAX_MB} MB — export a PDF or paste a WeTransfer or Dropbox link in the field below.`, `${fl.name} ma ponad ${MAX_MB} MB — wyeksportuj PDF albo wklej link WeTransfer lub Dropbox w polu poniżej.`); return `<li>${fl.name.replace(/</g, '&lt;')} · ${(fl.size / 1e6).toFixed(1)} MB</li>`; }).join('');
      if (total > MAX_TOTAL * 1e6) err = t(`Files total over ${MAX_TOTAL} MB — paste a WeTransfer or Dropbox link in the field below instead.`, `Pliki mają łącznie ponad ${MAX_TOTAL} MB — zamiast tego wklej link WeTransfer lub Dropbox w polu poniżej.`);
      fieldError(fileInput.closest('.field'), err);
      return !err;
    };
    fileInput?.addEventListener('change', renderFiles);
    if (zone && fileInput) {
      ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
      zone.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { fileInput.files = e.dataTransfer.files; renderFiles(); } });
    }

    const SUBMIT = t('Send enquiry', 'Wyślij zapytanie');
    const ERRORS = {
      files: t('The files are too large or too many (up to 20 files, 50 MB each, 100 MB in total). Paste a WeTransfer or Dropbox link instead.', 'Pliki są za duże albo jest ich za dużo (do 20 plików, po 50 MB, łącznie 100 MB). Zamiast tego wklej link WeTransfer lub Dropbox.'),
      consent: t('Please tick the consent box so we can reply to you.', 'Zaznacz zgodę, żebyśmy mogli Ci odpowiedzieć.'),
      name_email: t('Check your name and email address on step 1.', 'Sprawdź imię i adres e-mail w kroku 1.'),
      timeout: t('This is taking too long, probably because of large files. Try again with a link to the files instead.', 'To trwa za długo, pewnie przez duże pliki. Spróbuj ponownie z linkiem do plików zamiast załączników.'),
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Enter in a field on step 1 or 2 means "Continue", not "send the whole form".
      if (current < steps.length - 1) { if (validateStep(current)) go(current + 1); return; }
      if (!validateStep(current) || (fileInput && !renderFiles())) return;
      const endpoint = form.dataset.endpoint;
      const btn = $('button[type=submit]', form);
      status.hidden = false; status.classList.remove('is-error');
      if (!endpoint) {
        status.innerHTML = t('<strong>Preview mode — nothing has been sent.</strong> The form isn’t connected yet. Please email your drawings to <a href="mailto:daniel@brickandpane.co.uk">daniel@brickandpane.co.uk</a>. Your details are still in the form.', '<strong>Tryb podglądu — nic nie zostało wysłane.</strong> Formularz nie jest jeszcze podłączony. Wyślij rysunki na <a href="mailto:daniel@brickandpane.co.uk">daniel@brickandpane.co.uk</a>. Twoje dane nadal są w formularzu.');
        status.focus();
        return;
      }
      if (form.openings) form.openings.value = JSON.stringify(opRead().filter((o) => o.width_mm || o.height_mm || o.note));
      const big = [...(fileInput?.files || [])].reduce((n, x) => n + x.size, 0) > 10e6;
      btn.disabled = true; btn.textContent = t('Sending…', 'Wysyłanie…');
      status.textContent = big ? t('Uploading your files. With large drawings this can take a minute or two, please keep this page open.', 'Wysyłamy pliki. Przy dużych rysunkach może to potrwać minutę lub dwie, nie zamykaj tej strony.') : '';
      status.hidden = !big;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5 * 60e3);
      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || String(res.status));
        try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
        clearList();
        // The thank-you page shows the reference, any files that didn't upload, and offers the portal for this email.
        try { sessionStorage.setItem('bp-enquiry', JSON.stringify({ ref: data.ref || '', email: form.email.value.trim(), rejected: data.rejected || [] })); } catch { /* ignore */ }
        location.href = `thank-you.html${data.ref ? `?ref=${encodeURIComponent(data.ref)}` : ''}`;
      } catch (err) {
        const code = err.name === 'AbortError' ? 'timeout' : err.message;
        status.hidden = false;
        status.classList.add('is-error');
        status.innerHTML = `${ERRORS[code] || t('We couldn’t send that.', 'Nie udało się wysłać.')} ${t('Your details are still here. Try again, or email <a href="mailto:daniel@brickandpane.co.uk">daniel@brickandpane.co.uk</a>.', 'Twoje dane nadal tu są. Spróbuj ponownie albo napisz na <a href="mailto:daniel@brickandpane.co.uk">daniel@brickandpane.co.uk</a>.')}`;
        status.focus();
        btn.disabled = false; btn.textContent = SUBMIT;
      } finally { clearTimeout(timer); }
    });
  }

  /* ---------- thank-you page ---------- */
  const refBox = $('[data-ref]');
  if (refBox) {
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('bp-enquiry') || '{}'); } catch { /* ignore */ }
    const ref = new URLSearchParams(location.search).get('ref') || saved.ref;
    if (ref) { $('[data-ref-value]', refBox).textContent = ref; refBox.hidden = false; }
    const rej = $('[data-rejected]');
    if (rej && saved.rejected?.length) { $('[data-rejected-list]', rej).textContent = saved.rejected.join(', '); rej.hidden = false; }
  }

  // Material advisor (materials page): three answers -> a suggested material, with the reasons and caveats.
  const adv = $('[data-advisor]');
  if (adv) {
    const NAME = {
      alu: t('Aluminium', 'Aluminium'), timber: t('Timber', 'Drewno'), pvc: t('PVC', 'PVC'), alutimber: t('Timber-aluminium', 'Drewno-aluminium'),
    };
    const SYS = { windows: 'windows', doors: 'hinged', facades: 'facades', sliding: '' };
    const recommend = (where, what, why) => {
      const notes = [];
      let mat; let text;
      if (what === 'facades') {
        mat = why === 'look' || why === 'carbon' ? 'alutimber' : 'alu';
        text = mat === 'alu'
          ? t('Curtain walling, rooflights and lanterns are engineered mainly in aluminium: it carries large panes on slim mullions and needs almost no upkeep.', 'Fasady, świetliki i latarnie dachowe powstają głównie z aluminium: uniesie duże tafle na smukłych słupkach i prawie nie wymaga konserwacji.')
          : t('Timber-aluminium curtain walling puts warm timber mullions inside the room and a weatherproof aluminium cap outside.', 'Fasada drewniano-aluminiowa daje ciepłe drewniane słupki od środka i odporną na pogodę aluminiową nakładkę na zewnątrz.');
        notes.push(t('Flat and walk-on rooflights are aluminium only.', 'Świetliki płaskie i pochylne do chodzenia robimy tylko z aluminium.'));
        if (where === 'listed' || where === 'conservation') notes.push(t('Large new glazing in a sensitive building needs early talks with the planners.', 'Duże nowe przeszklenia w chronionym budynku wymagają wczesnych rozmów z urzędem.'));
      } else if (where === 'listed') {
        mat = 'timber';
        text = t('Listed buildings almost always need like-for-like timber, and new windows or doors need listed building consent first.', 'Budynki zabytkowe prawie zawsze wymagają drewna wiernego oryginałowi, a nowe okna i drzwi najpierw zgody konserwatora (listed building consent).');
        notes.push(t('Slimline double or vacuum glazing can often keep the original glazing bars.', 'Cienkie szyby zespolone lub próżniowe często pozwalają zachować oryginalne szprosy.'));
        if (what === 'sliding') notes.push(t('A large slider in a listed building is decided case by case. Timber lift & slide is the usual starting point.', 'O dużych drzwiach przesuwnych w zabytku decyduje się indywidualnie. Zwykle zaczynamy od drewnianych podnoszono-przesuwnych.'));
      } else if (where === 'conservation' && what !== 'sliding') {
        mat = 'timber';
        text = t('In conservation areas, timber is the material planners most often accept for windows and doors on the street side.', 'W strefach ochrony konserwatorskiej drewno to materiał, który urząd najczęściej akceptuje w oknach i drzwiach od strony ulicy.');
        if (why === 'cost') notes.push(t('PVC is often refused in conservation areas. Check with your council before choosing it.', 'PVC jest w tych strefach często odrzucane. Zanim je wybierzesz, sprawdź w urzędzie dzielnicy.'));
        if (why === 'slim') notes.push(t('Steel-look aluminium can be accepted where it replaces original metal windows.', 'Aluminium w stylu stalowym bywa akceptowane, gdy zastępuje oryginalne okna metalowe.'));
        if (why === 'upkeep') notes.push(t('Factory-finished timber needs a recoat only every 6–10 years.', 'Drewno malowane fabrycznie wymaga odnowienia powłoki tylko co 6–10 lat.'));
      } else {
        mat = { slim: 'alu', look: 'timber', cost: 'pvc', upkeep: 'alu', carbon: 'timber' }[why];
        text = {
          alu: t('Aluminium gives the slimmest frames and the largest panes, in any colour, with almost no upkeep.', 'Aluminium daje najsmuklejsze ramy i największe tafle, w dowolnym kolorze, prawie bez konserwacji.'),
          timber: why === 'carbon'
            ? t('FSC-certified timber stores carbon and has the lowest embodied carbon of the main frame materials.', 'Drewno z certyfikatem FSC magazynuje węgiel i ma najniższy ślad węglowy z głównych materiałów ram.')
            : t('Timber gives proportions and detail that suit period houses, and it can be repaired and repainted for decades.', 'Drewno daje proporcje i detal pasujące do starych domów, a naprawiać i malować je można przez dziesięciolecia.'),
          pvc: t('PVC gives the best thermal performance for the money and needs almost no upkeep.', 'PVC daje najlepszą izolacyjność za tę cenę i prawie nie wymaga konserwacji.'),
        }[mat];
        if (mat === 'pvc' && what === 'sliding') notes.push(t('PVC lift & slide suits openings up to about 4–5 m. For wider openings, aluminium.', 'Drzwi podnoszono-przesuwne z PVC sprawdzą się w otworach do ok. 4–5 m. Szersze: aluminium.'));
        if (why === 'upkeep') notes.push(t('PVC is also low-upkeep and costs less, with wider frames.', 'PVC też jest bezobsługowe i tańsze, ale ma szersze ramy.'));
        if (why === 'carbon') notes.push(t('Aluminium with high recycled content is the low-carbon option where you need slim frames.', 'Gdy potrzebne są smukłe ramy, niskoemisyjną opcją jest aluminium z dużym udziałem recyklingu.'));
        if (why === 'look' && what === 'sliding') notes.push(t('Timber-aluminium gives timber inside with an aluminium shell outside.', 'Drewno-aluminium daje drewno od środka i aluminiową osłonę na zewnątrz.'));
        if (where === 'conservation') notes.push(t('Rear elevations that can’t be seen from the street are often treated more flexibly. Check your council’s Article 4 direction.', 'Elewacje tylne niewidoczne z ulicy są często traktowane łagodniej. Sprawdź dyrektywę Article 4 w swojej dzielnicy.'));
      }
      if (where === 'unsure') notes.push(t('Check your council’s website to see whether your street is in a conservation area. It can change the answer.', 'Sprawdź na stronie urzędu dzielnicy, czy ulica leży w strefie ochrony konserwatorskiej. To może zmienić odpowiedź.'));
      return { mat, text, notes };
    };
    const out = $('[data-advisor-out]', adv);
    const update = () => {
      const f = $('form', adv);
      const v = (n) => (f.querySelector(`input[name="${n}"]:checked`) || {}).value;
      const r = recommend(v('where'), v('what'), v('why'));
      $('[data-out-material]', out).textContent = NAME[r.mat];
      $('[data-out-why]', out).textContent = r.text;
      $('[data-out-notes]', out).innerHTML = r.notes.map((n) => `<li>${n}</li>`).join('');
      const q = new URLSearchParams();
      if (SYS[v('what')]) q.set('system', SYS[v('what')]);
      q.set('material', r.mat);
      $('[data-out-link]', out).href = `contact.html?${q}`;
    };
    adv.addEventListener('change', update);
    update();
  }
})();
