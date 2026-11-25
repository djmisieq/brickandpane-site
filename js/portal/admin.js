// Internal CRM for Brick & Pane staff: pipeline board, list, enquiries from the public form, project control panel.
import { store } from './store.js';
import { STAGES, SIDE_STAGES, ALL_STAGES, DOC_KINDS, ACCOUNT_TYPES, SYSTEMS, stage, esc, fmtDate, fmtDay, fmtMoney, ago, stageBadge, courtLabel, isOverdue, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { route, renderAppBar, pipeline, nowCard, tabs, overviewPanel, documentsPanel, changesPanel, messagesPanel, timelinePanel, bindDetail, counts } from './ui.js';
import { quotesView, projectQuotes, newQuoteFor, sentQuotes } from './quotes.js';
import { loadCosts, costsPanel, bindCosts } from './costs.js';
import { loadMail, mailPanel, bindMail, mailView } from './mail.js';

const app = $('#app');
const bar = $('#appbar');
let user = null;
let activeTab = 'messages';
let lastId = null;
// Search text per view: a search typed on the board must not silently filter the enquiries (audit 24.11.2026).
const queries = { board: '', enquiries: '' };
let reqFilter = 'open';

// Values the contact form stores in contact_requests (src/pages/contact.html).
const REQ_STATUS = { new: 'New', replied: 'Replied', converted: 'Now a project', closed: 'Closed', spam: 'Spam' };
const REQ_ROLES = { architect: 'Architect / designer', developer: 'Developer / contractor', homeowner: 'Homeowner', other: 'Other' };
const REQ_TOPICS = { quote: 'A quotation', review: 'A drawing / schedule review', budget: 'A quotation for a scheme', 'spec-pack': 'Technical files (old form)', samples: 'Samples', cpd: 'Training session (old form)', pqq: 'The pre-qualification pack', founding: 'A project for a case study', question: 'Just a question' };
const REQ_MATERIALS = { alu: 'Aluminium', timber: 'Timber', pvc: 'PVC', alutimber: 'Timber-aluminium', unsure: 'Not sure' };
// Linked projects take their stage from HubSpot (migration 0019); staff open the deal there.
const HUBSPOT_DEAL = 'https://app-eu1.hubspot.com/contacts/149668825/record/0-3/';
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
const headClient = (p, invites = []) => {
  const c = clientOf(p);
  if (c) return `${esc(c.full_name || '')}${c.company ? `, ${esc(c.company)}` : ''}${c.account_type ? ` · ${esc(tr(ACCOUNT_TYPES[c.account_type] || ''))}` : ''}`;
  const inv = invites.find((i) => i.make_owner) || invites[0];
  if (!inv) return esc(tr('No client yet'));
  // A converted enquiry reserves the project for the client's email; it is an invitation only once emailed.
  return esc(tr(inv.make_owner && !inv.emailed_at ? 'Awaiting client sign-up: {email}' : 'Client invited: {email}', { email: inv.email }));
};
const isOpenReq = (r) => r.status === 'new' || r.status === 'replied';
const listRequests = () => (store.listRequests ? store.listRequests().catch(() => []) : []);

// CRM-only styles (css: body.crm): tool density, red reserved for what needs action.
document.body.classList.add('crm');

async function render(fromStore = false) {
  user = await store.getUser();
  if (!user) { location.href = `login.html?next=${encodeURIComponent('admin.html' + (/^#\/[\w/-]*$/.test(location.hash) ? location.hash : ''))}`; return; }
  if (user.role !== 'staff') { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr('This area is for Brick & Pane staff.'))} <a href="portal.html">${tr('Go to your projects')}</a>.</p></div>`; await renderAppBar(bar, user, 'portal'); return; }
  // A live update redraws the page: fields the user has changed keep their values (lists too), others refill empty ones.
  const keep = {}, dirty = new Set(); if (fromStore) $$('textarea[id], input[id], select[id]', app).forEach((el) => { if (el.type !== 'file' && el.type !== 'checkbox' && el.value) keep[el.id] = el.value; if (el.dataset.dirty) dirty.add(el.id); });
  const focused = document.activeElement?.id;
  await renderAppBar(bar, user, 'admin');
  const r = route();
  // The quote builder keeps its own state: live updates of projects must not redraw it while someone types.
  if (fromStore && r.name === 'quotes') return;
  try {
    if (r.name === 'p' && r.id) await detail(r.id);
    else if (r.name === 'quotes') await quotesView(app, r.id, r.id ? '' : viewSwitch('quotes', await listRequests()));
    else if (r.name === 'enquiries') await enquiries();
    else if (r.name === 'today') await today();
    else if (r.name === 'mail') await mailView(app, viewSwitch('mail', await listRequests()));
    else await board(r.name === 'list');
  } catch (e) { app.innerHTML = `<div class="container section-tight"><p class="callout">${esc(tr(e.message))}</p></div>`; }
  Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el && (dirty.has(id) || (!el.value && el.tagName !== 'SELECT'))) { el.value = v; if (dirty.has(id)) el.dataset.dirty = '1'; } });
  if (focused) document.getElementById(focused)?.focus();
}

async function board(asList) {
  document.title = `${tr('Projects CRM')} | Brick & Pane`;
  const [all, requests] = await Promise.all([store.listProjects(), listRequests()]);
  const q = queries.board.toLowerCase();
  const projects = q ? all.filter((p) => [p.ref, p.name, p.location, clientOf(p)?.full_name, clientOf(p)?.company].join(' ').toLowerCase().includes(q)) : all;
  const open = all.filter((p) => !['completed', 'closed'].includes(p.stage));
  const quoting = open.filter((p) => stage(p.stage).phase === 'Quotation');
  const sum = (arr, w = false) => arr.reduce((t, p) => t + (Number(p.internal?.value_gbp) || 0) * (w ? (p.internal?.probability ?? 0) / 100 : 1), 0);
  const card = (p) => `
    <a class="kcard ${isOverdue(p) ? 'is-overdue' : ''}" href="#/p/${esc(p.id)}">
      <span class="kcard-ref">${esc(p.ref)}</span>
      <span class="kcard-name">${esc(p.name)}</span>
      <span class="kcard-client">${esc(clientName(p))}${clientOf(p)?.account_type === 'homeowner' ? ` <span class="tag">${tr('homeowner')}</span>` : ''}</span>
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
        <input id="crm-q" type="search" placeholder="${tr('Search ref, name, client, location')}" value="${esc(queries.board)}">
      </div>
      ${asList ? `
        <div style="overflow-x:auto"><table class="spec spec-compact crm-table"><thead><tr><th scope="col">${tr('Ref')}</th><th scope="col">${tr('Project')}</th><th scope="col">${tr('Client')}</th><th scope="col">${tr('Stage')}</th><th scope="col">${tr('Account manager')}</th><th scope="col">${tr('Due')}</th><th scope="col">${tr('Value')}</th><th scope="col">${tr('Updated')}</th></tr></thead><tbody>
          ${projects.map((p) => `<tr class="${isOverdue(p) ? 'is-overdue' : ''}"><th scope="row"><a href="#/p/${esc(p.id)}">${esc(p.ref)}</a></th><td>${esc(p.name)}</td><td>${esc(clientName(p))}</td><td>${stageBadge(p.stage, 'staff')}</td><td>${esc(p.assignee?.full_name || '—')}</td><td>${p.due_at ? fmtDay(p.due_at) : '—'}</td><td>${fmtMoney(p.internal?.value_gbp)}</td><td>${ago(p.updated_at)}</td></tr>`).join('')}
        </tbody></table></div>`
      : `<div class="board">${[...STAGES, ...SIDE_STAGES].filter((s) => s.id !== 'closed' || projects.some((p) => p.stage === 'closed')).map((s) => {
          const items = projects.filter((p) => p.stage === s.id);
          return `<section class="col ${s.court === 'you' ? 'col-you' : ''} ${items.length ? '' : 'col-empty'}" aria-label="${esc(tr(s.staffLabel || s.label))}"><h2 class="col-h">${esc(tr(s.staffLabel || s.label))} <span>${items.length}</span></h2>${items.map(card).join('')}</section>`;
        }).join('')}</div>`}
    </div>`;
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
  const [all, requests, mail, sent] = await Promise.all([store.listProjects(), listRequests(), store.listMail ? store.listMail({}).catch(() => []) : [], sentQuotes().catch(() => [])]);
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
  const waiting = mine.filter((p) => stage(p.stage).court === 'you' && daysSince(p.stage_changed_at) >= WAIT_DAYS).sort(oldest((p) => p.stage_changed_at));
  // Sent quotes: chase after 3 days without an answer, and before they lapse (validity in the next 5 days).
  const chase = sent.filter((x) => daysSince(x.sentAt) >= 3 || (x.validUntil && new Date(`${x.validUntil}T23:59:59`) - Date.now() < 5 * DAY)).sort(oldest((x) => x.sentAt));
  const loose = (mail || []).filter((m) => m.direction === 'in' && !m.dismissed && !(m.projects || []).length).length;

  const pname = (p) => `${esc(p.ref)} · ${esc(p.name)}`;
  const days = (iso) => (daysSince(iso) < 1 ? esc(ago(iso)) : tr('{n} d', { n: daysSince(iso) }));
  const row = ({ href, title, sub, age, late }) => `<li><a class="today-row${late ? ' is-late' : ''}" href="${href}"><span class="today-t">${title}</span><span class="today-s">${sub}</span><span class="today-age">${age}</span></a></li>`;
  const SECTIONS = [
    ['fresh', 'New enquiries, no reply yet', fresh, (r) => row({ href: '#/enquiries', title: esc(`${r.name}${r.company ? `, ${r.company}` : ''}`), sub: esc(r.location || r.email || ''), age: days(r.created_at), late: daysSince(r.created_at) >= 1 }), 'No new enquiries.'],
    ['overdue', 'Overdue (with us)', overdue, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: `${stageBadge(p.stage, 'staff')} ${esc(p.next_step || '')}`, age: esc(tr('Overdue {date}', { date: fmtDay(p.due_at) })), late: true }), 'Nothing overdue.'],
    ['answer', 'Email came in, our move', answer, ({ p, m }) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: esc(`${m.from_name || m.from_addr}: ${m.subject || tr('(no subject)')}`), age: days(m.sent_at), late: daysSince(m.sent_at) >= 2 }), 'No email waiting for a reply.'],
    ['quotes', 'Quotes sent, no answer: chase', chase, (x) => {
      const lapse = x.validUntil ? Math.floor((new Date(`${x.validUntil}T23:59:59`) - Date.now()) / DAY) : null; // whole days left after today
      return row({ href: `#/quotes/${esc(x.id)}`, title: esc(`${x.reference}${x.customer ? ` · ${x.customer}` : ''}`), sub: `${esc(x.project)}${lapse != null && lapse <= 5 ? ` · <strong>${esc(lapse < 0 ? tr('expired') : tr('valid {n} more days', { n: lapse }))}</strong>` : ''}`, age: days(x.sentAt), late: daysSince(x.sentAt) >= 7 || (lapse != null && lapse <= 5) });
    }, 'No quote waiting for an answer.'],
    ['soon', 'Due in the next 3 days', soon, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: `${stageBadge(p.stage, 'staff')} ${esc(p.next_step || '')}`, age: esc(tr('Due {date}', { date: fmtDay(p.due_at) })) }), 'Nothing due in the next 3 days.'],
    ['waiting', `Waiting on the client for ${WAIT_DAYS}+ days: chase`, waiting, (p) => row({ href: `#/p/${esc(p.id)}`, title: pname(p), sub: stageBadge(p.stage, 'staff'), age: days(p.stage_changed_at) }), 'No client has kept us waiting that long.'],
  ];
  app.innerHTML = `
    <div class="container-wide section-tight">
      <div class="dash-head">
        <div><span class="eyebrow">${esc(fmtDay(new Date().toISOString()))}</span><h1 class="app-h1">${tr('Today')}</h1></div>
        <div class="stats today-stats">${SECTIONS.map(([id, label, items]) => `<button type="button" class="stat${items.length && ['fresh', 'overdue', 'answer'].includes(id) ? ' is-you' : ''}" data-jump="${id}"><span class="stat-dt">${tr(label)}</span><span class="stat-dd">${items.length}</span></button>`).join('')}</div>
      </div>
      <div class="board-tools">
        ${viewSwitch('today', requests)}
        <div class="seg" role="group" aria-label="${tr('Projects of')}">
          <button type="button" class="${todayMine ? 'is-on' : ''}" aria-pressed="${todayMine}" data-mine="1">${tr('Mine')}</button>
          <button type="button" class="${todayMine ? '' : 'is-on'}" aria-pressed="${!todayMine}" data-mine="">${tr('Everyone')}</button>
        </div>
      </div>
      <div class="today">${SECTIONS.map(([id, label, items, html, empty]) => `
        <section class="today-sec" id="t-${id}" aria-labelledby="th-${id}">
          <h2 class="panel-h" id="th-${id}">${tr(label)} <span class="today-n">${items.length}</span></h2>
          ${items.length ? `<ul class="today-list">${items.map(html).join('')}</ul>` : `<p class="note">${tr(empty)}</p>`}
        </section>`).join('')}
        ${loose ? `<p class="note"><a href="#/mail">${tr('{n} emails are not on any project yet', { n: loose })}</a></p>` : ''}
      </div>
    </div>`;
  $$('[data-jump]', app).forEach((b) => b.addEventListener('click', () => document.getElementById(`t-${b.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  $$('[data-mine]', app).forEach((b) => b.addEventListener('click', () => { todayMine = !!b.dataset.mine; today(); }));
}

function viewSwitch(on, requests) {
  const fresh = requests.filter((r) => r.status === 'new').length;
  const link = (id, href, label) => `<a href="${href}" class="${on === id ? 'is-on' : ''}">${label}</a>`;
  return `<div class="seg" role="group" aria-label="${tr('View')}">${link('today', '#/today', tr('Today'))}${link('board', '#/', tr('Board'))}${link('list', '#/list', tr('List'))}${link('enquiries', '#/enquiries', `${tr('Enquiries')}${fresh ? ` <span class="seg-count">${fresh}</span>` : ''}`)}${link('quotes', '#/quotes', tr('Quotes'))}${link('mail', '#/mail', tr('Email'))}</div>`;
}

async function enquiries() {
  document.title = `${tr('Enquiries')} | CRM`;
  const all = await listRequests();
  const q = queries.enquiries.toLowerCase();
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
          ${row('HubSpot', r.hubspot_error ? esc(tr('Error: {msg}', { msg: r.hubspot_error })) : r.hubspot_synced_at ? esc(tr('Synced')) : '')}
        </tbody></table>
        ${r.openings?.length ? `<div class="table-scroll"><table class="spec spec-compact"><caption>${tr('Openings')} (${r.openings.reduce((n, o) => n + (o.qty || 1), 0)})</caption><thead><tr><th scope="col">${tr('Ref')}</th><th scope="col">${tr('Product')}</th><th scope="col">${tr('Material')}</th><th scope="col">${tr('Size')}</th><th scope="col">${tr('Qty')}</th><th scope="col">${tr('Note')}</th></tr></thead><tbody>
          ${r.openings.map((o) => `<tr><th scope="row">${esc(o.ref || '')}</th><td>${esc(tr(SYSTEMS[o.system] || o.system || ''))}</td><td>${esc(tr(REQ_MATERIALS[o.material] || 'Not sure'))}</td><td>${o.width_mm || '?'} × ${o.height_mm || '?'} mm</td><td>${o.qty || 1}</td><td>${esc(o.note || '')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
        ${r.message ? `<p class="enq-msg">${esc(r.message)}</p>` : ''}
        <p class="enq-convert">${r.project_id
          ? `<a class="btn btn-sm btn-ghost" href="#/p/${esc(r.project_id)}">${tr('Open the project')}</a>`
          : `<button type="button" class="btn btn-sm" data-req-convert>${tr('Turn into a project')}</button> <label class="enq-invite"><input type="checkbox" data-req-invite checked> ${tr('Email the client an invitation to the portal')}</label> <span class="note">${tr('Copies the details and openings into a portal project. Without an account on this email, the client becomes its owner when they sign up with it.')}</span>`}</p>
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
        <input id="crm-q" type="search" placeholder="${tr('Search ref, name, email, location')}" value="${esc(queries.enquiries)}">
      </div>
      ${shown.length ? `<div class="enq-list">${shown.map(item).join('')}</div>` : `<p class="callout">${tr(all.length ? 'No enquiries match.' : 'No enquiries yet.')}</p>`}
    </div>`;
  openIds.forEach((id) => { const d = $$('details.enq', app).find((x) => x.dataset.req === id); if (d) d.open = true; });
  const sel = $('#rq-filter', app); sel.value = reqFilter;
  sel.addEventListener('change', () => { reqFilter = sel.value; enquiries(); });
  const qi = $('#crm-q', app);
  qi.addEventListener('input', () => { queries.enquiries = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => enquiries().then(() => { const n = $('#crm-q', app); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 200); });
  $$('[data-req-form]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await store.updateRequest(f.closest('[data-req]').dataset.req, { status: f.status.value, staff_note: f.staff_note.value.trim() }); toast(tr('Saved.')); await enquiries(); } catch (err) { toast(tr(err.message)); }
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
  $$('[data-req-file]', app).forEach((b) => b.addEventListener('click', async () => {
    try { const url = await store.requestFileUrl(b.dataset.reqFile); if (url) open(url, '_blank', 'noopener'); else toast(tr('Files are not stored in demo mode.')); } catch (err) { toast(tr(err.message)); }
  }));
}

// Which side panels of the project card are open; a live redraw keeps them as the user left them.
const openFolds = new Set();
const keyNumbers = (p, d, { margin }) => {
  const m = margin || {};
  const sale = m.sale_gbp ?? d.internal?.value_gbp;
  const inStage = Math.floor((Date.now() - new Date(p.stage_changed_at).getTime()) / 86400e3);
  const due = isOverdue(p) ? `<strong class="kn-late">${esc(tr('Overdue {date}', { date: fmtDay(p.due_at) }))}</strong>` : p.due_at ? esc(fmtDay(p.due_at)) : '—';
  const item = (label, value) => `<div><dt>${tr(label)}</dt><dd>${value}</dd></div>`;
  return `<dl class="key-numbers">
    ${item('Stage', `${stageBadge(p.stage, 'staff')} <span class="note">${esc(tr('{n} d', { n: inStage }))}</span>`)}
    ${item('Due', due)}
    ${item('Value', sale == null || sale === '' ? '—' : esc(fmtMoney(sale)))}
    ${item('Margin', m.margin_gbp == null ? '—' : !Number(m.cost_gbp) ? `<span class="note">${tr('no costs entered')}</span>` : `${esc(fmtMoney(m.margin_gbp))}${m.margin_pct == null ? '' : ` (${esc(String(m.margin_pct))}%)`}`)}
    ${item('Account manager', esc(p.assignee?.full_name || tr('Unassigned')))}
  </dl>`;
};

async function detail(id) {
  if (id !== lastId) { activeTab = 'messages'; lastId = id; }
  const [d, staff, costs, mail, pq] = await Promise.all([store.getProject(id), store.listStaff(), loadCosts(id), loadMail(id), projectQuotes(id).catch(() => [])]);
  const p = d.project;
  document.title = `${p.ref} · ${p.name} | CRM`;
  const nextIdx = STAGES.findIndex((s) => s.id === p.stage) + 1;
  const suggested = STAGES[nextIdx]?.id || p.stage;
  app.innerHTML = `
    <div class="container section-tight">
      <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/">${tr('Pipeline')}</a></li><li aria-current="page">${esc(p.ref)}</li></ol></nav>
      <div class="detail-head">
        <div><h1 class="app-h1">${esc(p.name)}</h1><p class="note">${esc(p.ref)} · ${esc(p.location)} · ${headClient(p, d.invites)}</p></div>
      </div>
      ${keyNumbers(p, d, costs)}
      <div class="crm-grid">
        <div class="crm-main">
          ${nowCard(p, 'staff')}
          <section class="ctl pq" data-project-quotes>
            <div class="pq-head"><h2 class="panel-h">${tr('Quotes')}</h2><button type="button" class="btn btn-sm" data-new-quote>+ ${tr('New quote')}</button></div>
            ${pq.length ? `<ul class="pq-list">${pq.map((x) => `<li><a href="#/quotes/${esc(x.id)}">${esc(x.reference)}${x.revision && x.revision !== '00' ? ` rev ${esc(x.revision)}` : ''}</a> <span class="tag">${esc(x.statusName)}</span> <span class="pq-total">${esc(fmtMoney(x.total))}</span></li>`).join('')}</ul>` : `<p class="hint">${tr('No quote yet. A new one takes the client, the site and the openings from this project.')}</p>`}
          </section>
          ${pipeline(p, d.events, 'staff')}
          ${tabs(activeTab, counts(d, 'staff', user))}
          <div class="tabpanel" role="tabpanel" id="panel-${activeTab}" aria-labelledby="tab-${activeTab}">
            ${activeTab === 'documents' ? documentsPanel(d, 'staff', user) : activeTab === 'changes' ? changesPanel(d, 'staff', user) : activeTab === 'messages' ? messagesPanel(d, user) : activeTab === 'timeline' ? timelinePanel(d, 'staff') : overviewPanel(d, 'staff', 'staff', user)}
          </div>
          ${mailPanel(mail)}
        </div>
        <aside class="crm-side">
          ${d.internal?.hubspot_deal_id ? `<form class="ctl" data-next-step novalidate>
            <h2 class="panel-h">${tr('Stage')}</h2>
            <p class="note">${tr('This project’s stage is set in HubSpot and updates here within 15 minutes.')} <a href="${HUBSPOT_DEAL}${encodeURIComponent(d.internal.hubspot_deal_id)}" target="_blank" rel="noopener">${tr('Open the deal in HubSpot')}</a></p>
            <div class="field"><label for="ctl-next">${tr('Next step (shown to client)')}</label><input id="ctl-next" name="next_step" value="${esc(p.next_step || '')}"></div>
            <button class="btn btn-sm" type="submit">${tr('Save next step')}</button>
          </form>` : `<form class="ctl" data-stage novalidate>
            <h2 class="panel-h">${tr('Move stage')}</h2>
            <div class="field"><label for="ctl-stage">${tr('New stage')}</label><select id="ctl-stage" name="stage" required><option value="">${tr('Choose the new stage…')}</option>${ALL_STAGES.filter((s) => s.id !== p.stage).map((s) => `<option value="${s.id}">${esc(tr(s.staffLabel || s.label))}${s.id === suggested ? ` ${tr('(next)')}` : ''}</option>`).join('')}</select><span class="hint">${tr('Current:')} ${esc(tr(stage(p.stage).staffLabel || stage(p.stage).label))}</span></div>
            <div class="field"><label for="ctl-note">${tr('Note to client')}</label><textarea id="ctl-note" name="note" rows="2" placeholder="${tr('e.g. Quotation Q1 is in Documents.')}"></textarea></div>
            <div class="field"><label for="ctl-next">${tr('Next step (shown to client)')}</label><input id="ctl-next" name="next_step" value="${esc(p.next_step || '')}"></div>
            <div class="field"><label for="ctl-due">${tr('Next update by')}</label><input id="ctl-due" name="due" type="date"><span class="hint">${tr('Blank = no date.')}</span></div>
            <label class="consent"><input type="checkbox" name="visible" checked> <span>${tr('Visible to client and notify them')}</span></label>
            <button class="btn btn-sm" type="submit">${tr('Update stage')}</button>
          </form>`}

          <details class="ctl fold" data-fold="dates" ${openFolds.has('dates') ? 'open' : ''}><summary class="panel-h">${tr('Delivery & fitting')}</summary>
          <form class="fold-body" data-dates>
            <div class="field-row">
              <div class="field"><label for="ctl-del">${tr('Delivery')}</label><input id="ctl-del" name="delivery" type="date" value="${p.delivery_at ? p.delivery_at.slice(0, 10) : ''}"></div>
              <div class="field"><label for="ctl-ins">${tr('Fitting')}</label><input id="ctl-ins" name="install" type="date" value="${p.install_at ? p.install_at.slice(0, 10) : ''}"></div>
            </div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save & notify client')}</button>
          </form></details>

          <details class="ctl fold" data-fold="payment" ${openFolds.has('payment') ? 'open' : ''}><summary class="panel-h">${tr('Payment schedule')}</summary>
          <form class="fold-body" data-payment>
            <div class="field"><label for="pay-label">${tr('Stage')}</label><input id="pay-label" name="label" placeholder="${tr('e.g. Deposit')}" required></div>
            <div class="field-row">
              <div class="field"><label for="pay-amt">${tr('Amount (£)')}</label><input id="pay-amt" name="amount" type="number" min="0" step="1" required></div>
              <div class="field"><label for="pay-due">${tr('Due')}</label><input id="pay-due" name="due" type="date"></div>
            </div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Add payment')}</button>
          </form></details>

          <details class="ctl fold" data-fold="assign" ${openFolds.has('assign') ? 'open' : ''}><summary class="panel-h">${`${tr('Account manager')}: ${esc(p.assignee?.full_name || tr('Unassigned'))}`}</summary>
          <form class="fold-body" data-assign>
            <div class="field"><label for="ctl-owner" class="visually-hidden">${tr('Account manager')}</label><select id="ctl-owner" name="assignee_id"><option value="">${tr('Unassigned')}</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === p.assignee_id ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save owner')}</button>
          </form></details>

          <details class="ctl fold" data-fold="doc" ${openFolds.has('doc') ? 'open' : ''}><summary class="panel-h">${tr('Share a document')}</summary>
          <form class="fold-body" data-doc>
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
          </form></details>

          <details class="ctl fold" data-fold="internal" ${openFolds.has('internal') ? 'open' : ''}><summary class="panel-h">${`${tr('Commercial')} <span class="tag">${tr('staff only')}</span>`}</summary>
          <form class="fold-body" data-internal>
            <div class="field-row">
              <div class="field"><label for="ctl-val">${tr('Value (£)')}</label><input id="ctl-val" name="value_gbp" type="number" min="0" step="100" value="${esc(d.internal?.value_gbp ?? '')}"></div>
              <div class="field"><label for="ctl-prob">${tr('Probability (%)')}</label><input id="ctl-prob" name="probability" type="number" min="0" max="100" step="5" value="${esc(d.internal?.probability ?? '')}"></div>
            </div>
            <div class="field"><label for="ctl-notes">${tr('Notes')}</label><textarea id="ctl-notes" name="notes" rows="3">${esc(d.internal?.notes || '')}</textarea></div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save')}</button>
          </form></details>

          <details class="ctl fold" data-fold="costs" ${openFolds.has('costs') ? 'open' : ''}><summary class="panel-h">${tr('Costs & margin')} <span class="tag">${tr('staff only')}</span></summary>${costsPanel(costs)}</details>
        </aside>
      </div>
    </div>`;

  bindDetail(app, d, (t) => { activeTab = t; detail(id); });
  bindCosts(app, id);
  bindMail(app, id);
  $('[data-new-quote]', app)?.addEventListener('click', async (e) => {
    const b = e.currentTarget; if (b.disabled) return; b.disabled = true;
    try { location.hash = `#/quotes/${await newQuoteFor(d)}`; } catch (err) { b.disabled = false; toast(tr(err.message)); }
  });
  $$('[data-fold]', app).forEach((el) => el.addEventListener('toggle', () => { if (el.open) openFolds.add(el.dataset.fold); else openFolds.delete(el.dataset.fold); }));
  $('[data-next-step]', app)?.addEventListener('submit', async (e) => { e.preventDefault(); try { await store.updateProject(id, { next_step: e.currentTarget.next_step.value.trim() }); toast(tr('Next step saved.')); } catch (err) { toast(tr(err.message)); } });
  $('[data-stage]', app)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.stage.value) { f.stage.focus(); toast(tr('Choose the new stage first.')); return; }
    const due = f.due.value ? new Date(`${f.due.value}T17:00:00`).toISOString() : null;
    try { await store.setStage(id, f.stage.value, { note: f.note.value.trim(), visible: f.visible.checked, next_step: f.next_step.value.trim(), due_at: due }); toast(tr(f.visible.checked ? 'Stage updated. Client notified.' : 'Stage updated (hidden from client).')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-assign]', app).addEventListener('submit', async (e) => { e.preventDefault(); try { await store.updateProject(id, { assignee_id: e.currentTarget.assignee_id.value || null }); toast(tr('Account manager saved.')); } catch (err) { toast(tr(err.message)); } });
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

['input', 'change'].forEach((type) => app.addEventListener(type, (ev) => { if (ev.target.matches?.('input, select, textarea')) ev.target.dataset.dirty = '1'; }));
let t = null;
store.onChange(() => { clearTimeout(t); t = setTimeout(() => render(true), 120); });
addEventListener('hashchange', () => render());
render();
