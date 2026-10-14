/* Brick & Pane — site behaviour. No dependencies. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- header & navigation ---------- */
  const header = $('.site-header');
  const nav = $('#primary-nav');
  const toggle = $('.menu-toggle');

  const setMenu = (open) => {
    if (!nav || !toggle) return;
    if (open) nav.style.setProperty('--nav-top', `${header.getBoundingClientRect().bottom}px`);
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

  /* ---------- lift & slide sizing tool ---------- */
  // Indicative envelope for the system class. Update from the certified system data sheet.
  const LIMITS = { panelKg: 400, heavyKg: 300, sashH: 3200, sashHMax: 3500, sashW: 3300, sashWMin: 700, handKg: 150, liftKg: 250 };
  const CONFIGS = {
    '2A': { panels: 2, sliding: [1], open: 1 / 2, label: '2 panels — 1 sliding, 1 fixed' },
    '3T': { panels: 3, sliding: [1, 2], open: 2 / 3, label: '3 panels on 3 tracks — 2 sliding' },
    '4C': { panels: 4, sliding: [1, 2], open: 1 / 2, label: '4 panels — centre opening' },
    '6C': { panels: 6, sliding: [1, 2, 3, 4], open: 2 / 3, label: '6 panels on 3 tracks — centre opening' },
  };
  const GLASS = { // total glass thickness in mm; glass weighs ~2.5 kg per m² per mm
    d: { t: 12, label: 'Double, 6 / 20 / 6 toughened' },
    dl: { t: 14.8, label: 'Double, 8.8 laminated / 18 / 6 toughened' },
    t: { t: 16, label: 'Triple, 6 / 14 / 4 / 14 / 6' },
  };
  const FRAME = 70, OVERLAP = 70, SASH_PROFILE = 140, HEAD_SILL = 150;

  const tool = $('[data-sizing-tool]');
  if (tool) {
    const f = $('form', tool);
    const out = (k) => $(`[data-out="${k}"]`, tool);
    const fmt = (n, d = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });

    const drawElevation = (svg, cfg, W, H) => {
      const vbW = 600, pad = 20;
      const s = Math.min((vbW - pad * 2) / W, 260 / H);
      const w = W * s, x0 = (vbW - w) / 2, y0 = pad;
      const pw = w / cfg.panels;
      let g = `<rect class="ln2" x="${x0}" y="${y0}" width="${w}" height="${H * s}"/>`;
      for (let i = 0; i < cfg.panels; i++) {
        const x = x0 + i * pw, slides = cfg.sliding.includes(i);
        g += `<rect class="${slides ? 'acc' : 'ln'}" x="${x + 4}" y="${y0 + 4}" width="${pw - 8}" height="${H * s - 8}"/>`;
        if (slides) {
          const dir = cfg.panels === 2 ? -1 : (i < cfg.panels / 2 ? -1 : 1);
          const cx = x + pw / 2, cy = y0 + (H * s) / 2, a = Math.min(pw * 0.28, 40);
          g += `<path class="acc" d="M${cx - a * dir} ${cy}H${cx + a * dir}m${-8 * dir} -6l${8 * dir} 6l${-8 * dir} 6"/>`;
        } else {
          g += `<text class="dim" x="${x + pw / 2}" y="${y0 + (H * s) / 2 + 4}" text-anchor="middle">F</text>`;
        }
      }
      g += `<text class="dim" x="${x0 + w / 2}" y="${y0 + H * s + 16}" text-anchor="middle">${fmt(W)} mm</text>`;
      svg.setAttribute('viewBox', `0 0 ${vbW} ${y0 + H * s + 24}`);
      svg.innerHTML = g;
    };

    const run = () => {
      const W = +f.width.value, H = +f.height.value, cfg = CONFIGS[f.config.value], glass = GLASS[f.glass.value];
      const area = +f.floor.value || 0;
      const msgs = [];
      if (!(W >= 1200 && W <= 20000 && H >= 1800 && H <= 4000)) {
        out('panelw').textContent = out('weight').textContent = out('clear').textContent = out('area').textContent = '—';
        $('[data-messages]', tool).innerHTML = '<li class="warn">Enter an opening between 1,200–20,000 mm wide and 1,800–4,000 mm high.</li>';
        return;
      }
      const sashW = (W - 2 * FRAME + (cfg.panels - 1) * OVERLAP) / cfg.panels;
      const sashH = H - HEAD_SILL;
      const glassM2 = Math.max(sashW - SASH_PROFILE, 0) * Math.max(sashH - SASH_PROFILE, 0) / 1e6;
      const kg = glassM2 * glass.t * 2.5 * 1.15;
      const clear = W * cfg.open - 100;
      const totalM2 = (W * H) / 1e6;

      out('panelw').textContent = `${fmt(sashW)} mm`;
      out('weight').textContent = `${fmt(Math.round(kg / 5) * 5)} kg`;
      out('clear').textContent = `${fmt(Math.round(clear / 10) * 10)} mm`;
      out('area').textContent = `${fmt(totalM2, 1)} m²`;

      if (kg > LIMITS.panelKg) msgs.push(['stop', `At about ${fmt(kg)} kg per panel this is beyond the ${LIMITS.panelKg} kg hardware class. Add a panel or reduce the height.`]);
      else if (kg > LIMITS.heavyKg) msgs.push(['warn', 'Heavy-duty roller carriages needed (300–400 kg class). Fine for the system, but it affects the track and the floor detail.']);
      else msgs.push(['ok', `Panel weight is inside the standard hardware range (up to ${LIMITS.heavyKg} kg).`]);

      if (sashW > LIMITS.sashW) msgs.push(['stop', `Each panel would be about ${fmt(sashW)} mm wide, over the ${fmt(LIMITS.sashW)} mm limit. Choose a configuration with more panels.`]);
      if (sashW < LIMITS.sashWMin) msgs.push(['warn', 'Panels under ~700 mm wide waste the system’s slim interlock. Fewer panels will look better and cost less.']);
      if (sashH > LIMITS.sashHMax) msgs.push(['stop', `A ${fmt(sashH)} mm panel height is outside the system range. Talk to us about a transom or a different system.`]);
      else if (sashH > LIMITS.sashH) msgs.push(['warn', `Panel height over ${fmt(LIMITS.sashH)} mm needs an engineering check (deflection, glass and handling).`]);

      if (kg > LIMITS.liftKg) msgs.push(['warn', 'Handling: plan for a glazing robot or a crane. On a London terrace with no rear access, that can mean a road licence or parking suspension from the borough, so build it into the programme.']);
      else if (kg > LIMITS.handKg) msgs.push(['warn', 'Handling: too heavy to carry by hand safely. We plan a vacuum lifter and check the route from the kerb to the opening at survey.']);

      if (area > 0) {
        const pct = (totalM2 / area) * 100;
        msgs.push([pct > 25 ? 'warn' : 'ok', pct > 25
          ? `This door alone is ${fmt(pct)}% of the extension floor area. Above 25% (plus the area of any openings removed), Approved Document L expects a SAP-based calculation instead of the simple route. Brief your energy assessor early.`
          : `This door is ${fmt(pct)}% of the extension floor area, inside the 25% simple-route allowance (check total glazing, including rooflights).`]);
      }

      $('[data-messages]', tool).innerHTML = msgs.map(([c, t]) => `<li class="${c === 'ok' ? '' : c}">${t}</li>`).join('');
      drawElevation($('[data-elevation]', tool), cfg, W, H);
      const q = new URLSearchParams({ system: 'lift-slide', w: W, h: H, config: f.config.value, glass: f.glass.value });
      $('[data-tool-quote]', tool).href = `contact.html?${q}`;
    };
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
      const cfg = CONFIGS[params.get('config')]; const gl = GLASS[params.get('glass')];
      form.message.value = `Lift & slide opening approx. ${params.get('w')} × ${params.get('h')} mm${cfg ? `, ${cfg.label}` : ''}${gl ? `, ${gl.label}` : ''}.\n`;
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
