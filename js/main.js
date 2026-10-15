/* Brick & Pane — site behaviour. No dependencies. */
import { PRICING, pricingVisible, pricingIsExample, estimateProject, rangeText, rangeTextIncVat } from './pricing.js';

(() => {
  const PL = document.documentElement.lang === 'pl';
  const t = (en, pl) => (PL ? pl : en);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- header & navigation ---------- */
  const header = $('.site-header');
  const nav = $('#primary-nav');
  const toggle = $('.menu-toggle');

  const setMenu = (open) => {
    if (!nav || !toggle) return;
    if (open) {
      nav.style.setProperty('--nav-top', `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
      $$('.has-sub[data-current] .sub-toggle', nav).forEach((b) => b.setAttribute('aria-expanded', 'true'));
    }
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    $('.menu-toggle-label', toggle).textContent = open ? t('Close', 'Zamknij') : 'Menu';
    document.body.classList.toggle('nav-open', open);
  };
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
      t.classList.add('has-labels');
    });
  };
  labelTables();
  let lt = null;
  new MutationObserver(() => { clearTimeout(lt); lt = setTimeout(() => labelTables(), 60); }).observe(document.body, { childList: true, subtree: true });

  // Hide the sticky mobile action bar while typing so it never covers a field.
  document.addEventListener('focusin', (e) => { if (e.target.matches('input, select, textarea')) document.body.classList.add('is-typing'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.('input, select, textarea')) document.body.classList.remove('is-typing'); }, 50));

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

  /* ---------- reveal on scroll ---------- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  } else {
    $$('.reveal').forEach((el) => el.classList.add('is-in'));
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
  const renderEstimate = (tool, opening) => {
    const box = $('[data-estimate]', tool);
    if (!box) return;
    if (!pricingVisible()) {
      box.innerHTML = t('<span class="estimate-label">Budget</span><span class="estimate-text">Save this opening to your portal and we’ll send a budget within 2 working days.</span>',
        '<span class="estimate-label">Budżet</span><span class="estimate-text">Zapisz ten otwór w panelu, a budżet prześlemy w ciągu 2 dni roboczych.</span>');
      return;
    }
    const est = estimateProject([opening]);
    box.innerHTML = est
      ? t(`<span class="estimate-label">Budget estimate</span><span class="estimate-value">${rangeText(est)}</span><span class="estimate-text"><strong>${rangeTextIncVat(est)}</strong> for homeowners. Supplied &amp; installed in London. Automatic estimate, not a quotation.${pricingIsExample() ? ` <strong>${PRICING.label}.</strong>` : ''}</span>`,
          `<span class="estimate-label">Szacunkowy budżet</span><span class="estimate-value">${rangeText(est)}</span><span class="estimate-text"><strong>${rangeTextIncVat(est)}</strong> dla osób prywatnych. Z dostawą i montażem w Londynie. Szacunek automatyczny, nie oferta.${pricingIsExample() ? ` <strong>${PRICING.labelPl}.</strong>` : ''}</span>`)
      : '';
  };
  const bindPortalDraft = (tool, opening) => {
    const a = $('[data-tool-portal]', tool);
    if (!a) return;
    a.onclick = () => { try { localStorage.setItem(DRAFT_OPENING, JSON.stringify(opening)); } catch { /* ignore */ } };
  };

  const tool = $('[data-sizing-tool]');
  if (tool) {
    const system = tool.dataset.sizingTool || 'lift-slide';
    const f = $('form', tool);
    const out = (k, v) => { const el = $(`[data-out="${k}"]`, tool); if (el) el.textContent = v; };
    const show = (msgs) => { $('[data-messages]', tool).innerHTML = msgs.filter(Boolean).map(([c, t]) => `<li class="${c === 'ok' ? '' : c}">${t}</li>`).join(''); };
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
      renderEstimate(tool, opening); bindPortalDraft(tool, opening);
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
      renderEstimate(tool, opening); bindPortalDraft(tool, opening);
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
    if (params.get('w') && form.opening_width_mm) form.opening_width_mm.value = params.get('w');
    if (params.get('h') && form.opening_height_mm) form.opening_height_mm.value = params.get('h');
    if (params.get('w') && params.get('h')) {
      const sysKey = params.get('system'); const cfg = SLIDERS[sysKey]?.configs[params.get('config')]; const gl = GLASS[params.get('glass')];
      const sysName = (PL ? { 'lift-slide': 'Drzwi podnoszono-przesuwne', sliding: 'Drzwi przesuwne slim', bifold: 'Drzwi harmonijkowe' } : { 'lift-slide': 'Lift & slide', sliding: 'Slim sliding', bifold: 'Bi-fold' })[sysKey] || t('Door', 'Drzwi');
      const layout = cfg ? cfg.label : (sysKey === 'bifold' && params.get('config') ? `${params.get('config')} leaves` : '');
      const glPl = { d: 'szyba podwójna', dl: 'szyba podwójna laminowana', t: 'szyba potrójna', tl: 'szyba potrójna laminowana' }[params.get('glass')];
      form.message.value = PL
        ? `${sysName}: otwór ok. ${params.get('w')} × ${params.get('h')} mm${params.get('config') ? `, układ ${params.get('config')}` : ''}${glPl ? `, ${glPl}` : ''}.\n`
        : `${sysName} opening approx. ${params.get('w')} × ${params.get('h')} mm${layout ? `, ${layout}` : ''}${gl ? `, ${gl.label}` : ''}.\n`;
    }

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
      location: (v) => v.trim().length > 1 || t('Enter a postcode or borough so we can check access and planning context.', 'Wpisz kod pocztowy lub dzielnicę, żebyśmy mogli sprawdzić dojazd i uwarunkowania planistyczne.'),
    };
    const fieldError = (field, msg) => {
      field.classList.toggle('has-error', !!msg);
      const err = $('.error', field); if (err) err.textContent = msg || '';
    };
    const validateStep = (i) => {
      let ok = true, first = null;
      $$('[data-validate]', steps[i]).forEach((el) => {
        const field = el.closest('.field');
        let res = true;
        if (el.dataset.validate === 'radio') res = !!form.querySelector(`input[name="${el.dataset.name}"]:checked`) || t('Choose one option.', 'Wybierz jedną opcję.');
        else if (el.dataset.validate === 'consent') res = el.checked || t('Please confirm so we can reply to you.', 'Potwierdź, żebyśmy mogli Ci odpowiedzieć.');
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateStep(current) || (fileInput && !renderFiles())) return;
      const endpoint = form.dataset.endpoint;
      const btn = $('button[type=submit]', form);
      status.hidden = false; status.classList.remove('is-error');
      if (!endpoint) {
        status.innerHTML = t('<strong>Preview mode — nothing has been sent.</strong> The form isn’t connected yet. Please email your drawings to <a href="mailto:hello@brickandpane.co.uk">hello@brickandpane.co.uk</a>. Your details are still in the form.', '<strong>Tryb podglądu — nic nie zostało wysłane.</strong> Formularz nie jest jeszcze podłączony. Wyślij rysunki na <a href="mailto:hello@brickandpane.co.uk">hello@brickandpane.co.uk</a>. Twoje dane nadal są w formularzu.');
        status.focus();
        return;
      }
      btn.disabled = true; btn.textContent = t('Sending…', 'Wysyłanie…');
      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
        location.href = 'thank-you.html';
      } catch {
        status.classList.add('is-error');
        status.innerHTML = t('We couldn’t send that. Your details are still here — try again, or email <a href="mailto:hello@brickandpane.co.uk">hello@brickandpane.co.uk</a>.', 'Nie udało się wysłać. Twoje dane nadal tu są — spróbuj ponownie albo napisz na <a href="mailto:hello@brickandpane.co.uk">hello@brickandpane.co.uk</a>.');
        status.focus();
        btn.disabled = false; btn.textContent = t('Send for review', 'Wyślij do oceny');
      }
    });
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
        if (where === 'listed' || where === 'conservation') notes.push(t('Large new glazing in a sensitive building needs early talks with the planners. We can prepare drawings for that.', 'Duże nowe przeszklenia w chronionym budynku wymagają wczesnych rozmów z urzędem. Możemy przygotować do tego rysunki.'));
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
