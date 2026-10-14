// Client project portal: dashboard, project detail, new project, settings.
import { store } from './store.js';
import { SYSTEMS, stage, esc, fmtDay, ago, stageBadge, stageText, courtLabel, progressBar, tracker, audienceOf, estimatePanel, $, $$, toast } from './core.js';
import { estimateProject, estimateOpening, rangeText, fmtGBP } from '../pricing.js';
import { route, renderAppBar, pipeline, nowCard, tabs, overviewPanel, documentsPanel, messagesPanel, timelinePanel, bindDetail, counts, showPrices, estimateNote } from './ui.js';

const app = $('#app');
const bar = $('#appbar');
let user = null;
let activeTab = 'overview';
let lastProjectId = null;

const keepDrafts = () => {
  const keep = {};
  $$('textarea[id]', app).forEach((t) => { if (t.value) keep[t.id] = t.value; });
  const focused = document.activeElement?.id;
  return () => { Object.entries(keep).forEach(([id, v]) => { const t = document.getElementById(id); if (t) t.value = v; }); if (focused) document.getElementById(focused)?.focus(); };
};

async function render(fromStore = false) {
  user = await store.getUser();
  if (!user) { location.href = `login.html?next=${encodeURIComponent('portal.html' + location.hash)}`; return; }
  const r = route();
  if (fromStore && r.name === 'new') { renderAppBar(bar, user, 'portal'); return; }
  const restore = fromStore ? keepDrafts() : () => {};
  await renderAppBar(bar, user, 'portal');
  try {
    if (r.name === 'p' && r.id) await detail(r.id);
    else if (r.name === 'new') newProject();
    else if (r.name === 'settings') settings();
    else await dashboard();
  } catch (e) {
    app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(e.message)}</p><p style="margin-top:1rem"><a class="link-arrow" href="#/">Back to projects</a></p></div>`;
  }
  restore();
}

async function dashboard() {
  const aud = audienceOf(user);
  const noun = aud === 'home' ? 'orders' : 'projects';
  document.title = `Your ${noun} | Brick & Pane`;
  const projects = await store.listProjects();
  const you = projects.filter((p) => stage(p.stage).court === 'you');
  const us = projects.filter((p) => stage(p.stage).court === 'us');
  const done = projects.filter((p) => ['completed', 'closed'].includes(p.stage));
  const card = (p) => `
    <a class="pcard" href="#/p/${esc(p.id)}">
      <div class="pcard-top"><span class="pcard-ref">${esc(p.ref)}</span>${stageBadge(p.stage, aud)}</div>
      <h3 class="pcard-name">${esc(p.name)}</h3>
      <p class="pcard-loc">${esc(p.location)}</p>
      ${aud === 'home' ? tracker(p.stage) : progressBar(p.stage)}
      <p class="pcard-next">${stage(p.stage).court === 'you' ? '<strong>Your action:</strong> ' : ''}${esc(p.next_step || stageText(p.stage, aud))}</p>
      <div class="pcard-foot"><span>${courtLabel(p.stage)}</span><span>${p.due_at && stage(p.stage).court === 'us' ? `Update by ${fmtDay(p.due_at)}` : `Updated ${ago(p.updated_at)}`}</span></div>
    </a>`;
  app.innerHTML = `
    <div class="container section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${esc(aud === 'home' ? 'Your orders' : (user.company || 'Client portal'))}</span><h1 class="app-h1">Hello, ${esc((user.full_name || '').split(' ')[0] || 'there')}.</h1></div>
        <dl class="stats">
          <div class="stat ${you.length ? 'is-you' : ''}"><dt>Waiting on you</dt><dd>${you.length}</dd></div>
          <div class="stat"><dt>With Brick &amp; Pane</dt><dd>${us.length}</dd></div>
          <div class="stat"><dt>Completed</dt><dd>${done.length}</dd></div>
        </dl>
      </div>
      ${projects.length ? `
        ${you.length ? `<h2 class="list-h">Needs your action</h2><div class="pgrid">${you.map(card).join('')}</div>` : ''}
        <h2 class="list-h">${you.length ? 'Other projects' : 'All projects'}</h2>
        <div class="pgrid">${projects.filter((p) => !you.includes(p)).map(card).join('') || '<p class="note">Nothing else right now.</p>'}</div>`
      : `<div class="empty"><h2>No ${noun} yet</h2><p>${aud === 'home' ? 'Tell us the sizes of your opening, or add a few phone photos. You’ll get a budget straight away and can follow your order here, like an online shop.' : 'Send us drawings, a window schedule or a sketch. You’ll follow every step here, with no need to phone for updates.'}</p><a class="btn" href="#/new">${aud === 'home' ? 'Get a price' : 'Start a project'}</a></div>`}
    </div>`;
}

async function detail(id) {
  if (id !== lastProjectId) { activeTab = 'overview'; lastProjectId = id; }
  const d = await store.getProject(id);
  document.title = `${d.project.name} | Brick & Pane`;
  const c = counts(d, 'client');
  const aud = audienceOf(user);
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="#/">${aud === 'home' ? 'Orders' : 'Projects'}</a></li><li aria-current="page">${esc(d.project.ref)}</li></ol></nav>
      <div class="detail-head">
        <div><h1 class="app-h1">${esc(d.project.name)}</h1><p class="note">${esc(d.project.ref)} · ${esc(d.project.location)}</p></div>
      </div>
      <div class="detail-grid">
        <div>${nowCard(d.project, 'client', aud)}</div>
        <div>${pipeline(d.project, d.events, aud)}</div>
      </div>
      ${tabs(activeTab, c)}
      <div class="tabpanel" role="tabpanel" id="panel-${activeTab}" aria-labelledby="tab-${activeTab}">
        ${activeTab === 'documents' ? documentsPanel(d, 'client') : activeTab === 'messages' ? messagesPanel(d, user) : activeTab === 'timeline' ? timelinePanel(d, 'client', aud) : overviewPanel(d, 'client')}
      </div>
    </div>`;
  bindDetail(app, d, (t) => { activeTab = t; detail(id); });
}

function openingRow(i) {
  return `<tr data-row>
    <td><input name="ref" aria-label="Reference" value="${i < 9 ? `D0${i + 1}` : `D${i + 1}`}"></td>
    <td><select name="system" aria-label="System">${Object.entries(SYSTEMS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></td>
    <td><input name="width_mm" type="number" inputmode="numeric" min="300" max="30000" aria-label="Width mm" placeholder="mm"></td>
    <td><input name="height_mm" type="number" inputmode="numeric" min="300" max="6000" aria-label="Height mm" placeholder="mm"></td>
    <td><select name="config" aria-label="Layout"><option value="">—</option><optgroup label="Sliding"><option value="2A">2 panels, 1 sliding</option><option value="2B">2 panels, both sliding</option><option value="3T">3 panels, 3 tracks</option><option value="4C">4 panels, centre</option><option value="6C">6 panels, centre</option></optgroup><optgroup label="Bi-fold">${['3+0', '4+0', '2+2', '5+0', '4+1', '3+2', '6+0', '3+3', '7+0', '4+3'].map((l) => `<option value="${l}">${l}</option>`).join('')}</optgroup></select></td>
    <td><select name="glazing" aria-label="Glazing"><option value="d">Double</option><option value="dl">Double lam.</option><option value="t">Triple</option></select></td>
    <td><input name="qty" type="number" min="1" value="1" aria-label="Quantity" style="width:4.5rem"></td>
    <td class="est num" data-est>—</td>
    ${showPrices() ? '<td class="est num" data-price>—</td>' : ''}
    <td><button type="button" class="linkish" data-remove aria-label="Remove row">✕</button></td>
  </tr>`;
}

function newProject() {
  const aud = audienceOf(user);
  document.title = `${aud === 'home' ? 'Get a price' : 'New project'} | Brick & Pane`;
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="#/">Projects</a></li><li aria-current="page">New project</li></ol></nav>
      <h1 class="app-h1">${aud === 'home' ? 'Get a price' : 'New project'}</h1>
      <p class="lead" style="margin-bottom:2rem">${aud === 'home' ? 'Add the size of each opening. You’ll see a budget straight away, and our formal quote follows within two working days.' : 'Fill in what you know. A sketch with dimensions is enough to start. You’ll see your project move through each stage here.'}</p>
      <form class="newp" novalidate>
        <section class="newp-sec"><h2 class="panel-h">Project</h2>
          <div class="field-row">
            <div class="field"><label for="np-name">Project name</label><input id="np-name" name="name" required placeholder="e.g. Hartley Road rear extension"><span class="error"></span></div>
            <div class="field"><label for="np-loc">Location</label><input id="np-loc" name="location" required placeholder="Postcode or borough"><span class="error"></span></div>
          </div>
          <div class="field-row">
            <div class="field" ${aud === 'home' ? 'hidden' : ''}><label for="np-riba">RIBA stage</label><select id="np-riba" name="riba_stage"><option value="">Select</option><option>0–1 Strategic / brief</option><option>2 Concept</option><option>3 Spatial coordination</option><option>4 Technical design</option><option>5 Manufacturing &amp; construction</option></select></div>
            <div class="field"><label for="np-bt">Building</label><select id="np-bt" name="building_type"><option value="">Select</option><option>Extension to an existing house</option><option>New-build house</option><option>Residential scheme</option><option>Listed or in a conservation area</option></select></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="np-start">Start on site</label><select id="np-start" name="start_window"><option value="">Select</option><option>Within 3 months</option><option>3–6 months</option><option>6–12 months</option><option>Over 12 months / not sure</option></select></div>
            <div class="field"><label for="np-brief">What matters most?</label><input id="np-brief" name="brief" placeholder="Sightlines, flush threshold, budget, programme…"></div>
          </div>
        </section>
        <section class="newp-sec"><h2 class="panel-h">Openings schedule</h2>
          <p class="note">Structural opening sizes. For lift &amp; slide, pick a layout to see the estimated panel weight.</p>
          <div style="overflow-x:auto"><table class="sched"><thead><tr><th>Ref</th><th>System</th><th>Width</th><th>Height</th><th>Layout</th><th>Glazing</th><th>Qty</th><th>Est. panel</th>${showPrices() ? '<th>Est. budget</th>' : ''}<th></th></tr></thead><tbody data-rows>${openingRow(0)}</tbody></table></div>
          <button type="button" class="btn btn-sm btn-ghost" data-add style="margin-top:1rem">Add opening</button>
          ${showPrices() ? `<div class="estimate" data-total style="margin-top:1.5rem"><span class="estimate-label">Budget estimate</span><span class="estimate-value" data-total-value>—</span><span class="estimate-text">Supplied &amp; installed in London. ${esc(estimateNote())}</span></div>` : ''}
        </section>
        <section class="newp-sec"><h2 class="panel-h">Files</h2>
          <div class="field"><label for="np-files">Drawings, schedule or photos</label><input id="np-files" name="files" type="file" multiple accept=".pdf,.dwg,.dxf,.xlsx,.xls,.csv,.jpg,.jpeg,.png"><span class="hint">PDF, DWG, XLSX or images, up to 50 MB each.</span></div>
        </section>
        <div class="btn-row"><button class="btn" type="submit">Submit for review</button><a class="link-arrow" href="#/">Cancel</a></div>
      </form>
    </div>`;
  const f = $('.newp', app), rows = $('[data-rows]', f);
  const rowData = (tr) => { const o = Object.fromEntries($$('input,select', tr).map((el) => [el.name, el.value])); return { ...o, width_mm: +o.width_mm, height_mm: +o.height_mm, qty: +o.qty || 1 }; };
  const est = (tr) => {
    const o = rowData(tr);
    const e = o.system === 'lift-slide' ? estimatePanel(o) : null;
    $('[data-est]', tr).innerHTML = e ? `${e.kg} kg${e.over ? ' <span class="tag tag-accent">check</span>' : ''}` : '—';
    const priceCell = $('[data-price]', tr);
    if (priceCell) { const b = estimateOpening(o); priceCell.textContent = b ? fmtGBP(b.total) : '—'; }
  };
  const total = () => {
    const box = $('[data-total-value]', f); if (!box) return null;
    const t = estimateProject($$('tr', rows).map(rowData).filter((o) => o.width_mm && o.height_mm));
    box.textContent = t ? rangeText(t) : '—';
    return t;
  };
  rows.addEventListener('input', (e) => { const tr = e.target.closest('tr'); if (tr) est(tr); total(); });
  rows.addEventListener('change', () => total());
  // Opening carried over from a sizing tool on the public site.
  try {
    const draft = JSON.parse(localStorage.getItem('bp-draft-opening') || 'null');
    if (draft) {
      const tr = $('tr', rows);
      ['system', 'width_mm', 'height_mm', 'glazing'].forEach((k) => { if (draft[k] != null && tr.querySelector(`[name="${k}"]`)) tr.querySelector(`[name="${k}"]`).value = draft[k]; });
      const cfgSel = tr.querySelector('[name="config"]');
      if (draft.config && [...cfgSel.options].some((o) => o.value === draft.config)) cfgSel.value = draft.config;
      localStorage.removeItem('bp-draft-opening');
      est(tr); total();
      toast('We’ve added the opening from the sizing tool.');
    }
  } catch { /* ignore */ }
  rows.addEventListener('click', (e) => { if (e.target.closest('[data-remove]') && rows.children.length > 1) e.target.closest('tr').remove(); });
  $('[data-add]', f).addEventListener('click', () => rows.insertAdjacentHTML('beforeend', openingRow(rows.children.length)));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    let bad = null;
    ['name', 'location'].forEach((n) => { const el = f[n]; const field = el.closest('.field'); const miss = !el.value.trim(); field.classList.toggle('has-error', miss); $('.error', field).textContent = miss ? 'Required.' : ''; if (miss && !bad) bad = el; });
    if (bad) { bad.focus(); return; }
    const files = [...f.files.files];
    if (files.some((x) => x.size > 50e6)) { toast('Each file must be under 50 MB.'); return; }
    const openings = $$('tr', rows).map((tr) => Object.fromEntries($$('input,select', tr).map((el) => [el.name, el.value])))
      .filter((o) => o.width_mm && o.height_mm)
      .map((o) => ({ ...o, width_mm: +o.width_mm, height_mm: +o.height_mm, qty: +o.qty || 1, notes: '' }));
    const data = Object.fromEntries(['name', 'location', 'riba_stage', 'building_type', 'start_window', 'brief'].map((k) => [k, f[k].value.trim()]));
    data.systems = [...new Set(openings.map((o) => o.system))];
    const t = estimateProject(openings);
    if (t) { data.estimate_low = t.low; data.estimate_high = t.high; }
    const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Submitting…';
    try { const id = await store.createProject(data, openings, files); toast(aud === 'home' ? 'Sent. Your formal quote follows within two working days.' : 'Submitted. We’ll confirm within one working day.'); location.hash = `#/p/${id}`; }
    catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Submit for review'; }
  });
}

function settings() {
  document.title = 'Settings | Brick & Pane';
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="#/">Projects</a></li><li aria-current="page">Settings</li></ol></nav>
      <h1 class="app-h1">Settings</h1>
      <form class="settings" style="max-width:640px;display:grid;gap:1.2rem;margin-top:2rem">
        <div class="field-row">
          <div class="field"><label for="s-name">Name</label><input id="s-name" name="full_name" value="${esc(user.full_name)}"></div>
          <div class="field"><label for="s-co">Practice / company</label><input id="s-co" name="company" value="${esc(user.company)}"></div>
        </div>
        <div class="field"><label for="s-ph">Phone <span class="hint">optional</span></label><input id="s-ph" name="phone" type="tel" value="${esc(user.phone || '')}"></div>
        <fieldset class="field"><legend>Email notifications</legend>
          <label class="consent"><input type="checkbox" name="notify_email" ${user.notify_email ? 'checked' : ''}> <span>Email me when a project changes stage, a document is shared, an approval is needed or someone replies.</span></label>
          <label class="consent"><input type="checkbox" name="notify_digest" ${user.notify_digest ? 'checked' : ''}> <span>Send a weekly summary of all my projects as well.</span></label>
        </fieldset>
        <div><button class="btn" type="submit">Save</button></div>
      </form>
    </div>`;
  $('.settings', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.updateProfile({ full_name: f.full_name.value.trim(), company: f.company.value.trim(), phone: f.phone.value.trim(), notify_email: f.notify_email.checked, notify_digest: f.notify_digest.checked }); toast('Saved.'); } catch (err) { toast(err.message); }
  });
}

let t = null;
store.onChange(() => { clearTimeout(t); t = setTimeout(() => render(true), 120); });
addEventListener('hashchange', () => render());
render();
