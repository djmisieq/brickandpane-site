// Internal CRM for Brick & Pane staff: pipeline board, list, enquiries from the public form, project control panel.
import { store } from './store.js';
import { STAGES, SIDE_STAGES, ALL_STAGES, DOC_KINDS, ACCOUNT_TYPES, SYSTEMS, stage, esc, fmtDate, fmtDay, fmtMoney, ago, stageBadge, stageTone, avatarTone, courtLabel, isOverdue, $, $$, toast } from './core.js';
// Colour audit 26.11.2026: what each Today counter signals when it is not zero, and each enquiry status.
const TODAY_TONE = { fresh: 'info', tasks: 'warn', overdue: 'danger', answer: 'info', quotes: 'warn', soon: 'neutral', chase: 'warn', waiting: 'warn' };
const REQ_TONE = { new: 'info', replied: 'ok', converted: 'ok', closed: 'neutral', spam: 'neutral' };
import { tr } from './i18n.js';
import { route, renderAppBar } from './ui.js';
import { quotesView, sentQuotes, findQuotes } from './quotes.js';
import { mailView } from './mail.js';
import { loadTasks, tasksBox, bindTasks, taskDue, taskLate, taskTitle } from './tasks.js';
import { dashboardView, SOURCES } from './dashboard.js';
import { replyBox, bindEnquiryReply } from './enquiry-reply.js';
import { linker, bindLinkers, picked, linkerBusy } from './linker.js';
import { projectView, WAITING, BOOKING_KINDS } from './project.js';
import { ICON } from './icons.js';
import { stageDialog, newDialog, palette, bindKeys, rememberRecent } from './crm-quick.js';
import { automationsView } from './automations.js';
import { myWorkView, calendarView, playbookView } from './work.js';
import { companiesView, companyView, KINDS as CO_KINDS } from './companies.js';

const app = $('#app');
const bar = $('#appbar');
let user = null;
// Search text per view: a search typed on the board must not silently filter the enquiries (audit 24.11.2026).
const queries = { board: '', enquiries: '' };
let reqFilter = 'open';

// Values the contact form stores in contact_requests (src/pages/contact.html).
const REQ_STATUS = { new: 'New', replied: 'Replied', converted: 'Now a project', closed: 'Closed', spam: 'Spam' };
const REQ_ROLES = { architect: 'Architect / designer', developer: 'Developer / contractor', homeowner: 'Homeowner', other: 'Other' };
const REQ_TOPICS = { quote: 'A quotation', review: 'A drawing / schedule review', budget: 'A quotation for a scheme', 'spec-pack': 'Technical files (old form)', samples: 'Samples', cpd: 'Training session (old form)', pqq: 'The pre-qualification pack', founding: 'A project for a case study', question: 'Just a question' };
const REQ_MATERIALS = { alu: 'Aluminium', timber: 'Timber', pvc: 'PVC', alutimber: 'Timber-aluminium', unsure: 'Not sure' };
// What happened to the client on conversion (convert_enquiry, migration 0024).
const CONVERTED = {
  linked: () => 'Project created. The client’s account owns it.',
  invited: (r) => r.emailed ? 'Project created. Invitation emailed to the client.' : 'Project created. The client becomes its owner when they sign up with the enquiry’s email.',
  staff: () => 'Project created without a client: the enquiry’s email belongs to a staff account. Invite the client by hand in Team.',
};
// Until the client signs up, a converted enquiry's project is held by the staff member who converted it:
// show the waiting client instead of that staff profile (leads bot test, 01.11.2026).
const clientOf = (p) => (p.owner && p.owner.role !== 'staff' ? p.owner : null);
const clientName = (p) => { const c = clientOf(p); return c ? c.company || c.full_name || '' : ''; };
const isOpenReq = (r) => r.status === 'new' || r.status === 'replied';
let enqFocused = null; // the enquiry a #/enquiries/<id> link already opened and scrolled to
// One read of the enquiries per redraw: the side menu, the view and its counters share it (UX audit 27.11.2026).
let reqP = null;
const listRequests = () => (reqP ||= store.listRequests ? store.listRequests().catch(() => []) : Promise.resolve([]));

// CRM-only styles (css: body.crm): tool density, red reserved for what needs action.
document.body.classList.add('crm');

async function render(fromStore = false) {
  reqP = null;
  if (!fromStore) document.body.classList.add('is-loading');
  try { await draw(fromStore); } finally { document.body.classList.remove('is-loading'); }
}
async function draw(fromStore) {
  user = await store.getUser();
  if (!user) { location.href = `login.html?next=${encodeURIComponent('admin.html' + (/^#\/[\w/-]*$/.test(location.hash) ? location.hash : ''))}`; return; }
  if (user.role !== 'staff') { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr('This area is for Brick & Pane staff.'))} <a href="portal.html">${tr('Go to your projects')}</a>.</p></div>`; await renderAppBar(bar, user, 'portal'); return; }
  // A live update redraws the page: fields the user has changed keep their values (lists too), others refill empty ones.
  const keep = {}, dirty = new Set(), ticks = {}; if (fromStore) $$('textarea[id], input[id], select[id]', app).forEach((el) => { if (el.type !== 'file' && el.type !== 'checkbox' && el.value) keep[el.id] = el.value; if (el.dataset.dirty) dirty.add(el.id); if (el.type === 'checkbox' && el.dataset.dirty) ticks[el.id] = el.checked; });
  const focused = document.activeElement?.id;
  // The app bar is drawn again on every update: what someone is typing in its search must survive that.
  const gq = $('#crm-gq', bar), typed = gq ? { v: gq.value, focus: document.activeElement === gq, at: gq.selectionStart } : null;
  await renderAppBar(bar, user, 'admin'); bindSearch(fromStore ? typed : null);
  // UX audit U1: "+ New" and the palette button sit in the app bar on every view.
  $('.appbar-actions', bar)?.insertAdjacentHTML('afterbegin', `<button type="button" class="btn btn-sm crm-new" data-crm-new>${ICON.plus}<span>${tr('New')}</span></button>`);
  $('.crm-gsearch', bar)?.insertAdjacentHTML('beforeend', `<button type="button" class="crm-k" data-palette title="${esc(tr('Find or go to'))}"><kbd>Ctrl K</kbd></button>`);
  $('[data-crm-new]', bar)?.addEventListener('click', () => newDialog(user));
  $('[data-palette]', bar)?.addEventListener('click', () => palette(user));
  const r = route();
  if (!fromStore) rememberRecent(location.hash);
  await sideNav(r);
  // The quote builder keeps its own state: live updates of projects must not redraw it while someone types.
  if (fromStore && r.name === 'quotes') return;
  // Someone is picking in a search box: the redraw waits until they have picked (it would close the list).
  if (fromStore && linkerBusy()) { clearTimeout(render.wait); render.wait = setTimeout(() => render(true), 1500); return; }
  try {
    if (r.name === 'p' && r.id) await projectView(app, r.id, { user, listRequests, REQ_TOPICS, bindReqFiles });
    else if (r.name === 'quotes') await quotesView(app, r.id, r.id ? '' : viewSwitch('quotes', await listRequests()));
    else if (r.name === 'enquiries') await enquiries();
    else if (r.name === 'companies') await companiesView(app, viewSwitch('companies', await listRequests()));
    else if (r.name === 'company' && r.id) await companyView(app, r.id);
    else if (r.name === 'owner') await dashboardView(app, viewSwitch('owner', await listRequests()));
    else if (r.name === 'search') await searchView(decodeURIComponent(r.id || ''));
    else if (r.name === 'today') await today();
    else if (r.name === 'my') await myWorkView(app, viewSwitch('my', await listRequests()), user);
    else if (r.name === 'calendar') await calendarView(app, viewSwitch('calendar', await listRequests()), user);
    else if (r.name === 'playbook') await playbookView(app, viewSwitch('', await listRequests()));
    else if (r.name === 'automations') await automationsView(app);
    else if (r.name === 'mail') await mailView(app, viewSwitch('mail', await listRequests()));
    else if (r.name === 'board' || r.name === 'list') await board(r.name === 'list');
    else await today(); // the start screen (owner, 25.11.2026)
  } catch (e) { app.innerHTML = `<div class="container-wide section-tight"><p class="callout tone-danger" role="alert">${esc(tr(e.message))} <button type="button" class="btn btn-sm btn-ghost" data-retry>${tr('Try again')}</button></p></div>`; $('[data-retry]', app)?.addEventListener('click', () => render()); }
  Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el && (dirty.has(id) || (!el.value && el.tagName !== 'SELECT'))) { el.value = v; if (dirty.has(id)) el.dataset.dirty = '1'; } });
  // A box someone ticked (e.g. tell the client) stays ticked through a live redraw.
  Object.entries(ticks).forEach(([id, on]) => { const el = document.getElementById(id); if (el && el.checked !== on) { el.checked = on; el.dataset.dirty = '1'; el.dispatchEvent(new Event('change', { bubbles: true })); } });
  if (focused) document.getElementById(focused)?.focus();
}

let boardMine = false, listSort = { by: 'updated', dir: 1 };
// Group by: label, the group of a project, the order of the groups.
const GROUPS = {
  none: ['No grouping', () => '', () => 0],
  stage: ['Group by stage', (p) => tr(stage(p.stage).staffLabel || stage(p.stage).label), (p) => ALL_STAGES.findIndex((s) => s.id === p.stage)],
  phase: ['Group by phase', (p) => tr(stage(p.stage).phase || 'Other'), (p) => ['Quotation', 'Design', 'Delivery'].indexOf(stage(p.stage).phase) + 1 || 9],
  am: ['Group by account manager', (p) => p.assignee?.full_name || tr('Unassigned'), (p) => (p.assignee ? 0 : 1)],
  waiting: ['Group by who we wait on', (p) => (p.internal?.waiting_on ? tr(WAITING[p.internal.waiting_on]) : tr('Nobody: our move')), (p) => (p.internal?.waiting_on ? 0 : 1)],
};
async function board(asList) {
  document.title = `${tr('Projects CRM')} | Brick & Pane`;
  const [all, requests, openT, staff] = await Promise.all([store.listProjects(), listRequests(), loadTasks({ open: true }), asList ? store.listStaff().catch(() => []) : []]);
  const q = queries.board.toLowerCase();
  // Projects audit 26.11.2026: mine or everyone's, and the list sorts by any column.
  const projects = (q ? all.filter((p) => [p.ref, p.name, p.location, clientOf(p)?.full_name, clientOf(p)?.company, p.assignee?.full_name].join(' ').toLowerCase().includes(q)) : all)
    .filter((p) => !boardMine || p.assignee_id === user.id);
  const tasksOf = (pid) => (openT || []).filter((t) => t.project_id === pid);
  const initials = (n) => String(n || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const SORT = { ref: (p) => p.ref, name: (p) => p.name.toLowerCase(), client: (p) => clientName(p).toLowerCase(), stage: (p) => ALL_STAGES.findIndex((s) => s.id === p.stage), am: (p) => p.assignee?.full_name || '~', due: (p) => p.due_at || '9999', value: (p) => -(Number(p.internal?.value_gbp) || 0), waiting: (p) => p.internal?.waiting_on || '~', updated: (p) => `${9e15 - new Date(p.updated_at).getTime()}` };
  const sorted = [...projects].sort((a, b) => { const f = SORT[listSort.by] || SORT.updated, x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * listSort.dir; });
  // UX audit U2: the list groups by a field, each group with its count and value; the setting lives in the address.
  const group = GROUPS[route().q.group] ? route().q.group : 'none';
  const grouped = group === 'none' ? [[null, sorted]] : [...sorted.reduce((m, p) => { const k = GROUPS[group][1](p); m.set(k, [...(m.get(k) || []), p]); return m; }, new Map())].sort((a, b) => GROUPS[group][2](a[1][0]) - GROUPS[group][2](b[1][0]));
  const th = (k, label) => `<th scope="col" aria-sort="${listSort.by === k ? (listSort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-sort" data-sort="${k}">${tr(label)}${listSort.by === k ? (listSort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const open = all.filter((p) => !['completed', 'closed'].includes(p.stage));
  const quoting = open.filter((p) => stage(p.stage).phase === 'Quotation');
  const sum = (arr, w = false) => arr.reduce((t, p) => t + (Number(p.internal?.value_gbp) || 0) * (w ? (p.internal?.probability ?? 0) / 100 : 1), 0);
  const card = (p) => `
    <a class="kcard ${isOverdue(p) ? 'is-overdue' : ''}" href="#/p/${esc(p.id)}" draggable="true" data-pid="${esc(p.id)}">
      <span class="kcard-ref">${esc(p.ref)}</span>
      <span class="kcard-name">${esc(p.name)}</span>
      <span class="kcard-client">${esc(clientName(p))}${clientOf(p)?.account_type === 'homeowner' ? ` <span class="tag">${tr('homeowner')}</span>` : ''}</span>
      ${p.internal?.waiting_on || tasksOf(p.id).length ? `<span class="kcard-tags">${p.internal?.waiting_on ? `<span class="tag tag-wait">${esc(tr('waiting on {who}', { who: tr(WAITING[p.internal.waiting_on]) }))}</span>` : ''}${tasksOf(p.id).length ? `<span class="tag${tasksOf(p.id).some(taskLate) ? ' tag-late' : ''}">${esc(tr('{n} tasks', { n: tasksOf(p.id).length }))}</span>` : ''}</span>` : ''}
      <span class="kcard-foot"><span>${p.assignee ? `<span class="avatar av-${avatarTone(p.assignee.id || p.assignee.full_name)}" title="${esc(p.assignee.full_name)}">${esc(initials(p.assignee.full_name))}</span> ` : ''}${p.internal?.value_gbp ? fmtMoney(p.internal.value_gbp) : '—'}</span><span>${isOverdue(p) ? tr('Overdue {date}', { date: fmtDay(p.due_at) }) : p.due_at && stage(p.stage).court === 'us' ? tr('Due {date}', { date: fmtDay(p.due_at) }) : courtLabel(p.stage, 'staff')}</span></span>
    </a>`;
  app.innerHTML = `
    <div class="container-wide section-tight">
      <div class="dash-head">
        <div><h1 class="app-h1">${tr('Pipeline')}</h1></div>
        <dl class="stats">
          <div class="stat ${open.filter(isOverdue).length ? 'tone-danger' : 'is-zero'}"><dt>${tr('Overdue (with us)')}</dt><dd>${open.filter(isOverdue).length}</dd></div>
          <div class="stat"><dt>${tr('With us')}</dt><dd>${open.filter((p) => stage(p.stage).court === 'us').length}</dd></div>
          <div class="stat"><dt>${tr('Waiting on client')}</dt><dd>${open.filter((p) => stage(p.stage).court === 'you').length}</dd></div>
          <div class="stat"><dt>${tr('Quotes in play')}</dt><dd>${fmtMoney(sum(quoting))}</dd></div>
          <div class="stat"><dt>${tr('Weighted')}</dt><dd>${fmtMoney(sum(quoting, true))}</dd></div>
        </dl>
      </div>
      <div class="board-tools">
        ${viewSwitch(asList ? 'list' : 'board', requests)}
        <div class="seg" role="group" aria-label="${tr('Show as')}"><a href="#/board" class="${asList ? '' : 'is-on'}" data-as="board">${tr('Board')}</a><a href="#/list" class="${asList ? 'is-on' : ''}" data-as="list">${tr('List')}</a></div>
        <div class="seg" role="group" aria-label="${tr('Projects of')}"><button type="button" class="${boardMine ? 'is-on' : ''}" aria-pressed="${boardMine}" data-board-mine="1">${tr('Mine')}</button><button type="button" class="${boardMine ? '' : 'is-on'}" aria-pressed="${!boardMine}" data-board-mine="">${tr('Everyone')}</button></div>
        <label class="visually-hidden" for="crm-q">${tr('Search projects')}</label>
        <input id="crm-q" type="search" placeholder="${tr('Search ref, name, client, location')}" value="${esc(queries.board)}">
        ${asList ? `<label class="visually-hidden" for="list-group">${tr('Group by')}</label><select id="list-group" data-list-group>${Object.entries(GROUPS).map(([k, [l]]) => `<option value="${k}" ${k === group ? 'selected' : ''}>${esc(tr(l))}</option>`).join('')}</select>
          <button type="button" class="btn btn-sm btn-ghost" data-list-csv>${tr('Export CSV')}</button>` : ''}
      </div>
      ${asList ? `
        <div style="overflow-x:auto"><table class="spec spec-compact crm-table"><thead><tr>${th('ref', 'Ref')}${th('name', 'Project')}${th('client', 'Client')}${th('stage', 'Stage')}${th('am', 'Account manager')}${th('waiting', 'Waiting on')}${th('due', 'Due')}${th('value', 'Value')}${th('updated', 'Updated')}</tr></thead>${grouped.map(([gl, rows]) => `<tbody>${gl == null ? '' : `<tr class="grp-h"><th colspan="9" scope="rowgroup"><span>${esc(gl)}</span> <span class="grp-n">${rows.length}</span><span class="grp-sum">${fmtMoney(sum(rows))}</span></th></tr>`}
          ${rows.map((p) => `<tr class="${isOverdue(p) ? 'is-overdue' : ''}" data-row="${esc(p.id)}"><th scope="row"><a href="#/p/${esc(p.id)}">${esc(p.ref)}</a></th><td><a class="row-link" href="#/p/${esc(p.id)}">${esc(p.name)}</a></td><td>${esc(clientName(p))}</td>
            <td><button type="button" class="cell-btn" data-cell-stage="${esc(p.id)}" aria-label="${esc(tr('Move {ref} to another stage', { ref: p.ref }))}">${stageBadge(p.stage, 'staff')}</button></td>
            <td><label class="visually-hidden" for="am-${esc(p.id)}">${tr('Account manager')}</label><select class="cell-in" id="am-${esc(p.id)}" data-cell-am="${esc(p.id)}"><option value="">—</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === p.assignee_id ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></td>
            <td>${p.internal?.waiting_on ? esc(tr(WAITING[p.internal.waiting_on])) : '—'}</td>
            <td><label class="visually-hidden" for="due-${esc(p.id)}">${tr('Due')}</label><input class="cell-in${isOverdue(p) ? ' is-late' : ''}" type="date" id="due-${esc(p.id)}" data-cell-due="${esc(p.id)}" value="${p.due_at ? esc(new Date(p.due_at).toISOString().slice(0, 10)) : ''}"></td>
            <td class="num">${fmtMoney(p.internal?.value_gbp)}</td><td>${ago(p.updated_at)}</td></tr>`).join('')}
        </tbody>`).join('')}</table></div>`
      : `<div class="board">${[...STAGES, ...SIDE_STAGES].filter((s) => s.id !== 'closed' || projects.some((p) => p.stage === 'closed')).map((s) => {
          const items = projects.filter((p) => p.stage === s.id);
          return `<section class="col st-${stageTone(s.id)} ${s.court === 'you' ? 'col-you' : ''} ${items.length ? '' : 'col-empty'}" data-stage="${esc(s.id)}" aria-label="${esc(tr(s.staffLabel || s.label))}"><h2 class="col-h"><span class="col-dot" aria-hidden="true"></span>${esc(tr(s.staffLabel || s.label))}${s.court === 'you' ? ` <span class="col-wait" title="${esc(tr('Waiting on client'))}">⏳</span>` : ''} <span class="col-n">${items.length}</span></h2>${items.map(card).join('')}</section>`;
        }).join('')}</div>`}
    </div>`;
  // UX audit U1: a card dragged to another column opens the stage dialog (the client hears only when ticked).
  const byId = (id) => all.find((p) => p.id === id);
  $$('.kcard[draggable]', app).forEach((c) => {
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.pid); e.dataTransfer.effectAllowed = 'move'; c.classList.add('is-drag'); app.classList.add('is-dragging'); });
    c.addEventListener('dragend', () => { c.classList.remove('is-drag'); app.classList.remove('is-dragging'); $$('.col.is-over', app).forEach((x) => x.classList.remove('is-over')); });
  });
  $$('.col[data-stage]', app).forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('is-over'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('is-over'); });
    col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('is-over'); const p = byId(e.dataTransfer.getData('text/plain')); if (p && p.stage !== col.dataset.stage) stageDialog(p, col.dataset.stage); });
  });
  // The list edits in place: stage through the dialog, account manager and due date saved on change.
  $$('[data-cell-stage]', app).forEach((b) => b.addEventListener('click', () => { const p = byId(b.dataset.cellStage); if (p) stageDialog(p); }));
  $$('[data-cell-am]', app).forEach((s) => s.addEventListener('change', async () => { try { await store.updateProject(s.dataset.cellAm, { assignee_id: s.value || null }); toast(tr('Account manager saved.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); } }));
  $$('[data-cell-due]', app).forEach((i) => i.addEventListener('change', async () => { try { await store.updateProject(i.dataset.cellDue, { due_at: i.value ? new Date(`${i.value}T17:00:00`).toISOString() : null }); toast(tr('Due date saved.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); } }));
  $$('[data-board-mine]', app).forEach((b) => b.addEventListener('click', () => { boardMine = !!b.dataset.boardMine; board(asList); }));
  $('[data-list-group]', app)?.addEventListener('change', (e) => { const v = e.target.value; history.replaceState(null, '', `#/list${v === 'none' ? '' : `?group=${v}`}`); board(true); });
  // CSV of what the list shows now (search, mine and order kept); amounts in £ as plain numbers.
  $('[data-list-csv]', app)?.addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Ref', 'Project', 'Client', 'Location', 'Stage', 'Account manager', 'Waiting on', 'Due', 'Value (GBP)', 'Probability (%)', 'Updated'].map((h) => tr(h));
    const lines = sorted.map((p) => [p.ref, p.name, clientName(p), p.location, tr(stage(p.stage).staffLabel || stage(p.stage).label), p.assignee?.full_name, p.internal?.waiting_on ? tr(WAITING[p.internal.waiting_on]) : '', p.due_at ? p.due_at.slice(0, 10) : '', p.internal?.value_gbp ?? '', p.internal?.probability ?? '', (p.updated_at || '').slice(0, 10)]);
    const blob = new Blob(['﻿' + [head, ...lines].map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `projects-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $$('[data-sort]', app).forEach((b) => b.addEventListener('click', () => { const k = b.dataset.sort; listSort = { by: k, dir: listSort.by === k ? -listSort.dir : 1 }; board(true); }));
  const qi = $('#crm-q', app);
  qi.addEventListener('input', () => { queries.board = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => board(asList).then(() => { const n = $('#crm-q', app); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 200); });
}

// "Today" (CRM audit K1, 24.11.2026): what needs doing now, built only from data the CRM already has (no new tables).
// Each list is sorted oldest first: the longest wait is the first thing to deal with.
const DAY = 86400e3;
const WAIT_DAYS = 7; // a project waiting on the client this long needs a nudge
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : 0);
let todayMine = false;

async function today() {
  document.title = `${tr('Today')} | CRM`;
  const iso = (d) => d.toISOString().slice(0, 10), now = new Date(), tomorrow = iso(new Date(Date.now() + DAY));
  const [all, requests, mail, sent, openT, books] = await Promise.all([store.listProjects(), listRequests(), store.listMail ? store.listMail({}).catch(() => []) : [], sentQuotes().catch(() => []), loadTasks({ open: true }), store.listBookings ? store.listBookings({ from: iso(now), to: tomorrow }).catch(() => []) : []]);
  // Tasks due today or late (phase 3); "mine" = given to me, or made by me for nobody in particular.
  const dueT = (openT || []).filter(taskDue).filter((t) => !todayMine || t.assignee_id === user.id || (!t.assignee_id && t.created_by === user.id)).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const pOf = (pid) => all.find((p) => p.id === pid);
  const open = all.filter((p) => !['completed', 'closed', 'on_hold'].includes(p.stage));
  const mine = todayMine ? open.filter((p) => p.assignee_id === user.id) : open;
  const oldest = (f) => (a, b) => new Date(f(a)) - new Date(f(b));
  const fresh = requests.filter((r) => r.status === 'new').sort(oldest((r) => r.created_at));
  const overdue = mine.filter(isOverdue).sort(oldest((p) => p.due_at));
  const soon = mine.filter((p) => !isOverdue(p) && p.due_at && stage(p.stage).court === 'us' && new Date(p.due_at) - Date.now() < 3 * DAY).sort(oldest((p) => p.due_at));
  // The newest email on each project (mail_list is newest first). If it came in, the next move is ours.
  const last = new Map();
  (mail || []).forEach((m) => (m.projects || []).forEach((pid) => { if (!last.has(pid)) last.set(pid, m); }));
  const answer = mine.filter((p) => last.get(p.id)?.direction === 'in').map((p) => ({ p, m: last.get(p.id) })).sort(oldest((x) => x.m.sent_at));
  const waiting = mine.filter((p) => stage(p.stage).court === 'you' && !p.internal?.waiting_on && daysSince(p.stage_changed_at) >= WAIT_DAYS).sort(oldest((p) => p.stage_changed_at));
  // "Waiting on" with a chase date (migration 0049): today's and the missed ones.
  const chaseToday = mine.filter((p) => p.internal?.waiting_on && p.internal.chase_on && p.internal.chase_on <= new Date().toISOString().slice(0, 10)).sort(oldest((p) => p.internal.chase_on));
  // Sent quotes: chase after 3 days without an answer, and before they lapse (validity in the next 5 days).
  const chase = sent.filter((x) => daysSince(x.sentAt) >= 3 || (x.validUntil && new Date(`${x.validUntil}T23:59:59`) - Date.now() < 5 * DAY)).sort(oldest((x) => x.sentAt));
  const loose = (mail || []).filter((m) => m.direction === 'in' && !m.dismissed && !(m.projects || []).length).length;

  const pname = (p) => `${esc(p.ref)} · ${esc(p.name)}`;
  const days = (iso) => (daysSince(iso) < 1 ? esc(ago(iso)) : tr('{n} d', { n: daysSince(iso) }));
  const row = ({ href, title, sub, age, late }) => `<li><a class="today-row${late ? ' is-late' : ''}" href="${href}"><span class="today-t">${title}</span><span class="today-s">${sub}</span><span class="today-age">${age}</span></a></li>`;
  const SECTIONS = [
    ['fresh', 'New enquiries, no reply yet', fresh, (r) => row({ href: `#/enquiries/${esc(r.id)}`, title: esc(`${r.name}${r.company ? `, ${r.company}` : ''}`), sub: `${esc(r.location || r.email || '')}${Date.now() - new Date(r.created_at) > 2 * DAY ? ` · <strong>${esc(tr('no reply for over 48 h'))}</strong>` : ''}`, age: days(r.created_at), late: Date.now() - new Date(r.created_at) > DAY }), 'No new enquiries.'],
    ['tasks', 'Tasks for today and late', dueT, (t) => { const p = t.project_id && pOf(t.project_id); return row({ href: p ? `#/p/${esc(p.id)}` : t.request_id ? `#/enquiries/${esc(t.request_id)}` : '#/today', title: esc(taskTitle(t)), sub: p ? pname(p) : esc(tr(t.request_id ? 'Enquiry' : 'General')), age: esc(taskLate(t) ? tr('Overdue {date}', { date: fmtDay(t.due_on) }) : tr('Today')), late: taskLate(t) }); }, 'No task due today.'],
    ['overdue', 'Overdue (with us)', overdue, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: `${stageBadge(p.stage, 'staff')} ${esc(p.next_step || '')}`, age: esc(tr('Overdue {date}', { date: fmtDay(p.due_at) })), late: true }), 'Nothing overdue.'],
    ['answer', 'Email came in, our move', answer, ({ p, m }) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: esc(`${m.from_name || m.from_addr}: ${m.subject || tr('(no subject)')}`), age: days(m.sent_at), late: daysSince(m.sent_at) >= 2 }), 'No email waiting for a reply.'],
    ['quotes', 'Quotes sent, no answer: chase', chase, (x) => {
      const lapse = x.validUntil ? Math.floor((new Date(`${x.validUntil}T23:59:59`) - Date.now()) / DAY) : null; // whole days left after today
      return row({ href: `#/quotes/${esc(x.id)}`, title: esc(`${x.reference}${x.customer ? ` · ${x.customer}` : ''}`), sub: `${esc(x.project)}${lapse != null && lapse <= 5 ? ` · <strong>${esc(lapse < 0 ? tr('expired') : tr('valid {n} more days', { n: lapse }))}</strong>` : ''}`, age: days(x.sentAt), late: daysSince(x.sentAt) >= 7 || (lapse != null && lapse <= 5) });
    }, 'No quote waiting for an answer.'],
    ['soon', 'Due in the next 3 days', soon, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: `${stageBadge(p.stage, 'staff')} ${esc(p.next_step || '')}`, age: esc(tr('Due {date}', { date: fmtDay(p.due_at) })) }), 'Nothing due in the next 3 days.'],
    ['chase', 'Chase today (waiting on someone)', chaseToday, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: `${esc(tr('Waiting on {who}', { who: tr(WAITING[p.internal.waiting_on]) }))}${p.internal.waiting_note ? `: ${esc(p.internal.waiting_note)}` : ''}`, age: esc(fmtDay(p.internal.chase_on)), late: p.internal.chase_on < new Date().toISOString().slice(0, 10) }), 'Nobody to chase today.'],
    ['waiting', `Waiting on the client for ${WAIT_DAYS}+ days: chase`, waiting, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: stageBadge(p.stage, 'staff'), age: days(p.stage_changed_at) }), 'No client has kept us waiting that long.'],
  ];
  // UX audit 27.11.2026: who is out on site today and tomorrow comes first; empty lists fold into one "all clear" line.
  const fieldOf = (d) => (books || []).filter((b) => b.starts_on <= d && (b.ends_on || b.starts_on) >= d && (!todayMine || b.staff_id === user.id || pOf(b.project_id)?.assignee_id === user.id));
  const fieldToday = fieldOf(iso(now)), fieldTomorrow = fieldOf(tomorrow);
  const fieldCard = (b) => { const p = pOf(b.project_id); return `<li><a class="field-card cal-${esc(b.kind)}" href="#/p/${esc(b.project_id)}"><span class="field-k">${esc(tr(BOOKING_KINDS[b.kind] || b.kind))}</span><span class="field-p">${esc(p ? `${p.ref} · ${p.name}` : '')}</span>${p?.location ? `<span class="field-l">${esc(p.location)}</span>` : ''}</a></li>`; };
  const filled = SECTIONS.filter(([, , items]) => items.length), clear = SECTIONS.filter(([, , items]) => !items.length);
  app.innerHTML = `
    <div class="container-wide section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${esc(fmtDay(new Date().toISOString()))}</span><h1 class="app-h1">${tr('Today')}</h1></div>
        <div class="stats today-stats">${filled.map(([id, label, items]) => `<button type="button" class="stat tone-${TODAY_TONE[id] || 'neutral'}" data-jump="${id}"><span class="stat-dt">${tr(label)}</span><span class="stat-dd">${items.length}</span></button>`).join('')}</div>
      </div>
      <section class="field-strip" aria-labelledby="th-field">
        <h2 class="panel-h" id="th-field">${tr('Out on site today')} <span class="today-n">${fieldToday.length}</span></h2>
        ${fieldToday.length ? `<ul class="field-list">${fieldToday.map(fieldCard).join('')}</ul>` : `<p class="note">${tr('Nobody out on site today.')}${fieldTomorrow.length ? ` <a href="#/calendar">${tr('Tomorrow: {n}', { n: fieldTomorrow.length })} →</a>` : ''}</p>`}
      </section>
      <div class="board-tools">
        ${viewSwitch('today', requests)}
        <div class="seg" role="group" aria-label="${tr('Projects of')}">
          <button type="button" class="${todayMine ? 'is-on' : ''}" aria-pressed="${todayMine}" data-mine="1">${tr('Mine')}</button>
          <button type="button" class="${todayMine ? '' : 'is-on'}" aria-pressed="${!todayMine}" data-mine="">${tr('Everyone')}</button>
        </div>
      </div>
      <div class="today">${filled.map(([id, label, items, html]) => `
        <section class="today-sec" id="t-${id}" aria-labelledby="th-${id}">
          <h2 class="panel-h" id="th-${id}">${tr(label)} <span class="today-n">${items.length}</span></h2>
          <ul class="today-list">${items.map(html).join('')}</ul>
        </section>`).join('')}
        ${filled.length ? '' : `<p class="today-done">${tr('All done for now.')}</p>`}
        ${clear.length ? `<p class="today-clear"><span class="today-ok" aria-hidden="true">✓</span> ${tr('Clear:')} ${clear.map(([, , , , empty]) => esc(tr(empty))).join(' ')}</p>` : ''}
        ${loose ? `<p class="note"><a href="#/mail">${tr(loose === 1 ? '1 email is not on any project yet' : '{n} emails are not on any project yet', { n: loose })}</a></p>` : ''}
      </div>
    </div>`;
  $$('[data-jump]', app).forEach((b) => b.addEventListener('click', () => document.getElementById(`t-${b.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  $$('[data-mine]', app).forEach((b) => b.addEventListener('click', () => { todayMine = !!b.dataset.mine; today(); }));
}

// UX audit 27.11.2026: the menu lives in one fixed side bar (a bottom bar on a phone), not inside each view, so it
// never moves and stays on project, company and quote cards. Views still call viewSwitch(): it draws nothing now.
const viewSwitch = () => '';
const NAV = [
  ['today', '#/today', 'Today', 1], ['my', '#/my', 'My work', 1], ['board', '#/board', 'Projects', 1], ['enquiries', '#/enquiries', 'Enquiries', 0],
  ['calendar', '#/calendar', 'Calendar', 1], ['mail', '#/mail', 'Email', 0], ['companies', '#/companies', 'Companies', 0], ['quotes', '#/quotes', 'Quotes', 0], ['owner', '#/owner', 'Dashboard', 0], ['automations', '#/automations', 'Automations', 0],
];
const NAV_OF = { list: 'board', p: 'board', company: 'companies', playbook: 'automations', '': 'today' };
let side = null;
async function sideNav(r) {
  if (!side) {
    side = document.createElement('nav'); side.className = 'side-nav'; side.id = 'side-nav'; side.setAttribute('aria-label', tr('CRM menu'));
    document.querySelector('main').prepend(side);
    side.addEventListener('click', (e) => { if (e.target.closest('[data-more]')) side.classList.toggle('is-more'); else if (e.target.closest('a')) side.classList.remove('is-more'); });
  }
  const on = NAV_OF[r.name] ?? r.name;
  const fresh = (await listRequests()).filter((x) => x.status === 'new').length;
  const lang = document.querySelector('.site-header .lang-switch')?.outerHTML || '';
  const brand = document.querySelector('.site-header .brand-mark')?.outerHTML || '';
  side.innerHTML = `<a class="side-brand" href="#/today">${brand}<span>${tr('Brick & Pane CRM')}</span></a>
    <ul class="side-list">${NAV.map(([id, href, label, main]) => `<li class="${main ? 'is-main' : ''}"><a href="${on === 'board' && id === 'board' && r.name === 'list' ? '#/list' : href}" class="${on === id ? 'is-on' : ''}" ${on === id ? 'aria-current="page"' : ''}>${ICON[id] || ''}<span class="side-t">${tr(label)}</span>${id === 'enquiries' && fresh ? `<span class="seg-count">${fresh}</span>` : ''}</a></li>`).join('')}
      <li class="side-more-li"><button type="button" class="side-more" data-more aria-controls="side-nav">${ICON.more}<span class="side-t">${tr('More')}</span>${fresh ? '<span class="side-dot" aria-hidden="true"></span>' : ''}</button></li></ul>
    <div class="side-foot">${lang}</div>`;
}

// One search for the whole CRM in the app bar (audit, phase 1): projects, enquiries and quotes at once.
async function searchView(raw) {
  const q = raw.trim().toLowerCase();
  document.title = `${tr('Search')} | CRM`;
  const [all, reqs, qs, cos, ppl] = await Promise.all([store.listProjects(), listRequests(), findQuotes(q).catch(() => []), store.listCompanies ? store.listCompanies().catch(() => []) : [], store.listPeople ? store.listPeople().catch(() => []) : []]);
  const has = (...xs) => q && xs.filter(Boolean).join(' ').toLowerCase().includes(q);
  const ps = all.filter((p) => has(p.ref, p.name, p.location, clientOf(p)?.full_name, clientOf(p)?.company, p.assignee?.full_name));
  const rs = reqs.filter((r) => has(r.ref, r.name, r.email, r.company, r.location, r.phone, r.message));
  const li = (href, title, sub) => `<li><a class="today-row" href="${href}"><span class="today-t">${title}</span><span class="today-s">${sub}</span></a></li>`;
  const sec = (label, list, html) => `<section class="today-sec"><h2 class="panel-h">${tr(label)} <span class="tag">${list.length}</span></h2>${list.length ? `<ul class="today-list">${list.map(html).join('')}</ul>` : `<p class="hint">${tr('Nothing found.')}</p>`}</section>`;
  app.innerHTML = `<div class="container-wide section-tight" id="search-results">
    <h1 class="app-h1">${q ? tr('Search: {q}', { q: esc(raw.trim()) }) : tr('Search')}</h1>
    ${q ? `${sec('Projects', ps, (p) => li(`#/p/${esc(p.id)}`, `${esc(p.ref)} · ${esc(p.name)}`, `${stageBadge(p.stage, 'staff')} ${esc(p.location || '')}`))}
    ${sec('Enquiries', rs, (r) => li(`#/enquiries/${esc(r.id)}`, esc(r.name || r.email || ''), `${esc(fmtDate(r.created_at))} · ${esc(r.location || r.email || '')}`))}
    ${sec('Companies and people', [...cos.filter((c) => has(c.name, c.email, c.phone, c.website)).map((c) => ({ c })), ...ppl.filter((p) => has(p.full_name, p.email, p.phone, p.job_title)).map((p) => ({ p, c: cos.find((c) => c.id === p.company_id) }))], (x) => x.p ? li(x.c ? `#/company/${esc(x.c.id)}` : '#/companies', esc(x.p.full_name), esc([x.p.job_title, x.c?.name, x.p.email].filter(Boolean).join(' · '))) : li(`#/company/${esc(x.c.id)}`, esc(x.c.name), esc(tr(CO_KINDS[x.c.kind] || x.c.kind))))}
    ${sec('Quotes', qs, (x) => li(`#/quotes/${esc(x.id)}`, esc(x.reference), esc([x.customer, x.site].filter(Boolean).join(' · '))))}` : `<p class="hint">${tr('Type a name, a reference, an email or a postcode in the search box above.')}</p>`}
  </div>`;
}
function bindSearch(typed) {
  const f = $('[data-gsearch]', bar); if (!f) return;
  const r = route();
  if (typed) { f.q.value = typed.v; if (typed.focus) { f.q.focus(); try { f.q.setSelectionRange(typed.at, typed.at); } catch { /* search inputs in some browsers */ } } }
  else if (r.name === 'search') f.q.value = decodeURIComponent(r.id || '');
  f.addEventListener('submit', (e) => { e.preventDefault(); const v = f.q.value.trim(); location.hash = `#/search/${encodeURIComponent(v)}`; });
}

async function enquiries() {
  document.title = `${tr('Enquiries')} | CRM`;
  const [projectsAll, peopleAll, companiesAll] = await Promise.all([store.listProjects().catch(() => []), store.listPeople ? store.listPeople().catch(() => []) : [], store.listCompanies ? store.listCompanies().catch(() => []) : []]);
  const [all, tasks, staff] = await Promise.all([listRequests(), loadTasks({}), store.listStaff().catch(() => [])]);
  const tasksOf = (rid) => (tasks || []).filter((t) => t.request_id === rid);
  // Projects audit 26.11.2026: a known client's next enquiry joins their project instead of making a duplicate.
  const dom = (e) => { const d = String(e || '').toLowerCase().split('@')[1] || ''; return /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|btinternet|sky|wp|onet|o2|interia)\./.test(d) ? '' : d; };
  const pOf = (id) => projectsAll.find((p) => p.id === id);
  const likely = (r) => {
    const ids = new Set(all.filter((x) => x.id !== r.id && x.project_id && (x.email.toLowerCase() === r.email.toLowerCase() || (dom(r.email) && dom(x.email) === dom(r.email)))).map((x) => x.project_id));
    const name = (r.company || '').trim().toLowerCase();
    if (name.length >= 3) projectsAll.filter((p) => [p.owner?.company, p.name].some((v) => String(v || '').toLowerCase().includes(name))).forEach((p) => ids.add(p.id));
    return [...ids].map(pOf).filter((p) => p && !['completed', 'closed'].includes(p.stage)).slice(0, 4);
  };
  const attachBox = (r) => { const sug = likely(r); return `<form class="ctl enq-attach" data-req-attach novalidate><h3 class="panel-h">${tr('Or add it to an existing project')}</h3>
    ${sug.length ? `<p class="enq-sug"><span class="note">${tr('Same client or company:')}</span> ${sug.map((p) => `<button type="button" class="btn btn-sm btn-ghost" data-req-attach-to="${esc(p.id)}">${esc(p.ref)} · ${esc(p.name)}</button>`).join(' ')}</p>` : ''}
    ${linker({ id: `ra-${r.id}`, label: tr('Project'), kinds: ['project'], name: 'project', placeholder: tr('Type a reference, a name or a site…') })}
    <button class="btn btn-sm btn-ghost" type="submit">${tr('Add to this project')}</button>
    <span class="hint">${tr('Its openings, tasks and message join the project; the writer is invited to it. No new project is made.')}</span></form>`; };
  const contactBox = (r) => {
    const pe = r.person_id && peopleAll.find((p) => p.id === r.person_id), co = r.company_id && companiesAll.find((c) => c.id === r.company_id);
    if (pe || co) return `<p class="enq-contact note">${tr('Contact:')} ${pe ? `<strong>${esc(pe.full_name)}</strong>` : ''}${co ? ` · <a href="#/company/${esc(co.id)}">${esc(co.name)}</a>` : ''}</p>`;
    const known = peopleAll.find((p) => p.email && p.email.toLowerCase() === r.email.toLowerCase());
    return `<p class="enq-contact"><button type="button" class="btn btn-sm btn-ghost" data-req-contact>${tr(known ? 'Link to {name} in Companies' : 'Save as a contact in Companies', { name: known?.full_name || '' })}</button></p>`;
  };
  const focus = route().id || null; // #/enquiries/<id>: that enquiry is always listed and opened
  const q = queries.enquiries.toLowerCase();
  const shown = all
    .filter((r) => r.id === focus || (reqFilter === 'open' ? isOpenReq(r) : reqFilter === 'all' || r.status === reqFilter))
    .filter((r) => !q || [r.ref, r.name, r.email, r.company, r.location, r.phone].join(' ').toLowerCase().includes(q));
  const row = (label, value) => (value ? `<tr><th scope="row">${esc(tr(label))}</th><td>${value}</td></tr>` : '');
  const list = (arr, map) => (arr || []).map((v) => esc(tr(map[v] || (v === 'unsure' ? 'Not sure' : v)))).join(', ');
  const item = (r) => `
    <details class="enq${r.status === 'new' ? ' is-new' : ''}" data-req="${esc(r.id)}">
      <summary>
        <span class="enq-ref">${esc(r.ref)}</span>
        <span class="enq-name">${esc(r.name)}${r.company ? `, ${esc(r.company)}` : ''}</span>
        <span class="enq-meta">${esc(tr(REQ_ROLES[r.role] || r.role || ''))}${r.topic ? ` · ${esc(tr(REQ_TOPICS[r.topic] || r.topic))}` : ''}</span>
        <span class="enq-foot"><span class="badge tone-${REQ_TONE[r.status] || 'neutral'}">${esc(tr(REQ_STATUS[r.status] || r.status))}</span> <span>${ago(r.created_at)}</span></span>
      </summary>
      <div class="enq-body">
        <table class="spec spec-compact"><tbody>
          ${row('Received', esc(fmtDate(r.created_at, true)))}
          ${row('Email address', `<a href="mailto:${esc(r.email)}?subject=${encodeURIComponent(r.ref)}">${esc(r.email)}</a>`)}
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
          ${row('HubSpot', r.hubspot_error ? esc(tr('Error: {msg}', { msg: r.hubspot_error })) : r.hubspot_synced_at ? esc(tr('Synced')) : '')}
        </tbody></table>
        ${r.openings?.length ? `<div class="table-scroll"><table class="spec spec-compact"><caption>${tr('Openings')} (${r.openings.reduce((n, o) => n + (o.qty || 1), 0)})</caption><thead><tr><th scope="col">${tr('Ref')}</th><th scope="col">${tr('Product')}</th><th scope="col">${tr('Material')}</th><th scope="col">${tr('Size')}</th><th scope="col">${tr('Qty')}</th><th scope="col">${tr('Note')}</th></tr></thead><tbody>
          ${r.openings.map((o) => `<tr><th scope="row">${esc(o.ref || '')}</th><td>${esc(tr(SYSTEMS[o.system] || o.system || ''))}</td><td>${esc(tr(REQ_MATERIALS[o.material] || 'Not sure'))}</td><td>${o.width_mm || '?'} × ${o.height_mm || '?'} mm</td><td>${o.qty || 1}</td><td>${esc(o.note || '')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
        ${r.message ? `<p class="enq-msg">${esc(r.message)}</p>` : ''}
        <p class="enq-convert">${r.project_id
          ? `<a class="btn btn-sm btn-ghost" href="#/p/${esc(r.project_id)}">${tr('Open the project')}</a>`
          : `<button type="button" class="btn btn-sm" data-req-convert>${tr('Turn into a project')}</button> <label class="enq-invite"><input type="checkbox" data-req-invite checked> ${tr('Email the client an invitation to the portal')}</label> <span class="note">${tr('Copies the details and openings into a portal project. Without an account on this email, the client becomes its owner when they sign up with it.')}</span>`}</p>
        ${r.project_id ? '' : attachBox(r)}
        ${contactBox(r)}
        ${r.files?.length || r.files_link ? `<p class="enq-files">${(r.files || []).map((f) => `<button type="button" class="btn btn-sm btn-ghost" data-req-file="${esc(f)}">${esc(f.split('/').pop())}</button>`).join(' ')}${r.files_link ? ` <a href="${esc(r.files_link)}" target="_blank" rel="noopener noreferrer">${tr('Link to larger files')}</a>` : ''}</p>` : ''}
        ${replyBox(r)}
        <form class="ctl" data-req-form>
          <div class="field"><label for="rq-status-${esc(r.id)}">${tr('Status')}</label><select id="rq-status-${esc(r.id)}" name="status">${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
          <div class="field"><label for="rq-note-${esc(r.id)}">${tr('Team note')} <span class="tag">${tr('staff only')}</span></label><textarea id="rq-note-${esc(r.id)}" name="staff_note" rows="2">${esc(r.staff_note || '')}</textarea></div>
          <button class="btn btn-sm" type="submit">${tr('Save')}</button>
        </form>
        <section class="ctl"><h3 class="panel-h">${tr('Tasks')}</h3>${tasksBox(tasks == null ? null : tasksOf(r.id), staff, user, { requestId: r.id }, `tk-${esc(r.id).slice(0, 8)}`)}</section>
      </div>
    </details>`;
  const openIds = new Set($$('details.enq[open]', app).map((d) => d.dataset.req));
  // #/enquiries/<id> opens that enquiry (links from Today and the search), once per visit of the address.
  if (focus && enqFocused !== focus) openIds.add(focus);
  app.innerHTML = `
    <div class="container section-tight">
      <div class="dash-head">
        <div><h1 class="app-h1">${tr('Enquiries')}</h1></div>
        <dl class="stats">
          <div class="stat ${all.some((r) => r.status === 'new') ? 'tone-info' : 'is-zero'}"><dt>${tr('New')}</dt><dd>${all.filter((r) => r.status === 'new').length}</dd></div>
          <div class="stat"><dt>${tr('Replied')}</dt><dd>${all.filter((r) => r.status === 'replied').length}</dd></div>
        </dl>
      </div>
      <p class="note mb-m">${tr('Requests sent through the website form, with or without an account.')}</p>
      <div class="board-tools">
        ${viewSwitch('enquiries', all)}
        <label class="visually-hidden" for="rq-filter">${tr('Show')}</label>
        <select id="rq-filter"><option value="open">${tr('Open (new and replied)')}</option><option value="all">${tr('All')}</option>${Object.entries(REQ_STATUS).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select>
        <label class="visually-hidden" for="crm-q">${tr('Search enquiries')}</label>
        <input id="crm-q" type="search" placeholder="${tr('Search ref, name, email, location')}" value="${esc(queries.enquiries)}">
      </div>
      ${shown.length ? `<div class="enq-list">${shown.map(item).join('')}</div>` : `<p class="callout">${tr(all.length ? 'No enquiries match.' : 'No enquiries yet.')}</p>`}
    </div>`;
  openIds.forEach((id) => { const d = $$('details.enq', app).find((x) => x.dataset.req === id); if (d) d.open = true; });
  const sel = $('#rq-filter', app); sel.value = reqFilter;
  sel.addEventListener('change', () => { reqFilter = sel.value; enquiries(); });
  const qi = $('#crm-q', app);
  qi.addEventListener('input', () => { queries.enquiries = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => enquiries().then(() => { const n = $('#crm-q', app); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 200); });
  bindTasks(app, user);
  bindEnquiryReply(app, user, (rid) => all.find((x) => x.id === rid), () => enquiries());
  if (focus && enqFocused !== focus) { enqFocused = focus; document.querySelector(`details.enq[data-req="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'start' }); }
  $$('[data-req-form]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await store.updateRequest(f.closest('[data-req]').dataset.req, { status: f.status.value, staff_note: f.staff_note.value.trim() }); toast(tr('Saved.')); await enquiries(); } catch (err) { toast(tr(err.message)); }
  }));
  bindLinkers(app);
  const attach = async (box, pid) => {
    try { await store.attachEnquiry(box.dataset.req, pid); toast(tr('Added to the project.')); location.hash = `#/p/${pid}`; } catch (err) { toast(tr(err.message)); }
  };
  $$('[data-req-attach]', app).forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault(); const to = picked(f, 'project');
    if (!to) { $('[data-linker-input]', f).focus(); toast(tr('Choose the project from the list.')); return; }
    attach(f.closest('[data-req]'), to.id);
  }));
  $$('[data-req-attach-to]', app).forEach((b) => b.addEventListener('click', () => attach(b.closest('[data-req]'), b.dataset.reqAttachTo)));
  // The person who wrote (and their company) become a contact, or the existing contact with that email is linked.
  const KIND = { architect: 'architect', developer: 'developer', homeowner: 'homeowner' };
  $$('[data-req-contact]', app).forEach((b) => b.addEventListener('click', async () => {
    const r = all.find((x) => x.id === b.closest('[data-req]').dataset.req); if (!r) return; b.disabled = true;
    try {
      let pe = peopleAll.find((p) => p.email && p.email.toLowerCase() === r.email.toLowerCase());
      let co = pe?.company_id ? companiesAll.find((c) => c.id === pe.company_id) : null;
      if (!co && r.company?.trim()) co = companiesAll.find((c) => c.name.trim().toLowerCase() === r.company.trim().toLowerCase()) || await store.saveCompany({ name: r.company.trim(), kind: KIND[r.role] || 'other', source: 'website' });
      if (!pe) pe = await store.savePerson({ full_name: r.name || r.email, email: r.email, phone: r.phone || '', company_id: co?.id || null });
      else if (co && !pe.company_id) await store.savePerson({ id: pe.id, company_id: co.id });
      await store.linkEnquiryContact(r.id, co?.id || null, pe.id);
      toast(tr('Saved as a contact.'));
    } catch (err) { b.disabled = false; toast(tr(err.message)); }
  }));
  $$('[data-req-convert]', app).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const box = b.closest('[data-req]');
    try {
      const res = await store.convertRequest(box.dataset.req, { invite: !!$('[data-req-invite]', box)?.checked });
      toast(tr(CONVERTED[res.client]?.(res) || 'Project created.'));
      location.hash = `#/p/${res.project_id}`;
    } catch (err) { b.disabled = false; toast(tr(err.message)); }
  }));
  bindReqFiles();
}

// Files sent with an enquiry: opened through a short-lived signed link.
function bindReqFiles() {
  $$('[data-req-file]', app).forEach((b) => b.addEventListener('click', async () => {
    try { const url = await store.requestFileUrl(b.dataset.reqFile); if (url) open(url, '_blank', 'noopener'); else toast(tr('Files are not stored in demo mode.')); } catch (err) { toast(tr(err.message)); }
  }));
}

['input', 'change'].forEach((type) => app.addEventListener(type, (ev) => { if (ev.target.matches?.('input, select, textarea')) ev.target.dataset.dirty = '1'; }));
let t = null;
store.onChange(() => { clearTimeout(t); t = setTimeout(() => render(true), 120); });
addEventListener('hashchange', () => render());
// Keyboard: Ctrl+K or / finds anything, N a new project, T a task, G then a letter goes to a place, ? lists them.
bindKeys(() => user);
render();
