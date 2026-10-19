// Internal CRM for Brick & Pane staff: pipeline board, list, enquiries from the public form, project control panel.
import { store } from './store.js';
import { STAGES, SIDE_STAGES, ALL_STAGES, DOC_KINDS, ACCOUNT_TYPES, SYSTEMS, stage, esc, fmtDate, fmtDay, fmtMoney, ago, stageBadge, courtLabel, isOverdue, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { route, renderAppBar, pipeline, nowCard, tabs, overviewPanel, documentsPanel, changesPanel, messagesPanel, timelinePanel, bindDetail, counts } from './ui.js';

const app = $('#app');
const bar = $('#appbar');
let user = null;
let activeTab = 'messages';
let lastId = null;
let query = '';
let reqFilter = 'open';

// Values the contact form stores in contact_requests (src/pages/contact.html).
const REQ_STATUS = { new: 'New', replied: 'Replied', converted: 'Now a project', closed: 'Closed', spam: 'Spam' };
const REQ_ROLES = { architect: 'Architect / designer', developer: 'Developer / contractor', homeowner: 'Homeowner', other: 'Other' };
const REQ_TOPICS = { quote: 'A quotation', review: 'A drawing / schedule review', budget: 'A quotation for a scheme', 'spec-pack': 'The spec pack (DWG / BIM / clauses)', samples: 'Samples', cpd: 'A CPD session', pqq: 'The pre-qualification pack', founding: 'Founding project', question: 'Just a question' };
const REQ_MATERIALS = { alu: 'Aluminium', timber: 'Timber', pvc: 'PVC', alutimber: 'Timber-aluminium', unsure: 'Not sure' };
const isOpenReq = (r) => r.status === 'new' || r.status === 'replied';
const listRequests = () => (store.listRequests ? store.listRequests().catch(() => []) : []);

async function render(fromStore = false) {
  user = await store.getUser();
  if (!user) { location.href = `login.html?next=${encodeURIComponent('admin.html' + location.hash)}`; return; }
  if (user.role !== 'staff') { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr('This area is for Brick & Pane staff.'))} <a href="portal.html">${tr('Go to your projects')}</a>.</p></div>`; await renderAppBar(bar, user, 'portal'); return; }
  const keep = {}; if (fromStore) $$('textarea[id], input[id]', app).forEach((el) => { if (el.type !== 'file' && el.type !== 'checkbox' && el.value) keep[el.id] = el.value; });
  const focused = document.activeElement?.id;
  await renderAppBar(bar, user, 'admin');
  const r = route();
  try {
    if (r.name === 'p' && r.id) await detail(r.id);
    else if (r.name === 'enquiries') await enquiries();
    else await board(r.name === 'list');
  } catch (e) { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr(e.message))}</p></div>`; }
  Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el && !el.value) el.value = v; });
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
  return `<div class="seg" role="group" aria-label="${tr('View')}">${link('board', '#/', tr('Board'))}${link('list', '#/list', tr('List'))}${link('enquiries', '#/enquiries', `${tr('Enquiries')}${fresh ? ` <span class="seg-count">${fresh}</span>` : ''}`)}</div>`;
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

let t = null;
store.onChange(() => { clearTimeout(t); t = setTimeout(() => render(true), 120); });
addEventListener('hashchange', () => render());
render();
