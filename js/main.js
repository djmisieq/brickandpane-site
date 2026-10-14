/* Brick & Pane — site behaviour. No dependencies. */
import { PRICING, pricingVisible, pricingIsExample, estimateProject, rangeText } from './pricing.js';

(() => {
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
    $('.menu-toggle-label', toggle).textContent = open ? 'Close' : 'Menu';
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

  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

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
  };
  // dirs: sliding panels and the direction they open (-1 left, 1 right).
  const SLIDERS = {
    'lift-slide': {
      limits: { panelKg: 400, heavyKg: 300, sashH: 3200, sashHMax: 3500, sashW: 3300, sashWMin: 700, handKg: 150, liftKg: 250 },
      heavyText: 'Heavy-duty roller carriages needed (300–400 kg class). Fine for the system, but it affects the track and the floor detail.',
      configs: {
        '2A': { panels: 2, dirs: { 1: -1 }, open: 1 / 2, label: '2 panels — 1 sliding, 1 fixed' },
        '3T': { panels: 3, dirs: { 1: -1, 2: -1 }, open: 2 / 3, label: '3 panels on 3 tracks — 2 sliding' },
        '4C': { panels: 4, dirs: { 1: -1, 2: 1 }, open: 1 / 2, label: '4 panels — centre opening' },
        '6C': { panels: 6, dirs: { 1: -1, 2: -1, 3: 1, 4: 1 }, open: 2 / 3, label: '6 panels on 3 tracks — centre opening' },
      },
    },
    sliding: {
      limits: { panelKg: 250, heavyKg: 200, sashH: 3000, sashHMax: 3200, sashW: 2800, sashWMin: 600, handKg: 150, liftKg: 220 },
      heavyText: 'Upper end of the inline hardware range (200–250 kg). Above this, lift & slide hardware is the safer choice.',
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
  const fmt = (n, d = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const partL = (totalM2, area) => {
    if (!(area > 0)) return null;
    const pct = (totalM2 / area) * 100;
    return [pct > 25 ? 'warn' : 'ok', pct > 25
      ? `This door alone is ${fmt(pct)}% of the extension floor area. Above 25% (plus the area of any openings removed), Approved Document L expects a SAP-based calculation instead of the simple route. Brief your energy assessor early.`
      : `This door is ${fmt(pct)}% of the extension floor area, inside the 25% simple-route allowance (check total glazing, including rooflights).`];
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
        g += `<text class="dim" x="${x + pw / 2}" y="${y0 + h / 2 + 4}" text-anchor="middle">F</text>`;
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
      g += `<text class="dim" x="${x0 + i * lw + lw / 2}" y="${y0 + h - 14}" text-anchor="middle">door</text>`;
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
      box.innerHTML = '<span class="estimate-label">Budget</span><span class="estimate-text">Save this opening to your portal and we’ll send a budget within 2 working days.</span>';
      return;
    }
    const est = estimateProject([opening]);
    box.innerHTML = est
      ? `<span class="estimate-label">Budget estimate</span><span class="estimate-value">${rangeText(est)}</span><span class="estimate-text">Supplied &amp; installed in London. Automatic estimate, not a quotation.${pricingIsExample() ? ` <strong>${PRICING.label}.</strong>` : ''}</span>`
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
      show([['warn', 'Enter an opening between 1,200–20,000 mm wide and 1,800–4,000 mm high.']]);
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
      if (kg > L.panelKg) msgs.push(['stop', `At about ${fmt(kg)} kg per panel this is beyond the ${L.panelKg} kg hardware class. Add a panel, reduce the height${system === 'sliding' ? ', or consider lift &amp; slide' : ''}.`]);
      else if (kg > L.heavyKg) msgs.push(['warn', def.heavyText]);
      else msgs.push(['ok', `Panel weight is inside the standard hardware range (up to ${L.heavyKg} kg).`]);
      if (sashW > L.sashW) msgs.push(['stop', `Each panel would be about ${fmt(sashW)} mm wide, over the ${fmt(L.sashW)} mm limit. Choose a configuration with more panels.`]);
      if (sashW < L.sashWMin) msgs.push(['warn', `Panels under ~${fmt(L.sashWMin)} mm wide waste the slim interlock. Fewer panels will look better and cost less.`]);
      if (sashH > L.sashHMax) msgs.push(['stop', `A ${fmt(sashH)} mm panel height is outside the system range. Talk to us about a transom or a different system.`]);
      else if (sashH > L.sashH) msgs.push(['warn', `Panel height over ${fmt(L.sashH)} mm needs an engineering check (deflection, glass and handling).`]);
      if (kg > L.liftKg) msgs.push(['warn', 'Handling: plan for a glazing robot or a crane. On a London terrace with no rear access, that can mean a road licence or parking suspension from the borough, so build it into the programme.']);
      else if (kg > L.handKg) msgs.push(['warn', 'Handling: too heavy to carry by hand safely. We plan a vacuum lifter and check the route from the kerb to the opening at survey.']);
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
      if (kg > B.leafKg) msgs.push(['stop', `At about ${fmt(kg)} kg per leaf this is beyond the ${B.leafKg} kg bi-fold hardware range. Add leaves or consider a slider.`]);
      else if (kg > B.warnKg) msgs.push(['warn', 'Heavy leaves (80–100 kg): fine for the hardware, but the head must be stiff. Get your engineer to design to the system deflection limit.']);
      else msgs.push(['ok', `Leaf weight is comfortably inside the hardware range (up to ${B.warnKg} kg).`]);
      if (leafW > B.leafW) msgs.push(['stop', `Each leaf would be about ${fmt(leafW)} mm wide, over the ${fmt(B.leafW)} mm limit. Choose a layout with more leaves.`]);
      if (leafW < B.leafWMin) msgs.push(['warn', 'Leaves under ~500 mm wide look busy and add frames. Choose fewer leaves.']);
      if (leafH > B.leafHMax) msgs.push(['stop', `A ${fmt(leafH)} mm leaf height is outside the bi-fold range. Consider a slider for this opening.`]);
      else if (leafH > B.leafH) msgs.push(['warn', 'Tall leaves (over 2.6 m) need stiffer profiles and careful head detailing. We confirm at Stage 3.']);
      const doors = (left % 2) + (right % 2);
      msgs.push([doors ? 'ok' : 'warn', doors
        ? `This layout has ${doors === 2 ? 'two traffic doors' : 'a traffic door'}, so you can go in and out without folding the whole set.`
        : 'No traffic door: an even number of leaves on each side means folding the set every time you go out. Consider an odd leaf on one side.']);
      msgs.push(['ok', `When folded, the stack projects about ${fmt(Math.round(leafW / 10) * 10)} mm ${f.swing?.value === 'in' ? 'into the room' : 'into the garden'}. Keep it clear of steps, furniture and planting.`]);
      msgs.push(partL(totalM2, +f.floor.value));
      show(msgs);
      drawBifold($('[data-elevation]', tool), left, right, W, H);
      const opening = { system, width_mm: W, height_mm: H, config: f.layout.value, glazing: f.glass.value, qty: 1, kg };
      renderEstimate(tool, opening); bindPortalDraft(tool, opening);
      $('[data-tool-quote]', tool).href = `contact.html?${new URLSearchParams({ system, w: W, h: H, config: f.layout.value, glass: f.glass.value })}`;
    };

    const run = system === 'bifold' ? runBifold : runSlider;
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
    const topic = params.get('topic');
    if (topic && form.topic) form.topic.value = topic;
    if (params.get('w') && params.get('h')) {
      const sysKey = params.get('system'); const cfg = SLIDERS[sysKey]?.configs[params.get('config')]; const gl = GLASS[params.get('glass')];
      const sysName = { 'lift-slide': 'Lift & slide', sliding: 'Slim sliding', bifold: 'Bi-fold' }[sysKey] || 'Door';
      const layout = cfg ? cfg.label : (sysKey === 'bifold' && params.get('config') ? `${params.get('config')} leaves` : '');
      form.message.value = `${sysName} opening approx. ${params.get('w')} × ${params.get('h')} mm${layout ? `, ${layout}` : ''}${gl ? `, ${gl.label}` : ''}.\n`;
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
    };
    form.addEventListener('change', (e) => { if (e.target.name === 'role') showRoleFields(); });
    showRoleFields();

    const validators = {
      name: (v) => v.trim().length > 1 || 'Enter your name.',
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Enter an email like name@practice.co.uk.',
      location: (v) => v.trim().length > 1 || 'Enter a postcode or borough so we can check access and planning context.',
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
        if (el.dataset.validate === 'radio') res = !!form.querySelector(`input[name="${el.dataset.name}"]:checked`) || 'Choose one option.';
        else if (el.dataset.validate === 'consent') res = el.checked || 'Please confirm so we can reply to you.';
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
    const MAX_MB = 25, MAX_TOTAL = 50;
    const renderFiles = () => {
      const files = [...fileInput.files]; let total = 0, err = '';
      list.innerHTML = files.map((fl) => { total += fl.size; if (fl.size > MAX_MB * 1e6) err = `${fl.name} is over ${MAX_MB} MB — export a PDF or add a WeTransfer link in your message.`; return `<li>${fl.name.replace(/</g, '&lt;')} · ${(fl.size / 1e6).toFixed(1)} MB</li>`; }).join('');
      if (total > MAX_TOTAL * 1e6) err = `Files total over ${MAX_TOTAL} MB — add a WeTransfer or Dropbox link in your message instead.`;
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
        status.innerHTML = '<strong>Preview mode — nothing has been sent.</strong> The form isn’t connected yet. Please email your drawings to <a href="mailto:hello@brickandpane.co.uk">hello@brickandpane.co.uk</a>. Your details are still in the form.';
        status.focus();
        return;
      }
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
        location.href = 'thank-you.html';
      } catch {
        status.classList.add('is-error');
        status.innerHTML = 'We couldn’t send that. Your details are still here — try again, or email <a href="mailto:hello@brickandpane.co.uk">hello@brickandpane.co.uk</a>.';
        status.focus();
        btn.disabled = false; btn.textContent = 'Send for review';
      }
    });
  }
})();
