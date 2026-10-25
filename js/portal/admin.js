// Internal CRM for Brick & Pane staff: pipeline board, list, enquiries from the public form, project control panel.
import { store } from './store.js';
import { STAGES, SIDE_STAGES, ALL_STAGES, PROSPECT_STAGES, PROSPECT_KINDS, prospectStage, prospectDue, DOC_KINDS, ACCOUNT_TYPES, SYSTEMS, stage, esc, fmtDate, fmtDay, fmtMoney, ago, stageBadge, courtLabel, isOverdue, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { route, renderAppBar, pipeline, nowCard, tabs, overviewPanel, documentsPanel, changesPanel, messagesPanel, timelinePanel, bindDetail, counts } from './ui.js';

const app = $('#app');
const bar = $('#appbar');
let user = null;
let activeTab = 'messages';
let lastId = null;
let query = '';
let reqFilter = 'open';
let kindFilter = '';
let dueCount = 0;

// Values the contact form stores in contact_requests (src/pages/contact.html).
const REQ_STATUS = { new: 'New', replied: 'Replied', converted: 'Now a project', closed: 'Closed', spam: 'Spam' };
const REQ_ROLES = { architect: 'Architect / designer', developer: 'Developer / contractor', homeowner: 'Homeowner', other: 'Other' };
const REQ_TOPICS = { quote: 'A quotation', review: 'A drawing / schedule review', budget: 'A quotation for a scheme', 'spec-pack': 'Technical files (old form)', samples: 'Samples', cpd: 'Training session (old form)', pqq: 'The pre-qualification pack', founding: 'A project for a case study', question: 'Just a question' };
const REQ_MATERIALS = { alu: 'Aluminium', timber: 'Timber', pvc: 'PVC', alutimber: 'Timber-aluminium', unsure: 'Not sure' };
const isOpenReq = (r) => r.status === 'new' || r.status === 'replied';
const listRequests = () => (store.listRequests ? store.listRequests().catch(() => []) : []);
const listProspects = () => (store.listProspects ? store.listProspects().catch(() => []) : []);

async function render(fromStore = false) {
  user = await store.getUser();
  if (!user) { location.href = `login.html?next=${encodeURIComponent('admin.html' + location.hash)}`; return; }
  if (user.role !== 'staff') { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr('This area is for Brick & Pane staff.'))} <a href="portal.html">${tr('Go to your projects')}</a>.</p></div>`; await renderAppBar(bar, user, 'portal'); return; }
  // A live update redraws the page: fields the user has changed keep their values (lists too), others refill empty ones.
  const keep = {}, dirty = new Set(); if (fromStore) $$('textarea[id], input[id], select[id]', app).forEach((el) => { if (el.type !== 'file' && el.type !== 'checkbox' && el.value) keep[el.id] = el.value; if (el.dataset.dirty) dirty.add(el.id); });
  const focused = document.activeElement?.id;
  await renderAppBar(bar, user, 'admin');
  const r = route();
  try {
    dueCount = (await listProspects()).filter(prospectDue).length;
    if (r.name === 'p' && r.id) await detail(r.id);
    else if (r.name === 'enquiries') await enquiries();
    else if (r.name === 'prospects') await prospects(r.id === 'list');
    else if (r.name === 'c' && r.id) await prospect(r.id);
    else await board(r.name === 'list');
  } catch (e) { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr(e.message))}</p></div>`; }
  Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el && (dirty.has(id) || (!el.value && el.tagName !== 'SELECT'))) { el.value = v; if (dirty.has(id)) el.dataset.dirty = '1'; } });
  if (focused) document.getElementById(focused)?.focus();
}

async function board(asList) {
  document.title = `${tr('Projects CRM')} | Brick & Pane`;
  const [all, requests] = await Promise.all([store.listProjects(), listRequests()]);
  const q = query.toLowerCase();
  const projects = q ? all.filter((p) => [p.ref, p.name, p.location, p.owner?.full_name, p.owner?.company].join(' ').toLowerCase().includes(q)) : all;
  const open = all.filter((p) => !['completed', 'closed'].includes(p.stage));
  const quoting = open.filter((p) => stage(p.stage).phase === 'Quotation');
  const sum = (arr, w = false) => arr.reduce((t, p) => t + (Number(p.internal?.value_gbp) || 0) * (w ? (p.internal?.probability ?? 0) / 100 : 1), 0);
  const card = (p) => `
    <a class="kcard ${isOverdue(p) ? 'is-overdue' : ''}" href="#/p/${esc(p.id)}">
      <span class="kcard-ref">${esc(p.ref)}</span>
      <span class="kcard-name">${esc(p.name)}</span>
      <span class="kcard-client">${esc(p.owner?.company || p.owner?.full_name || '')}${p.owner?.account_type === 'homeowner' ? ` <span class="tag">${tr('homeowner')}</span>` : ''}</span>
      <span class="kcard-foot"><span>${p.internal?.value_gbp ? fmtMoney(p.internal.value_gbp) : '—'}</span><span>${isOverdue(p) ? tr('Overdue {date}', { date: fmtDay(p.due_at) }) : p.due_at && stage(p.stage).court === 'us' ? tr('Due {date}', { date: fmtDay(p.due_at) }) : courtLabel(p.stage, 'staff')}</span></span>
    </a>`;
  app.innerHTML = `
    <div class="container-wide section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${tr('Internal')}</span><h1 class="app-h1">${tr('Pipeline')}</h1></div>
        <dl class="stats">
          <div class="stat ${open.filter(isOverdue).length ? 'is-you' : ''}"><dt>${tr('Overdue (with us)')}</dt><dd>${open.filter(isOverdue).length}</dd></div>
          <div class="stat"><dt>${tr('With us')}</dt><dd>${open.filter((p) => stage(p.stage).court === 'us').length}</dd></div>
          <div class="stat"><dt>${tr('Waiting on client')}</dt><dd>${open.filter((p) => stage(p.stage).court === 'you').length}</dd></div>
          <div class="stat"><dt>${tr('Quotes in play')}</dt><dd>${fmtMoney(sum(quoting))}</dd></div>
          <div class="stat"><dt>${tr('Weighted')}</dt><dd>${fmtMoney(sum(quoting, true))}</dd></div>
        </dl>
      </div>
      <div class="board-tools">
        ${viewSwitch(asList ? 'list' : 'board', requests)}
        <label class="visually-hidden" for="crm-q">${tr('Search projects')}</label>
        <input id="crm-q" type="search" placeholder="${tr('Search ref, name, client, location')}" value="${esc(query)}">
      </div>
      ${asList ? `
        <div style="overflow-x:auto"><table class="spec spec-compact crm-table"><thead><tr><th scope="col">${tr('Ref')}</th><th scope="col">${tr('Project')}</th><th scope="col">${tr('Client')}</th><th scope="col">${tr('Stage')}</th><th scope="col">${tr('Owner')}</th><th scope="col">${tr('Due')}</th><th scope="col">${tr('Value')}</th><th scope="col">${tr('Updated')}</th></tr></thead><tbody>
          ${projects.map((p) => `<tr class="${isOverdue(p) ? 'is-overdue' : ''}"><th scope="row"><a href="#/p/${esc(p.id)}">${esc(p.ref)}</a></th><td>${esc(p.name)}</td><td>${esc(p.owner?.company || p.owner?.full_name || '')}</td><td>${stageBadge(p.stage, 'staff')}</td><td>${esc(p.assignee?.full_name || '—')}</td><td>${p.due_at ? fmtDay(p.due_at) : '—'}</td><td>${fmtMoney(p.internal?.value_gbp)}</td><td>${ago(p.updated_at)}</td></tr>`).join('')}
        </tbody></table></div>`
      : `<div class="board">${[...STAGES, ...SIDE_STAGES].filter((s) => s.id !== 'closed' || projects.some((p) => p.stage === 'closed')).map((s) => {
          const items = projects.filter((p) => p.stage === s.id);
          return `<section class="col ${s.court === 'you' ? 'col-you' : ''} ${items.length ? '' : 'col-empty'}" aria-label="${esc(tr(s.staffLabel || s.label))}"><h2 class="col-h">${esc(tr(s.staffLabel || s.label))} <span>${items.length}</span></h2>${items.map(card).join('')}</section>`;
        }).join('')}</div>`}
    </div>`;
  const qi = $('#crm-q', app);
  qi.addEventListener('input', () => { query = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => board(asList).then(() => { const n = $('#crm-q', app); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 200); });
}

function viewSwitch(on, requests) {
  const fresh = requests.filter((r) => r.status === 'new').length;
  const link = (id, href, label) => `<a href="${href}" class="${on === id ? 'is-on' : ''}">${label}</a>`;
  return `<div class="seg" role="group" aria-label="${tr('View')}">${link('board', '#/', tr('Board'))}${link('list', '#/list', tr('List'))}${link('enquiries', '#/enquiries', `${tr('Enquiries')}${fresh ? ` <span class="seg-count">${fresh}</span>` : ''}`)}${store.listProspects ? link('prospects', '#/prospects', `${tr('Prospects')}${dueCount ? ` <span class="seg-count" title="${tr('Follow-ups due')}">${dueCount}</span>` : ''}`) : ''}</div>`;
}

async function enquiries() {
  document.title = `${tr('Enquiries')} | CRM`;
  const all = await listRequests();
  const q = query.toLowerCase();
  const shown = all
    .filter((r) => (reqFilter === 'open' ? isOpenReq(r) : reqFilter === 'all' || r.status === reqFilter))
    .filter((r) => !q || [r.ref, r.name, r.email, r.company, r.location, r.phone].join(' ').toLowerCase().includes(q));
  const row = (label, value) => (value ? `<tr><th scope="row">${esc(tr(label))}</th><td>${value}</td></tr>` : '');
  const list = (arr, map) => (arr || []).map((v) => esc(tr(map[v] || (v === 'unsure' ? 'Not sure' : v)))).join(', ');
  const item = (r) => `
    <details class="enq${r.status === 'new' ? ' is-new' : ''}" data-req="${esc(r.id)}">
      <summary>
        <span class="enq-ref">${esc(r.ref)}</span>
        <span class="enq-name">${esc(r.name)}${r.company ? `, ${esc(r.company)}` : ''}</span>
        <span class="enq-meta">${esc(tr(REQ_ROLES[r.role] || r.role || ''))}${r.topic ? ` · ${esc(tr(REQ_TOPICS[r.topic] || r.topic))}` : ''}</span>
        <span class="enq-foot"><span class="badge">${esc(tr(REQ_STATUS[r.status] || r.status))}</span> <span>${ago(r.created_at)}</span></span>
      </summary>
      <div class="enq-body">
        <table class="spec spec-compact"><tbody>
          ${row('Received', esc(fmtDate(r.created_at, true)))}
          ${row('Email', `<a href="mailto:${esc(r.email)}?subject=${encodeURIComponent(r.ref)}">${esc(r.email)}</a>`)}
          ${row('Phone', r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '')}
          ${row('Location', esc(r.location || ''))}
          ${row('Products', list(r.systems, SYSTEMS))}
          ${row('Material', list(r.material, REQ_MATERIALS))}
          ${row('Opening', r.opening_width_mm && r.opening_height_mm ? `${r.opening_width_mm} × ${r.opening_height_mm} mm` : '')}
          ${row('RIBA stage', esc(r.riba_stage || ''))}
          ${row('Building', esc(tr(r.building || '')))}
          ${row('Units', esc(r.units || ''))}
          ${row('Start on site', esc(tr(r.start || '')))}
          ${row('Language', r.lang === 'pl' ? 'Polski' : 'English')}
        </tbody></table>
        ${r.openings?.length ? `<div class="table-scroll"><table class="spec spec-compact"><caption>${tr('Openings')} (${r.openings.reduce((n, o) => n + (o.qty || 1), 0)})</caption><thead><tr><th scope="col">${tr('Ref')}</th><th scope="col">${tr('Product')}</th><th scope="col">${tr('Material')}</th><th scope="col">${tr('Size')}</th><th scope="col">${tr('Qty')}</th><th scope="col">${tr('Note')}</th></tr></thead><tbody>
          ${r.openings.map((o) => `<tr><th scope="row">${esc(o.ref || '')}</th><td>${esc(tr(SYSTEMS[o.system] || o.system || ''))}</td><td>${esc(tr(REQ_MATERIALS[o.material] || 'Not sure'))}</td><td>${o.width_mm || '?'} × ${o.height_mm || '?'} mm</td><td>${o.qty || 1}</td><td>${esc(o.note || '')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
        ${r.message ? `<p class="enq-msg">${esc(r.message)}</p>` : ''}
        <p class="enq-convert">${r.project_id
          ? `<a class="btn btn-sm btn-ghost" href="#/p/${esc(r.project_id)}">${tr('Open the project')}</a>`
          : `<button type="button" class="btn btn-sm" data-req-convert>${tr('Turn into a project')}</button> <span class="note">${tr('Copies the details and openings into a portal project. Without an account on this email, the client becomes its owner when they sign up with it.')}</span>`}</p>
        ${r.files?.length || r.files_link ? `<p class="enq-files">${(r.files || []).map((f) => `<button type="button" class="btn btn-sm btn-ghost" data-req-file="${esc(f)}">${esc(f.split('/').pop())}</button>`).join(' ')}${r.files_link ? ` <a href="${esc(r.files_link)}" target="_blank" rel="noopener noreferrer">${tr('Link to larger files')}</a>` : ''}</p>` : ''}
        <form class="ctl" data-req-form>
          <div class="field"><label for="rq-status-${esc(r.id)}">${tr('Status')}</label><select id="rq-status-${esc(r.id)}" name="status">${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
          <div class="field"><label for="rq-note-${esc(r.id)}">${tr('Team note')} <span class="tag">${tr('staff only')}</span></label><textarea id="rq-note-${esc(r.id)}" name="staff_note" rows="2">${esc(r.staff_note || '')}</textarea></div>
          <button class="btn btn-sm" type="submit">${tr('Save')}</button>
        </form>
      </div>
    </details>`;
  const openIds = new Set($$('details.enq[open]', app).map((d) => d.dataset.req));
  app.innerHTML = `
    <div class="container section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${tr('Internal')}</span><h1 class="app-h1">${tr('Enquiries')}</h1></div>
        <dl class="stats">
          <div class="stat ${all.some((r) => r.status === 'new') ? 'is-you' : ''}"><dt>${tr('New')}</dt><dd>${all.filter((r) => r.status === 'new').length}</dd></div>
          <div class="stat"><dt>${tr('Replied')}</dt><dd>${all.filter((r) => r.status === 'replied').length}</dd></div>
        </dl>
      </div>
      <p class="note mb-m">${tr('Requests sent through the website form, with or without an account.')}</p>
      <div class="board-tools">
        ${viewSwitch('enquiries', all)}
        <label class="visually-hidden" for="rq-filter">${tr('Show')}</label>
        <select id="rq-filter"><option value="open">${tr('Open (new and replied)')}</option><option value="all">${tr('All')}</option>${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select>
        <label class="visually-hidden" for="crm-q">${tr('Search enquiries')}</label>
        <input id="crm-q" type="search" placeholder="${tr('Search ref, name, email, location')}" value="${esc(query)}">
      </div>
      ${shown.length ? `<div class="enq-list">${shown.map(item).join('')}</div>` : `<p class="callout">${tr(all.length ? 'No enquiries match.' : 'No enquiries yet.')}</p>`}
    </div>`;
  openIds.forEach((id) => { const d = $$('details.enq', app).find((x) => x.dataset.req === id); if (d) d.open = true; });
  const sel = $('#rq-filter', app); sel.value = reqFilter;
  sel.addEventListener('change', () => { reqFilter = sel.value; enquiries(); });
  const qi = $('#crm-q', app);
  qi.addEventListener('input', () => { query = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => enquiries().then(() => { const n = $('#crm-q', app); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 200); });
  $$('[data-req-form]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await store.updateRequest(f.closest('[data-req]').dataset.req, { status: f.status.value, staff_note: f.staff_note.value.trim() }); toast(tr('Saved.')); await enquiries(); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-req-convert]', app).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const pid = await store.convertRequest(b.closest('[data-req]').dataset.req); toast(tr('Project created.')); location.hash = `#/p/${pid}`; } catch (err) { b.disabled = false; toast(tr(err.message)); }
  }));
  $$('[data-req-file]', app).forEach((b) => b.addEventListener('click', async () => {
    try { const url = await store.requestFileUrl(b.dataset.reqFile); if (url) open(url, '_blank', 'noopener'); else toast(tr('Files are not stored in demo mode.')); } catch (err) { toast(tr(err.message)); }
  }));
}

async function detail(id) {
  if (id !== lastId) { activeTab = 'messages'; lastId = id; }
  const [d, staff] = await Promise.all([store.getProject(id), store.listStaff()]);
  const p = d.project;
  document.title = `${p.ref} · ${p.name} | CRM`;
  const nextIdx = STAGES.findIndex((s) => s.id === p.stage) + 1;
  const suggested = STAGES[nextIdx]?.id || p.stage;
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/">${tr('Pipeline')}</a></li><li aria-current="page">${esc(p.ref)}</li></ol></nav>
      <div class="detail-head">
        <div><h1 class="app-h1">${esc(p.name)}</h1><p class="note">${esc(p.ref)} · ${esc(p.location)} · ${esc(p.owner?.full_name || '')}${p.owner?.company ? `, ${esc(p.owner.company)}` : ''}${p.owner?.account_type ? ` · ${esc(tr(ACCOUNT_TYPES[p.owner.account_type] || ''))}` : ''}</p></div>
      </div>
      <div class="crm-grid">
        <div class="crm-main">
          ${nowCard(p, 'staff')}
          ${pipeline(p, d.events, 'staff')}
          ${tabs(activeTab, counts(d, 'staff', user))}
          <div class="tabpanel" role="tabpanel" id="panel-${activeTab}" aria-labelledby="tab-${activeTab}">
            ${activeTab === 'documents' ? documentsPanel(d, 'staff', user) : activeTab === 'changes' ? changesPanel(d, 'staff', user) : activeTab === 'messages' ? messagesPanel(d, user) : activeTab === 'timeline' ? timelinePanel(d, 'staff') : overviewPanel(d, 'staff', 'staff', user)}
          </div>
        </div>
        <aside class="crm-side">
          <form class="ctl" data-stage novalidate>
            <h2 class="panel-h">${tr('Move stage')}</h2>
            <div class="field"><label for="ctl-stage">${tr('New stage')}</label><select id="ctl-stage" name="stage" required><option value="">${tr('Choose the new stage…')}</option>${ALL_STAGES.filter((s) => s.id !== p.stage).map((s) => `<option value="${s.id}">${esc(tr(s.staffLabel || s.label))}${s.id === suggested ? ` ${tr('(next)')}` : ''}</option>`).join('')}</select><span class="hint">${tr('Current:')} ${esc(tr(stage(p.stage).staffLabel || stage(p.stage).label))}</span></div>
            <div class="field"><label for="ctl-note">${tr('Note to client')}</label><textarea id="ctl-note" name="note" rows="2" placeholder="${tr('e.g. Quotation Q1 is in Documents.')}"></textarea></div>
            <div class="field"><label for="ctl-next">${tr('Next step (shown to client)')}</label><input id="ctl-next" name="next_step" value="${esc(p.next_step || '')}"></div>
            <div class="field"><label for="ctl-due">${tr('Next update by')}</label><input id="ctl-due" name="due" type="date"><span class="hint">${tr('Blank = no date.')}</span></div>
            <label class="consent"><input type="checkbox" name="visible" checked> <span>${tr('Visible to client and notify them')}</span></label>
            <button class="btn btn-sm" type="submit">${tr('Update stage')}</button>
          </form>

          <form class="ctl" data-dates>
            <h2 class="panel-h">${tr('Delivery & fitting')}</h2>
            <div class="field-row">
              <div class="field"><label for="ctl-del">${tr('Delivery')}</label><input id="ctl-del" name="delivery" type="date" value="${p.delivery_at ? p.delivery_at.slice(0, 10) : ''}"></div>
              <div class="field"><label for="ctl-ins">${tr('Fitting')}</label><input id="ctl-ins" name="install" type="date" value="${p.install_at ? p.install_at.slice(0, 10) : ''}"></div>
            </div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save & notify client')}</button>
          </form>

          <form class="ctl" data-payment>
            <h2 class="panel-h">${tr('Payment schedule')}</h2>
            <div class="field"><label for="pay-label">${tr('Stage')}</label><input id="pay-label" name="label" placeholder="${tr('e.g. Deposit')}" required></div>
            <div class="field-row">
              <div class="field"><label for="pay-amt">${tr('Amount (£)')}</label><input id="pay-amt" name="amount" type="number" min="0" step="1" required></div>
              <div class="field"><label for="pay-due">${tr('Due')}</label><input id="pay-due" name="due" type="date"></div>
            </div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Add payment')}</button>
          </form>

          <form class="ctl" data-assign>
            <h2 class="panel-h">${tr('Owner')}</h2>
            <div class="field"><label for="ctl-owner" class="visually-hidden">${tr('Owner')}</label><select id="ctl-owner" name="assignee_id"><option value="">${tr('Unassigned')}</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === p.assignee_id ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save owner')}</button>
          </form>

          <form class="ctl" data-doc>
            <h2 class="panel-h">${tr('Share a document')}</h2>
            <div class="field"><label for="ctl-file">${tr('File')}</label><input id="ctl-file" name="file" type="file" required></div>
            <div class="field-row">
              <div class="field"><label for="ctl-kind">${tr('Type')}</label><select id="ctl-kind" name="kind">${Object.entries(DOC_KINDS).filter(([k]) => k !== 'client_upload').map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></div>
              <div class="field"><label for="ctl-ver">${tr('Version')}</label><input id="ctl-ver" name="version" placeholder="Q1 / Rev A"></div>
            </div>
            <div class="field"><label for="ctl-title">${tr('Title')}</label><input id="ctl-title" name="title" placeholder="${tr('Defaults to file name')}"></div>
            <div class="field"><label for="ctl-amt">${tr('Quotation amount (£, ex VAT)')}</label><input id="ctl-amt" name="amount" type="number" min="0" step="1" placeholder="${tr('For quotations')}"></div>
            <label class="consent"><input type="checkbox" name="approval"> <span>${tr('Ask the client to approve')}</span></label>
            <label class="consent"><input type="checkbox" name="visible" checked> <span>${tr('Visible to client')}</span></label>
            <button class="btn btn-sm" type="submit">${tr('Upload & notify')}</button>
          </form>

          <form class="ctl" data-internal>
            <h2 class="panel-h">${tr('Commercial')} <span class="tag">${tr('staff only')}</span></h2>
            <div class="field-row">
              <div class="field"><label for="ctl-val">${tr('Value (£)')}</label><input id="ctl-val" name="value_gbp" type="number" min="0" step="100" value="${esc(d.internal?.value_gbp ?? '')}"></div>
              <div class="field"><label for="ctl-prob">${tr('Probability (%)')}</label><input id="ctl-prob" name="probability" type="number" min="0" max="100" step="5" value="${esc(d.internal?.probability ?? '')}"></div>
            </div>
            <div class="field"><label for="ctl-notes">${tr('Notes')}</label><textarea id="ctl-notes" name="notes" rows="3">${esc(d.internal?.notes || '')}</textarea></div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save')}</button>
          </form>
        </aside>
      </div>
    </div>`;

  bindDetail(app, d, (t) => { activeTab = t; detail(id); });
  $('[data-stage]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.stage.value) { f.stage.focus(); toast(tr('Choose the new stage first.')); return; }
    const due = f.due.value ? new Date(`${f.due.value}T17:00:00`).toISOString() : null;
    try { await store.setStage(id, f.stage.value, { note: f.note.value.trim(), visible: f.visible.checked, next_step: f.next_step.value.trim(), due_at: due }); toast(tr(f.visible.checked ? 'Stage updated. Client notified.' : 'Stage updated (hidden from client).')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-assign]', app).addEventListener('submit', async (e) => { e.preventDefault(); try { await store.updateProject(id, { assignee_id: e.currentTarget.assignee_id.value || null }); toast(tr('Owner saved.')); } catch (err) { toast(tr(err.message)); } });
  $('[data-doc]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; const file = f.file.files[0]; if (!file) return;
    try { await store.uploadFiles(id, [file], { kind: f.kind.value, version: f.version.value.trim(), title: f.title.value.trim(), amount: f.amount.value, approval: f.approval.checked, visible: f.visible.checked }); toast(tr(f.visible.checked ? 'Shared. Client notified.' : 'Uploaded (internal).')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-dates]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    const iso = (v) => (v ? new Date(`${v}T09:00:00`).toISOString() : null);
    try { await store.updateProject(id, { delivery_at: iso(f.delivery.value), install_at: iso(f.install.value) }); toast(tr('Dates saved. Client notified.')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-payment]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.addPayment(id, { label: f.label.value.trim(), amount: f.amount.value, due_date: f.due.value ? new Date(`${f.due.value}T09:00:00`).toISOString() : null }); f.reset(); toast(tr('Payment added.')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-internal]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.updateInternal(id, { value_gbp: f.value_gbp.value === '' ? null : +f.value_gbp.value, probability: f.probability.value === '' ? null : +f.probability.value, notes: f.notes.value }); toast(tr('Saved.')); } catch (err) { toast(tr(err.message)); }
  });
}

/* ---------- prospects: architects and companies we want to work with (migration 0014) ---------- */
const prospectSearch = (c) => [c.company, c.contact_name, c.email, c.area, c.source, c.next_step].join(' ').toLowerCase();
const prospectFoot = (c) => (c.next_at ? (prospectDue(c) ? tr('Follow up {date}', { date: fmtDay(c.next_at) }) : tr('Next {date}', { date: fmtDay(c.next_at) })) : ago(c.updated_at));

async function prospects(asList) {
  document.title = `${tr('Prospects')} | CRM`;
  const [all, requests] = await Promise.all([listProspects(), listRequests()]);
  const q = query.toLowerCase();
  const shown = all.filter((c) => (!kindFilter || c.kind === kindFilter) && (!q || prospectSearch(c).includes(q)));
  const inStage = (id) => all.filter((c) => c.stage === id).length;
  const card = (c) => `
    <a class="kcard ${prospectDue(c) ? 'is-overdue' : ''}" href="#/c/${esc(c.id)}">
      <span class="kcard-ref">${esc(tr(PROSPECT_KINDS[c.kind] || c.kind))}</span>
      <span class="kcard-name">${esc(c.company)}</span>
      <span class="kcard-client">${esc([c.contact_name, c.area].filter(Boolean).join(' · '))}</span>
      ${c.next_step ? `<span class="kcard-client">${esc(c.next_step)}</span>` : ''}
      <span class="kcard-foot"><span>${esc(c.source || '')}</span><span>${prospectFoot(c)}</span></span>
    </a>`;
  app.innerHTML = `
    <div class="container-wide section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${tr('Internal')}</span><h1 class="app-h1">${tr('Prospects')}</h1></div>
        <dl class="stats">
          <div class="stat ${dueCount ? 'is-you' : ''}"><dt>${tr('Follow-ups due')}</dt><dd>${dueCount}</dd></div>
          <div class="stat"><dt>${tr('To contact')}</dt><dd>${inStage('to_contact')}</dd></div>
          <div class="stat"><dt>${tr('In conversation')}</dt><dd>${inStage('contacted') + inStage('talking')}</dd></div>
          <div class="stat"><dt>${tr('Working together')}</dt><dd>${inStage('first_project') + inStage('partner')}</dd></div>
        </dl>
      </div>
      <p class="note mb-m">${tr('Architects and companies we want to start working with. Only the team sees this.')}</p>
      <div class="board-tools">
        ${viewSwitch('prospects', requests)}
        <div class="seg" role="group" aria-label="${tr('Layout')}"><a href="#/prospects" class="${asList ? '' : 'is-on'}">${tr('Funnel')}</a><a href="#/prospects/list" class="${asList ? 'is-on' : ''}">${tr('List')}</a></div>
        <label class="visually-hidden" for="pr-kind">${tr('Type')}</label>
        <select id="pr-kind"><option value="">${tr('All types')}</option>${Object.entries(PROSPECT_KINDS).map(([k, v]) => `<option value="${k}" ${k === kindFilter ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select>
        <label class="visually-hidden" for="crm-q">${tr('Search prospects')}</label>
        <input id="crm-q" type="search" placeholder="${tr('Search company, person, area')}" value="${esc(query)}">
        <a class="btn btn-sm" href="#/c/new">${tr('Add a company')}</a>
      </div>
      ${!all.length ? `<p class="callout">${tr('No companies yet. Add the first one with “Add a company”.')}</p>`
      : asList ? `
        <div style="overflow-x:auto"><table class="spec spec-compact crm-table"><thead><tr><th scope="col">${tr('Company')}</th><th scope="col">${tr('Type')}</th><th scope="col">${tr('Contact')}</th><th scope="col">${tr('Status')}</th><th scope="col">${tr('Area')}</th><th scope="col">${tr('Next step')}</th><th scope="col">${tr('Updated')}</th></tr></thead><tbody>
          ${shown.map((c) => `<tr class="${prospectDue(c) ? 'is-overdue' : ''}"><th scope="row"><a href="#/c/${esc(c.id)}">${esc(c.company)}</a></th><td>${esc(tr(PROSPECT_KINDS[c.kind] || c.kind))}</td><td>${esc(c.contact_name)}${c.email ? `<br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</td><td><span class="badge">${esc(tr(prospectStage(c.stage).label))}</span></td><td>${esc(c.area)}</td><td>${esc(c.next_step)}${c.next_at ? ` <span class="note">${fmtDay(c.next_at)}</span>` : ''}</td><td>${ago(c.updated_at)}</td></tr>`).join('')}
        </tbody></table></div>`
      : `<div class="board">${PROSPECT_STAGES.filter((s) => s.id !== 'not_now' || shown.some((c) => c.stage === 'not_now')).map((s) => {
          const items = shown.filter((c) => c.stage === s.id);
          return `<section class="col ${items.length ? '' : 'col-empty'}" aria-label="${esc(tr(s.label))}"><h2 class="col-h">${esc(tr(s.label))} <span>${items.length}</span></h2>${items.map(card).join('')}</section>`;
        }).join('')}</div>`}
    </div>`;
  // Debounced search: redraw whichever prospects view is open by then, or nothing if the user has moved on.
  const again = () => { const r = route(); if (r.name !== 'prospects') return; prospects(r.id === 'list').then(() => { const n = $('#crm-q', app); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }); };
  const qi = $('#crm-q', app);
  qi.addEventListener('input', () => { query = qi.value; clearTimeout(qi._t); qi._t = setTimeout(again, 200); });
  $('#pr-kind', app).addEventListener('change', (e) => { kindFilter = e.target.value; prospects(asList); });
}

// Enquiries from the same address, or from the same company domain (not for gmail.com and the like).
const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|btinternet|sky|virginmedia|proton|protonmail)\./i;
const sameSender = (c, r) => {
  const a = (c.email || '').toLowerCase(), b = (r.email || '').toLowerCase();
  if (!a || !b) return false;
  return a === b || (!FREE_MAIL.test(a) && a.split('@')[1] === b.split('@')[1]);
};

async function prospect(id) {
  const isNew = id === 'new';
  const [all, staff, requests] = await Promise.all([listProspects(), store.listStaff(), listRequests()]);
  const c = isNew ? { kind: 'architect', stage: 'to_contact', log: [] } : all.find((x) => x.id === id);
  if (!c) { app.innerHTML = `<div class="container section-tight"><p class="callout">${tr('This company is no longer on the list.')} <a href="#/prospects">${tr('Back to prospects')}</a></p></div>`; return; }
  document.title = `${isNew ? tr('Add a company') : c.company} | CRM`;
  const related = isNew ? [] : requests.filter((r) => sameSender(c, r));
  const f = (name, label, type = 'text', extra = '') => `<div class="field"><label for="pr-${name}">${tr(label)}</label><input id="pr-${name}" name="${name}" type="${type}" value="${esc(c[name] || '')}" ${extra}></div>`;
  const stageField = `<div class="field"><label for="pr-stage">${tr('Status')}</label><select id="pr-stage" name="stage">${PROSPECT_STAGES.map((s) => `<option value="${s.id}" ${s.id === c.stage ? 'selected' : ''}>${esc(tr(s.label))}</option>`).join('')}</select></div>`;
  const ownerField = `<div class="field"><label for="pr-owner">${tr('Owner')}</label><select id="pr-owner" name="owner_id"><option value="">${tr('Unassigned')}</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === c.owner_id ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></div>`;
  const nextFields = `${f('next_step', 'Next step', 'text', `maxlength="500" placeholder="${tr('e.g. Send the intro email')}"`)}${f('next_at', 'When', 'date')}`;
  const details = `
    ${f('company', 'Company', 'text', 'required maxlength="200"')}
    <div class="field"><label for="pr-kind-f">${tr('Type')}</label><select id="pr-kind-f" name="kind">${Object.entries(PROSPECT_KINDS).map(([k, v]) => `<option value="${k}" ${k === c.kind ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
    <div class="field-row">${f('contact_name', 'Contact person', 'text', 'maxlength="200"')}${f('contact_role', 'Their role', 'text', 'maxlength="200"')}</div>
    <div class="field-row">${f('email', 'Email', 'email', 'maxlength="320"')}${f('phone', 'Phone', 'tel', 'maxlength="50"')}</div>
    ${f('website', 'Website', 'text', 'maxlength="500" inputmode="url" autocomplete="off" placeholder="www."')}
    <div class="field-row">${f('area', 'Area', 'text', `maxlength="200" placeholder="${tr('e.g. Hackney, E8')}"`)}${f('source', 'Where we found them', 'text', `maxlength="200" placeholder="${tr('e.g. Instagram, recommendation')}"`)}</div>
    <div class="field"><label for="pr-notes">${tr('Notes')}</label><textarea id="pr-notes" name="notes" rows="3" maxlength="10000">${esc(c.notes || '')}</textarea></div>`;
  const crumbs = `<nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/prospects">${tr('Prospects')}</a></li><li aria-current="page">${esc(isNew ? tr('Add a company') : c.company)}</li></ol></nav>`;
  const row = (label, value) => (value ? `<tr><th scope="row">${esc(tr(label))}</th><td>${value}</td></tr>` : '');

  app.innerHTML = isNew ? `
    <div class="container section-tight">
      ${crumbs}
      <h1 class="app-h1">${tr('Add a company')}</h1>
      <form class="ctl prospect-new" data-prospect-form novalidate>
        ${details}
        <div class="field-row">${stageField}${ownerField}</div>
        <div class="field-row">${nextFields}</div>
        <div class="btn-row"><button class="btn" type="submit">${tr('Save')}</button><a class="btn btn-ghost" href="#/prospects">${tr('Cancel')}</a></div>
      </form>
    </div>` : `
    <div class="container section-tight">
      ${crumbs}
      <div class="detail-head">
        <div><h1 class="app-h1">${esc(c.company)}</h1><p class="note">${esc([tr(PROSPECT_KINDS[c.kind] || c.kind), c.area, c.contact_name].filter(Boolean).join(' · '))}</p></div>
      </div>
      <div class="crm-grid">
        <div class="crm-main">
          <section class="now-card ${prospectDue(c) ? 'is-you' : ''}" aria-label="${tr('Current status')}">
            <div class="now-head"><span class="badge">${esc(tr(prospectStage(c.stage).label))}</span>${prospectDue(c) ? `<span class="court court-you">${tr('Follow-up due')}</span>` : ''}</div>
            <p class="now-text">${c.next_step ? esc(c.next_step) : tr('No next step set.')}</p>
            <ul class="proof-list">
              ${c.next_at ? `<li><span>${tr('When')}</span><span>${fmtDay(c.next_at)}</span></li>` : ''}
              <li><span>${tr('Owner')}</span><span>${esc(staff.find((s) => s.id === c.owner_id)?.full_name || tr('Unassigned'))}</span></li>
              <li><span>${tr('Updated')}</span><span>${ago(c.updated_at)}</span></li>
            </ul>
          </section>
          <table class="spec spec-compact mt-m"><tbody>
            ${row('Contact person', esc([c.contact_name, c.contact_role].filter(Boolean).join(', ')))}
            ${row('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
            ${row('Phone', c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '')}
            ${row('Website', c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">${esc(c.website.replace(/^https?:\/\//, ''))}</a>` : '')}
            ${row('Where we found them', esc(c.source || ''))}
            ${row('Added', esc(fmtDate(c.created_at)))}
          </tbody></table>
          ${c.notes ? `<p class="enq-msg">${esc(c.notes)}</p>` : ''}
          ${related.length ? `<h2 class="panel-h mt-m">${tr('Enquiries from this company')}</h2><ul class="prospect-related">${related.map((r) => `<li><button type="button" class="linkish" data-open-enq="${esc(r.ref)}">${esc(r.ref)}</button> · ${esc(r.name)} · ${ago(r.created_at)}</li>`).join('')}</ul>` : ''}
          <h2 class="panel-h mt-m">${tr('Contact history')}</h2>
          <form class="ctl" data-prospect-note>
            <div class="field"><label for="pr-log">${tr('What happened')}</label><textarea id="pr-log" name="text" rows="2" maxlength="2000" required placeholder="${tr('e.g. Call: they have two extensions at stage 3. Offer a drawing review.')}"></textarea></div>
            <button class="btn btn-sm" type="submit">${tr('Add to history')}</button>
          </form>
          ${c.log?.length ? `<ol class="timeline">${c.log.map((e) => `
            <li><span class="tl-date">${fmtDate(e.at, true)}</span>
              <span class="tl-body">${e.stage ? `<span class="badge">${esc(tr(prospectStage(e.stage).label))}</span>` : ''}${e.text ? `<span class="tl-note">${esc(e.text)}</span>` : ''}<span class="tl-actor">${esc(e.by || '')}</span></span></li>`).join('')}</ol>`
          : `<p class="note">${tr('Nothing recorded yet.')}</p>`}
        </div>
        <aside class="crm-side">
          <form class="ctl" data-prospect-status>
            <h2 class="panel-h">${tr('Status and next step')}</h2>
            ${stageField}${nextFields}${ownerField}
            <button class="btn btn-sm" type="submit">${tr('Save')}</button>
          </form>
          <form class="ctl" data-prospect-form novalidate>
            <h2 class="panel-h">${tr('Company details')}</h2>
            ${details}
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save')}</button>
          </form>
          <div class="ctl"><button type="button" class="btn btn-sm btn-ghost" data-prospect-delete>${tr('Delete this company')}</button></div>
        </aside>
      </div>
    </div>`;

  const read = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  const clean = (v) => ({ ...v, ...('next_at' in v ? { next_at: v.next_at || null } : {}), ...('owner_id' in v ? { owner_id: v.owner_id || null } : {}),
    ...('website' in v && v.website && !/^https?:\/\//i.test(v.website) ? { website: `https://${v.website}` } : {}) });
  $('[data-prospect-form]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget;
    if (!form.company.value.trim()) { form.company.focus(); toast(tr('Enter the company name.')); return; }
    if (!form.reportValidity()) return;
    try {
      const saved = await store.saveProspect(isNew ? null : id, clean(read(form)));
      toast(tr('Saved.'));
      if (isNew) location.hash = `#/c/${saved}`;
    } catch (err) { toast(tr(err.message)); }
  });
  if (isNew) return;
  $('[data-prospect-status]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const v = clean(read(e.currentTarget));
    try {
      await store.saveProspect(id, v);
      if (v.stage !== c.stage) await store.addProspectNote(id, '', v.stage);
      toast(tr('Saved.'));
    } catch (err) { toast(tr(err.message)); }
  });
  $('[data-prospect-note]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const text = e.currentTarget.text.value.trim(); if (!text) return;
    try { await store.addProspectNote(id, text); e.currentTarget.reset(); toast(tr('Added to history.')); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-open-enq]', app).forEach((b) => b.addEventListener('click', () => { query = b.dataset.openEnq; reqFilter = 'all'; location.hash = '#/enquiries'; }));
  // Two clicks instead of a confirm() dialog.
  $('[data-prospect-delete]', app).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = tr('Click again to delete'); return; }
    try { await store.deleteProspect(id); toast(tr('Deleted.')); location.hash = '#/prospects'; } catch (err) { toast(tr(err.message)); }
  });
}

['input', 'change'].forEach((type) => app.addEventListener(type, (ev) => { if (ev.target.matches?.('input, select, textarea')) ev.target.dataset.dirty = '1'; }));
let t = null;
store.onChange(() => { clearTimeout(t); t = setTimeout(() => render(true), 120); });
addEventListener('hashchange', () => render());
render();
