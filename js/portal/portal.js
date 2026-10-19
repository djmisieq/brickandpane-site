// Client project portal: dashboard, project detail, new project, settings.
import { store } from './store.js';
import { SYSTEMS, MATERIALS, stage, esc, fmtDay, ago, stageBadge, stageText, courtLabel, progressBar, tracker, audienceOf, estimatePanel, $, $$, toast } from './core.js';
import { route, renderAppBar, pipeline, nowCard, tabs, overviewPanel, documentsPanel, changesPanel, messagesPanel, timelinePanel, bindDetail, counts } from './ui.js';
import { tr } from './i18n.js';
import { readList, clearList } from '../openings-list.js';

const app = $('#app');
const bar = $('#appbar');
let user = null;
let activeTab = 'overview';
let lastProjectId = null;

// Stored values stay in English (they go to the database and the CRM); only labels are translated.
const opts = (values) => values.map((v) => `<option value="${esc(v)}">${esc(tr(v))}</option>`).join('');
const RIBA = ['0–1 Strategic / brief', '2 Concept', '3 Spatial coordination', '4 Technical design', '5 Manufacturing & construction'];
const BUILDINGS = ['Extension to an existing house', 'New-build house', 'Residential scheme', 'Listed or in a conservation area'];
const STARTS = ['Within 3 months', '3–6 months', '6–12 months', 'Over 12 months / not sure'];

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
    app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr(e.message))}</p><p style="margin-top:1rem"><a class="link-arrow" href="#/">${tr('Back to projects')}</a></p></div>`;
  }
  restore();
}

async function dashboard() {
  const aud = audienceOf(user);
  const home = aud === 'home';
  document.title = `${tr(home ? 'Your orders' : 'Your projects')} | Brick & Pane`;
  const [projects, enquiries] = await Promise.all([store.listProjects(), store.myEnquiries ? store.myEnquiries() : []]);
  const you = projects.filter((p) => stage(p.stage).court === 'you');
  const us = projects.filter((p) => stage(p.stage).court === 'us');
  const done = projects.filter((p) => ['completed', 'closed'].includes(p.stage));
  const card = (p) => `
    <a class="pcard" href="#/p/${esc(p.id)}">
      <div class="pcard-top"><span class="pcard-ref">${esc(p.ref)}</span>${stageBadge(p.stage, aud)}</div>
      <h3 class="pcard-name">${esc(p.name)}</h3>
      <p class="pcard-loc">${esc(p.location)}</p>
      ${home ? tracker(p.stage) : progressBar(p.stage)}
      <p class="pcard-next">${stage(p.stage).court === 'you' ? `<strong>${tr('Your action:')}</strong> ` : ''}${esc(tr(p.next_step || stageText(p.stage, aud)))}</p>
      <div class="pcard-foot"><span>${courtLabel(p.stage)}</span><span>${p.due_at && stage(p.stage).court === 'us' ? tr('Update by {date}', { date: fmtDay(p.due_at) }) : tr('Updated {ago}', { ago: ago(p.updated_at) })}</span></div>
    </a>`;
  app.innerHTML = `
    <div class="container section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${esc(home ? tr('Your orders') : (user.company || tr('Client portal')))}</span><h1 class="app-h1">${(user.full_name || '').trim() ? tr('Hello, {name}.', { name: esc(user.full_name.trim().split(' ')[0]) }) : tr('Hello.')}</h1></div>
        <dl class="stats">
          <div class="stat ${you.length ? 'is-you' : ''}"><dt>${tr('Waiting on you')}</dt><dd>${you.length}</dd></div>
          <div class="stat"><dt>${tr('With Brick & Pane')}</dt><dd>${us.length}</dd></div>
          <div class="stat"><dt>${tr('Completed')}</dt><dd>${done.length}</dd></div>
        </dl>
      </div>
      ${enquiryList(enquiries)}
      ${projects.length ? `
        ${you.length ? `<h2 class="list-h">${tr('Needs your action')}</h2><div class="pgrid">${you.map(card).join('')}</div>` : ''}
        <h2 class="list-h">${tr(you.length ? (home ? 'Other orders' : 'Other projects') : (home ? 'All orders' : 'All projects'))}</h2>
        <div class="pgrid">${projects.filter((p) => !you.includes(p)).map(card).join('') || `<p class="note">${tr('Nothing else right now.')}</p>`}</div>`
      : `<div class="empty"><h2>${tr(home ? 'No orders yet' : 'No projects yet')}</h2><p>${tr(home ? 'Tell us the sizes of your opening, or add a few phone photos. We’ll prepare an individual quote, and you can follow your order here, like an online shop.' : 'Send us drawings, a window schedule or a sketch. You’ll follow every step here, with no need to phone for updates.')}</p><a class="btn" href="#/new">${tr(home ? 'Add your opening' : 'Start a project')}</a></div>`}
    </div>`;
}

// Enquiries sent through the website form before (or without) an account. Once staff turn one into
// a project it links there; until then it shows the reference and where it stands.
const ENQUIRY_STATUS = { new: 'Enquiry received', replied: 'We’ve replied by email', converted: 'Now a project', closed: 'Enquiry closed' };
function enquiryList(list) {
  if (!list.length) return '';
  const row = (e) => {
    const inner = `<div class="pcard-top"><span class="pcard-ref">${esc(e.ref)}</span><span class="badge">${esc(tr(ENQUIRY_STATUS[e.status] || e.status))}</span></div>
      <p class="pcard-loc">${tr('Sent {date}', { date: fmtDay(e.created_at) })}</p>`;
    return e.project_id ? `<a class="pcard" href="#/p/${esc(e.project_id)}">${inner}</a>` : `<div class="pcard">${inner}</div>`;
  };
  return `<h2 class="list-h">${tr('Your enquiries')}</h2><div class="pgrid">${list.map(row).join('')}</div>`;
}

async function detail(id) {
  if (id !== lastProjectId) { activeTab = 'overview'; lastProjectId = id; }
  const d = await store.getProject(id);
  document.title = `${d.project.name} | Brick & Pane`;
  const c = counts(d, 'client', user);
  const aud = audienceOf(user);
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/">${tr(aud === 'home' ? 'Orders' : 'Projects')}</a></li><li aria-current="page">${esc(d.project.ref)}</li></ol></nav>
      <div class="detail-head">
        <div><h1 class="app-h1">${esc(d.project.name)}</h1><p class="note">${esc(d.project.ref)} · ${esc(d.project.location)}</p></div>
      </div>
      <div class="detail-grid">
        <div>${nowCard(d.project, 'client', aud)}</div>
        <div>${pipeline(d.project, d.events, aud)}</div>
      </div>
      ${tabs(activeTab, c)}
      <div class="tabpanel" role="tabpanel" id="panel-${activeTab}" aria-labelledby="tab-${activeTab}">
        ${activeTab === 'documents' ? documentsPanel(d, 'client', user) : activeTab === 'changes' ? changesPanel(d, 'client', user) : activeTab === 'messages' ? messagesPanel(d, user) : activeTab === 'timeline' ? timelinePanel(d, 'client', aud) : overviewPanel(d, 'client', aud, user)}
      </div>
    </div>`;
  bindDetail(app, d, (t) => { activeTab = t; detail(id); });
}

const LAYOUTS = {
  'lift-slide': [['2A', '2 panels, 1 sliding'], ['3T', '3 panels, 3 tracks'], ['4C', '4 panels, centre'], ['6C', '6 panels, centre']],
  sliding: [['2A', '2 panels, 1 sliding'], ['2B', '2 panels, both sliding'], ['3T', '3 panels, 3 tracks'], ['4C', '4 panels, centre']],
  bifold: ['3+0', '4+0', '2+2', '5+0', '4+1', '3+2', '6+0', '3+3', '7+0', '4+3'].map((l) => [l, `${l} ${tr('leaves')}`]),
  hinged: [['S', 'Single door'], ['D', 'Double (French) door']],
  windows: [['', 'Not needed']],
  facades: [['', 'Not needed']],
  rooflights: [['', 'Not needed']],
};
const layoutOptions = (system, selected = '') => `<option value="">${system === 'windows' ? '—' : tr('Not sure')}</option>${(LAYOUTS[system] || []).filter(([v]) => v).map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(tr(l))}</option>`).join('')}`;

function openingRow(i) {
  return `<tr data-row>
    <td data-label="${tr('Ref')}"><input name="ref" aria-label="${tr('Reference')}" value="${i < 9 ? `D0${i + 1}` : `D${i + 1}`}"></td>
    <td data-label="${tr('System')}"><select name="system" aria-label="${tr('System')}">${Object.entries(SYSTEMS).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></td>
    <td data-label="${tr('Material')}"><select name="material" aria-label="${tr('Material')}"><option value="">${tr('Advise me')}</option>${Object.entries(MATERIALS).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></td>
    <td data-label="${tr('Width (mm)')}"><input name="width_mm" type="number" inputmode="numeric" min="300" max="30000" aria-label="${tr('Width (mm)')}" placeholder="mm"></td>
    <td data-label="${tr('Height (mm)')}"><input name="height_mm" type="number" inputmode="numeric" min="300" max="6000" aria-label="${tr('Height (mm)')}" placeholder="mm"></td>
    <td data-label="${tr('Layout')}"><select name="config" aria-label="${tr('Layout')}">${layoutOptions('lift-slide')}</select></td>
    <td data-label="${tr('Glazing')}"><select name="glazing" aria-label="${tr('Glazing')}"><option value="d">${tr('Double')}</option><option value="dl">${tr('Double lam.')}</option><option value="t">${tr('Triple')}</option><option value="tl">${tr('Triple lam.')}</option></select></td>
    <td data-label="${tr('Qty')}"><input name="qty" type="number" min="1" value="1" aria-label="${tr('Quantity')}"></td>
    <td class="est num" data-label="${tr('Panel weight')}" data-est>—</td>
    <td class="sched-remove"><button type="button" class="linkish" data-remove aria-label="${tr('Remove this opening')}">${tr('Remove')}</button></td>
  </tr>`;
}

function newProject() {
  const aud = audienceOf(user);
  const home = aud === 'home';
  document.title = `${tr(home ? 'Add your opening' : 'New project')} | Brick & Pane`;
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/">${tr(home ? 'Orders' : 'Projects')}</a></li><li aria-current="page">${tr(home ? 'Add your opening' : 'New project')}</li></ol></nav>
      <h1 class="app-h1">${tr(home ? 'Add your opening' : 'New project')}</h1>
      <p class="lead" style="margin-bottom:2rem">${tr(home ? 'Add the size of each opening. We’ll look at your project and prepare an individual quote.' : 'Fill in what you know. A sketch with dimensions is enough to start. You’ll see your project move through each stage here.')}</p>
      <form class="newp" novalidate>
        <section class="newp-sec"><h2 class="panel-h">${tr('Project')}</h2>
          <div class="field-row">
            <div class="field"><label for="np-name">${tr(home ? 'Give it a name' : 'Project name')}</label><input id="np-name" name="name" required placeholder="${tr(home ? 'e.g. Our kitchen extension' : 'e.g. Hartley Road rear extension')}"><span class="error"></span></div>
            <div class="field"><label for="np-loc">${tr(home ? 'Postcode' : 'Location')}</label><input id="np-loc" name="location" required placeholder="${tr(home ? 'e.g. E17' : 'Postcode or borough')}"><span class="error"></span></div>
          </div>
          <div class="field-row">
            <div class="field" ${home ? 'hidden' : ''}><label for="np-riba">${tr('RIBA stage')}</label><select id="np-riba" name="riba_stage"><option value="">${tr('Select')}</option>${opts(RIBA)}</select></div>
            <div class="field"><label for="np-bt">${tr('Building')}</label><select id="np-bt" name="building_type"><option value="">${tr('Select')}</option>${opts(BUILDINGS)}</select></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="np-start">${tr('Start on site')}</label><select id="np-start" name="start_window"><option value="">${tr('Select')}</option>${opts(STARTS)}</select></div>
            <div class="field"><label for="np-brief">${tr('What matters most?')}</label><input id="np-brief" name="brief" placeholder="${tr(home ? 'e.g. level floor to the garden, budget, timing' : 'Sightlines, flush threshold, budget, programme…')}"></div>
          </div>
        </section>
        <section class="newp-sec"><h2 class="panel-h">${tr(home ? 'Your openings' : 'Openings schedule')}</h2>
          <p class="note">${tr(home ? 'Measure the hole in the wall (width × height) in millimetres. Rough sizes are fine; we measure exactly at the survey. Not sure about panels? Leave it blank.' : 'Structural opening sizes. Pick a layout to see the estimated panel weight.')}</p>
          <div class="sched-tools">${home ? '' : `<label class="btn btn-sm btn-ghost" for="np-csv">${tr('Import CSV')}</label><input id="np-csv" type="file" accept=".csv,text/csv" class="visually-hidden"><a class="linkish" href="#" data-csv-template>${tr('Download CSV template')}</a>`}</div>
          <div style="overflow-x:auto"><table class="sched"><thead><tr><th>${tr('Ref')}</th><th>${tr('System')}</th><th>${tr('Material')}</th><th>${tr('Width (mm)')}</th><th>${tr('Height (mm)')}</th><th>${tr('Layout')}</th><th>${tr('Glazing')}</th><th>${tr('Qty')}</th><th>${tr('Panel weight')}</th><th></th></tr></thead><tbody data-rows>${openingRow(0)}</tbody></table></div>
          <button type="button" class="btn btn-sm btn-ghost" data-add style="margin-top:1rem">${tr('Add opening')}</button>
        </section>
        <section class="newp-sec"><h2 class="panel-h">${tr('Files')}</h2>
          <div class="field"><label for="np-files">${tr('Drawings, schedule or photos')}</label><input id="np-files" name="files" type="file" multiple accept=".pdf,.dwg,.dxf,.xlsx,.xls,.csv,.jpg,.jpeg,.png"><span class="hint">${tr('PDF, DWG, XLSX or images, up to 50 MB each.')}</span></div>
        </section>
        <div class="btn-row"><button class="btn" type="submit">${tr('Submit for review')}</button><a class="link-arrow" href="#/">${tr('Cancel')}</a></div>
      </form>
    </div>`;
  const f = $('.newp', app), rows = $('[data-rows]', f);
  const rowData = (row) => { const o = Object.fromEntries($$('input,select', row).map((el) => [el.name, el.value])); return { ...o, width_mm: +o.width_mm, height_mm: +o.height_mm, qty: +o.qty || 1 }; };
  const est = (row) => {
    const o = rowData(row);
    const e = o.system === 'lift-slide' ? estimatePanel(o) : null;
    $('[data-est]', row).innerHTML = e ? `${e.kg} kg${e.over ? ` <span class="tag tag-accent">${tr('check')}</span>` : ''}` : '—';
  };
  rows.addEventListener('input', (e) => { const row = e.target.closest('tr'); if (row) est(row); });
  rows.addEventListener('change', (e) => {
    if (e.target.name !== 'system') return;
    const row = e.target.closest('tr'); row.querySelector('[name="config"]').innerHTML = layoutOptions(e.target.value); est(row);
  });
  // CSV import: ref,system,width_mm,height_mm,config,glazing,qty
  const csv = $('#np-csv', f);
  csv?.addEventListener('change', async () => {
    const file = csv.files[0]; if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))).filter((c) => c.length > 2 && c.some(Boolean));
    const head = lines[0].map((h) => h.toLowerCase());
    const body = head.includes('width_mm') ? lines.slice(1) : lines;
    const col = (row, name, idx) => row[head.includes(name) ? head.indexOf(name) : idx] ?? '';
    const valid = body.filter((row) => +col(row, 'width_mm', 2) > 0 && +col(row, 'height_mm', 3) > 0);
    if (!valid.length) { toast(tr('No openings found. Use the template columns: ref, system, width_mm, height_mm, config, glazing, qty.')); return; }
    rows.innerHTML = '';
    valid.forEach((row, i) => {
      rows.insertAdjacentHTML('beforeend', openingRow(i));
      const tr2 = rows.lastElementChild;
      const sys = col(row, 'system', 1) in LAYOUTS ? col(row, 'system', 1) : 'lift-slide';
      tr2.querySelector('[name="ref"]').value = col(row, 'ref', 0) || tr2.querySelector('[name="ref"]').value;
      tr2.querySelector('[name="system"]').value = sys;
      tr2.querySelector('[name="config"]').innerHTML = layoutOptions(sys, col(row, 'config', 4));
      tr2.querySelector('[name="width_mm"]').value = col(row, 'width_mm', 2);
      tr2.querySelector('[name="height_mm"]').value = col(row, 'height_mm', 3);
      if (['d', 'dl', 't', 'tl'].includes(col(row, 'glazing', 5))) tr2.querySelector('[name="glazing"]').value = col(row, 'glazing', 5);
      tr2.querySelector('[name="qty"]').value = +col(row, 'qty', 6) || 1;
      if (col(row, 'material', 7) in MATERIALS) tr2.querySelector('[name="material"]').value = col(row, 'material', 7);
      est(tr2);
    });
    toast(tr('Imported {n} openings.', { n: valid.length }));
  });
  $('[data-csv-template]', f)?.addEventListener('click', (e) => {
    e.preventDefault();
    const blob = new Blob(['ref,system,width_mm,height_mm,config,glazing,qty,material\nD01,lift-slide,5600,2700,4C,t,1,alu\nD02,bifold,4800,2400,4+1,d,1,alu\nW01,windows,1200,1400,,t,2,timber\n'], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'openings-template.csv'; a.click(); URL.revokeObjectURL(a.href);
  });
  // Opening carried over from a sizing tool on the public site.
  try {
    const draft = JSON.parse(localStorage.getItem('bp-draft-opening') || 'null');
    if (draft) {
      const row = $('tr', rows);
      ['system', 'width_mm', 'height_mm', 'glazing'].forEach((k) => { if (draft[k] != null && row.querySelector(`[name="${k}"]`)) row.querySelector(`[name="${k}"]`).value = draft[k]; });
      row.querySelector('[name="config"]').innerHTML = layoutOptions(draft.system || 'lift-slide', draft.config || '');
      localStorage.removeItem('bp-draft-opening');
      est(row);
      toast(tr('We’ve added the opening from the sizing tool.'));
    }
  } catch { /* ignore */ }
  // Openings the visitor listed on the public site before signing in (js/openings-list.js).
  const listed = readList();
  if (listed.length) {
    const first = $('tr', rows);
    if (!first.querySelector('[name="width_mm"]').value) first.remove();
    listed.forEach((o) => {
      rows.insertAdjacentHTML('beforeend', openingRow(rows.children.length));
      const row = rows.lastElementChild;
      const set = (k, v) => { const el = row.querySelector(`[name="${k}"]`); if (el && v != null && v !== '') el.value = v; };
      ['ref', 'system', 'material', 'width_mm', 'height_mm', 'glazing', 'qty'].forEach((k) => set(k, o[k]));
      row.querySelector('[name="config"]').innerHTML = layoutOptions(o.system || 'lift-slide', o.config || '');
      if (o.note) row.dataset.note = o.note;
      est(row);
    });
    toast(tr(listed.length === 1 ? 'We’ve added the opening from your list.' : 'We’ve added {n} openings from your list.', { n: listed.length }));
  }
  rows.addEventListener('click', (e) => { if (e.target.closest('[data-remove]') && rows.children.length > 1) e.target.closest('tr').remove(); });
  $('[data-add]', f).addEventListener('click', () => rows.insertAdjacentHTML('beforeend', openingRow(rows.children.length)));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    let bad = null;
    ['name', 'location'].forEach((n) => { const el = f[n]; const field = el.closest('.field'); const miss = !el.value.trim(); field.classList.toggle('has-error', miss); $('.error', field).textContent = miss ? tr('Required.') : ''; if (miss && !bad) bad = el; });
    if (bad) { bad.focus(); return; }
    const files = [...f.files.files];
    if (files.some((x) => x.size > 50e6)) { toast(tr('Each file must be under 50 MB.')); return; }
    const openings = $$('tr', rows).map((row) => ({ ...Object.fromEntries($$('input,select', row).map((el) => [el.name, el.value])), notes: row.dataset.note || '' }))
      .filter((o) => o.width_mm && o.height_mm)
      .map((o) => ({ ...o, width_mm: +o.width_mm, height_mm: +o.height_mm, qty: +o.qty || 1 }));
    const data = Object.fromEntries(['name', 'location', 'riba_stage', 'building_type', 'start_window', 'brief'].map((k) => [k, f[k].value.trim()]));
    data.systems = [...new Set(openings.map((o) => o.system))];
    const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = tr('Submitting…');
    try { const id = await store.createProject(data, openings, files); clearList(); toast(tr(home ? 'Sent. We’ll prepare your individual quote.' : 'Submitted. We’ll confirm receipt.')); location.hash = `#/p/${id}`; }
    catch (err) { toast(tr(err.message)); btn.disabled = false; btn.textContent = tr('Submit for review'); }
  });
}

function settings() {
  document.title = `${tr('Settings')} | Brick & Pane`;
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/">${tr('Projects')}</a></li><li aria-current="page">${tr('Settings')}</li></ol></nav>
      <h1 class="app-h1">${tr('Settings')}</h1>
      <form class="settings" style="max-width:640px;display:grid;gap:1.2rem;margin-top:2rem">
        <div class="field-row">
          <div class="field"><label for="s-name">${tr('Name')}</label><input id="s-name" name="full_name" value="${esc(user.full_name)}"></div>
          <div class="field"><label for="s-co">${tr('Practice / company')}</label><input id="s-co" name="company" value="${esc(user.company)}"></div>
        </div>
        <div class="field"><label for="s-ph">${tr('Phone')} <span class="hint">${tr('optional')}</span></label><input id="s-ph" name="phone" type="tel" value="${esc(user.phone || '')}"></div>
        <fieldset class="field"><legend>${tr('Email notifications')}</legend>
          <label class="consent"><input type="checkbox" name="notify_email" ${user.notify_email ? 'checked' : ''}> <span>${tr('Email me when a project changes stage, a document is shared, an approval is needed or someone replies.')}</span></label>
          <label class="consent"><input type="checkbox" name="notify_digest" ${user.notify_digest ? 'checked' : ''}> <span>${tr('Send a weekly summary of all my projects as well.')}</span></label>
        </fieldset>
        <div><button class="btn" type="submit">${tr('Save')}</button></div>
      </form>
    </div>`;
  $('.settings', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.updateProfile({ full_name: f.full_name.value.trim(), company: f.company.value.trim(), phone: f.phone.value.trim(), notify_email: f.notify_email.checked, notify_digest: f.notify_digest.checked }); toast(tr('Saved.')); } catch (err) { toast(tr(err.message)); }
  });
}

let timer = null;
store.onChange(() => { clearTimeout(timer); timer = setTimeout(() => render(true), 120); });
addEventListener('hashchange', () => render());
render();
