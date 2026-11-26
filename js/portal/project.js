// The project card in the CRM (projects audit 26.11.2026, five reviews). STAFF ONLY: imported by admin.js alone.
// One header with the facts that matter (stage and days in it, due, value and margin, account manager, who we are
// waiting on), the next stage one tap away, a bar of quick actions, and one Activity feed that puts stages, notes,
// messages, email, files, tasks, supplier quotes, bookings and every relink in time order. The side keeps the forms:
// stage, waiting on, who is on the project, tasks, dates and bookings, commercial, sharing a file, payments.
import { store } from './store.js';
import { STAGES, ALL_STAGES, DOC_KINDS, ACCOUNT_TYPES, stage, esc, fmtDate, fmtDay, fmtMoney, ago, stageBadge, isOverdue, $, $$, toast } from './core.js';
import { tr, LANG } from './i18n.js';
import { pipeline, nowCard, overviewPanel, documentsPanel, changesPanel, messagesPanel, bindDetail, counts } from './ui.js';
import { projectQuotes, newQuoteFor } from './quotes.js';
import { loadCosts, costsPanel, bindCosts } from './costs.js';
import { loadMail, mailPanel, bindMail } from './mail.js';
import { loadTasks, tasksBox, bindTasks, taskLate } from './tasks.js';
import { SOURCES } from './dashboard.js';
import { loadProjectCompanies, projectCompaniesBox, bindProjectCompanies, ROLES as CO_ROLES, PERSON_ROLES } from './companies.js';
import { linker, bindLinkers, picked, names } from './linker.js';

// Team words kept out of i18n.js (audit.spec keeps them off client-facing text; costs.js does the same).
export const t = (en, pl, vars) => (LANG === 'pl' ? pl : en).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');
export const WAITING = { client: 'the client', supplier: 'the supplier', subcontractor: t('the subcontractor', 'podwykonawcę'), other: 'someone else' };
export const BOOKING_KINDS = { survey: 'Survey', delivery: 'Delivery', install: 'Fitting', service: 'Service visit', other: 'Other' };
const TABS = [['activity', 'Activity'], ['overview', 'Overview'], ['documents', 'Documents'], ['changes', 'Changes'], ['messages', 'Messages'], ['mail', 'Email'], ['money', 'Quotes & costs']];
const DAY = 86400e3;
const daysSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : 0);
const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const workdays = (n) => { const d = new Date(); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return isoDay(d); };

let activeTab = 'activity', lastId = null, feedFilter = 'all';
const openFolds = new Set(['companies']);

// The client on the card: the portal owner, or who the project waits for.
const clientOf = (p) => (p.owner && p.owner.role !== 'staff' ? p.owner : null);
const headClient = (p, invites = []) => {
  const c = clientOf(p);
  if (c) return `${esc(c.full_name || '')}${c.company ? `, ${esc(c.company)}` : ''}${c.account_type ? ` · ${esc(tr(ACCOUNT_TYPES[c.account_type] || ''))}` : ''}`;
  const inv = invites.find((i) => i.make_owner) || invites[0];
  if (!inv) return esc(tr('No client yet'));
  return esc(tr(inv.make_owner && !inv.emailed_at ? 'Awaiting client sign-up: {email}' : 'Client invited: {email}', { email: inv.email }));
};

// ---------- the activity feed ----------
// Everything the card already loaded, as one list newest first. internal: only the team sees it.
function feed(d, ctx) {
  const { tasks, mail, costs, log, staff, pco, bookings, nameOf } = ctx;
  const who = (id) => staff.find((s) => s.id === id)?.full_name || d.members?.find((m) => m.user_id === id)?.user?.full_name || '';
  const out = [];
  const push = (at, kind, icon, title, body = '', actor = '', internal = true, extra = '') => { if (at) out.push({ at, kind, icon, title, body, actor, internal, extra }); };
  d.events.forEach((e) => push(e.created_at, 'stage', '▸', `${tr('Stage')}: ${stageBadge(e.to_stage, 'staff')}${e.visible_to_client ? '' : ` <span class="tag">${tr('hidden from client')}</span>`}`, e.note ? esc(tr(e.note)) : '', e.actor?.full_name || '', !e.visible_to_client));
  d.messages.forEach((m) => push(m.created_at, m.internal ? 'note' : 'message', m.internal ? '✎' : '💬', esc(tr(m.internal ? 'Internal note' : m.author?.role === 'staff' ? 'Message to the client' : 'Message from the client')), esc(m.body).replace(/\n/g, '<br>'), m.author?.full_name || '', m.internal));
  d.documents.forEach((x) => push(x.created_at, 'file', '📄', `${esc(tr(DOC_KINDS[x.kind] || 'Document'))}: ${esc(x.title)}${x.version ? ` · ${esc(x.version)}` : ''}${x.visible_to_client ? '' : ` <span class="tag">${tr('internal')}</span>`}`, '', x.uploader?.full_name || '', !x.visible_to_client));
  (d.approvals || []).forEach((a) => { const doc = d.documents.find((x) => x.id === a.document_id); push(a.created_at, 'file', a.decision === 'approved' ? '✓' : '↺', `${esc(tr(a.decision === 'approved' ? 'Approved' : 'Changes requested'))}: ${esc(doc?.title || '')}`, a.comment ? esc(a.comment) : '', a.actor?.full_name || '', false); });
  (d.changes || []).forEach((c) => { push(c.created_at, 'change', '⇄', `${esc(tr('Change raised'))}: ${esc(c.title)}`, c.impact ? esc(c.impact) : '', c.raiser?.full_name || '', false); if (c.decided_at) push(c.decided_at, 'change', '⇄', `${esc(tr('Change {status}', { status: tr(c.status) }))}: ${esc(c.title)}`, c.comment ? esc(c.comment) : '', c.decider?.full_name || '', false); });
  (d.payments || []).forEach((x) => { if (x.paid_at) push(x.paid_at, 'money', '£', `${esc(tr('Payment received'))}: ${esc(tr(x.label))} · ${esc(fmtMoney(x.amount))}`, '', '', false); });
  (tasks || []).forEach((t) => {
    push(t.created_at, 'task', '☐', `${esc(tr('Task'))}: ${esc(t.title)}`, esc([who(t.assignee_id), t.due_on ? tr('by {date}', { date: fmtDay(t.due_on) }) : '', t.template_id ? tr('from the stage playbook') : ''].filter(Boolean).join(' · ')), who(t.created_by));
    if (t.done_at) push(t.done_at, 'task', '☑', `${esc(tr('Done'))}: ${esc(t.title)}`, t.note ? esc(t.note) : '', who(t.done_by));
  });
  (mail || []).forEach((m) => push(m.sent_at, 'mail', m.direction === 'out' ? '↗' : '↙', `${esc(m.subject || tr('(no subject)'))}`, esc(m.direction === 'out' ? `${tr('To')} ${(m.to_addrs || []).join(', ')}` : `${m.from_name || ''} <${m.from_addr}>`), '', true, `data-feed-mail="${esc(m.id)}"`));
  (costs?.costs || []).forEach((c) => push(c.created_at, 'money', '£', `${esc(tr(c.status === 'requested' ? 'Supplier asked' : 'Supplier quote'))}: ${esc(c.supplier)}`, c.status === 'requested' ? '' : esc(fmtMoney(c.net_gbp ?? c.amount)), '', true));
  (bookings || []).forEach((b) => push(b.created_at, 'booking', '📅', `${esc(tr(BOOKING_KINDS[b.kind] || b.kind))}: ${esc(fmtDay(b.starts_on))}${b.ends_on !== b.starts_on ? ` – ${esc(fmtDay(b.ends_on))}` : ''}`, esc([nameOf(b.crew_company_id), who(b.staff_id), b.note].filter(Boolean).join(' · ')), who(b.created_by)));
  // The log of links and key facts (migration 0049), in words.
  const coName = (id) => pco?.links?.find((l) => l.company.id === id)?.company.name || nameOf(id) || tr('a company');
  const peName = (id) => pco?.people?.find((x) => x.person.id === id)?.person.full_name || nameOf(id) || tr('a person');
  const day = (v) => (v ? fmtDay(v) : tr('no date'));
  const LOG = {
    'project.assignee_id': (l) => tr('Account manager: {from} → {to}', { from: who(l.old_val) || tr('Unassigned'), to: who(l.new_val) || tr('Unassigned') }),
    'project.due_at': (l) => tr('Next update by: {date}', { date: day(l.new_val) }),
    'project.delivery_at': (l) => tr('Delivery date: {date}', { date: day(l.new_val) }),
    'project.install_at': (l) => tr('Fitting date: {date}', { date: day(l.new_val) }),
    'project.waiting_on': (l) => (l.new_val ? tr('Waiting on {who}', { who: tr(WAITING[l.new_val] || l.new_val) }) : tr('No longer waiting')),
    'project.value_gbp': (l) => tr('Value: {v}', { v: fmtMoney(l.new_val) }),
    'project.probability': (l) => tr('Probability: {v}%', { v: l.new_val ?? '—' }),
    'project.name': (l) => tr('Renamed: {v}', { v: l.new_val || '' }),
    'project.location': (l) => tr('Site: {v}', { v: l.new_val || '' }),
    'company.added': (l) => tr('{name} linked as {role}', { name: coName(l.entity_id), role: tr(CO_ROLES[l.new_val] || l.new_val || '') }),
    'company.removed': (l) => tr('{name} removed from the project', { name: coName(l.entity_id) }),
    'company.role': (l) => tr('{name}: role {from} → {to}', { name: coName(l.entity_id), from: tr(CO_ROLES[l.old_val] || l.old_val || ''), to: tr(CO_ROLES[l.new_val] || l.new_val || '') }),
    'person.added': (l) => tr('{name} linked as {role}', { name: peName(l.entity_id), role: tr(PERSON_ROLES[l.new_val] || l.new_val || '') }),
    'person.removed': (l) => tr('{name} removed from the project', { name: peName(l.entity_id) }),
    'person.role': (l) => tr('{name}: role {from} → {to}', { name: peName(l.entity_id), from: tr(PERSON_ROLES[l.old_val] || l.old_val || ''), to: tr(PERSON_ROLES[l.new_val] || l.new_val || '') }),
    'supplier_quote.project_id': (l) => (l.new_val === d.project.id ? tr('A supplier quote moved here from another project') : tr('A supplier quote moved to another project')),
    'supplier_quote.company_id': () => tr('Supplier quote linked to its company'),
    'task.project_id': (l) => (l.new_val === d.project.id ? tr('A task moved here') : tr('A task moved to another project')),
    'task.assignee_id': (l) => tr('Task handed over: {from} → {to}', { from: who(l.old_val) || tr('nobody'), to: who(l.new_val) || tr('nobody') }),
    'mail.project_id': (l) => (l.new_val === d.project.id ? tr('An email was filed on this project') : tr('An email moved to another project')),
    'quote.project_id': (l) => (l.new_val === d.project.id ? tr('A quote was pinned to this project') : tr('A quote was unpinned from this project')),
    'enquiry.project_id': (l) => (l.new_val === d.project.id ? tr('An enquiry joined this project') : tr('An enquiry left this project')),
    'booking.added': (l) => tr('Booked: {what}', { what: String(l.new_val || '').split(' · ').slice(0, 2).map((v, i) => (i ? fmtDay(v) : tr(BOOKING_KINDS[v] || v))).join(' ') }),
    'booking.removed': () => tr('A booking was removed'),
  };
  (log || []).forEach((l) => { const f = LOG[`${l.entity}.${l.field}`]; if (f && !(l.entity === 'booking' && l.field !== 'added' && l.field !== 'removed')) push(l.created_at, 'log', '⟲', esc(f(l)), '', l.actor?.full_name || '', true); });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
const FILTERS = { all: 'Everything', client: 'What the client sees', internal: 'Team only', mail: 'Email', task: 'Tasks', log: 'Changes to links and dates' };
function activityPanel(items) {
  const shown = items.filter((x) => feedFilter === 'all' || (feedFilter === 'client' ? !x.internal : feedFilter === 'internal' ? x.internal : feedFilter === 'task' ? x.kind === 'task' : feedFilter === 'log' ? x.kind === 'log' || x.kind === 'booking' : x.kind === feedFilter));
  return `<div class="activity" data-activity>
    <div class="seg seg-wrap" role="group" aria-label="${tr('Show')}">${Object.entries(FILTERS).map(([k, v]) => `<button type="button" data-feed="${k}" aria-pressed="${feedFilter === k}" class="${feedFilter === k ? 'is-on' : ''}">${esc(tr(v))}</button>`).join('')}</div>
    ${shown.length ? `<ol class="feed">${shown.slice(0, 200).map((x) => `<li class="feed-i feed-${x.kind}${x.internal ? ' is-internal' : ''}" ${x.extra}>
      <span class="feed-icon" aria-hidden="true">${x.icon}</span>
      <div class="feed-main"><span class="feed-t">${x.title}</span>${x.body ? `<span class="feed-b">${x.body}</span>` : ''}
        <span class="feed-meta" title="${esc(fmtDate(x.at, true))}">${esc(ago(x.at))}${x.actor ? ` · ${esc(x.actor)}` : ''}${x.internal ? '' : ` · <span class="tag">${tr('client sees')}</span>`}</span></div></li>`).join('')}</ol>`
      : `<p class="hint">${tr('Nothing here yet.')}</p>`}
  </div>`;
}

// ---------- the header ----------
function headFacts(p, d, margin, staff, wait) {
  const m = margin || {};
  const sale = m.sale_gbp ?? d.internal?.value_gbp;
  const inStage = daysSince(p.stage_changed_at);
  const due = isOverdue(p) ? `<strong class="kn-late">${esc(tr('Overdue {date}', { date: fmtDay(p.due_at) }))}</strong>` : p.due_at ? esc(fmtDay(p.due_at)) : '—';
  const item = (label, value, cls = '') => `<div class="${cls}"><dt>${tr(label)}</dt><dd>${value}</dd></div>`;
  return `<dl class="key-numbers">
    ${item('Stage', `${stageBadge(p.stage, 'staff')} <span class="note">${esc(tr('{n} d', { n: inStage }))}</span>`)}
    ${item('Due', due)}
    ${item('Value', sale == null || sale === '' ? '—' : esc(fmtMoney(sale)))}
    ${item('Margin', m.margin_gbp == null ? '—' : !Number(m.cost_gbp) ? `<span class="note">${tr('no costs entered')}</span>` : `${esc(fmtMoney(m.margin_gbp))}${m.margin_pct == null ? '' : ` (${esc(String(m.margin_pct))}%)`}`)}
    ${item('Account manager', `<label class="visually-hidden" for="head-owner">${tr('Account manager')}</label><select id="head-owner" class="head-owner" data-head-assignee><option value="">${tr('Unassigned')}</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === p.assignee_id ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select>`)}
    ${item('Waiting on', wait?.waiting_on ? `<span class="tag tag-wait">${esc(tr(WAITING[wait.waiting_on]))}</span> <span class="note">${esc(tr('{n} d', { n: daysSince(wait.waiting_since) }))}${wait.chase_on ? ` · ${esc(tr('chase {date}', { date: fmtDay(wait.chase_on) }))}` : ''}</span>` : '<span class="note">—</span>', wait?.waiting_on && wait.chase_on && wait.chase_on <= isoDay() ? 'kn-chase' : '')}
  </dl>`;
}
const QUICK = [['note', '+ Note'], ['task', '+ Task'], ['call', '+ Log a call'], ['mail', '+ Email'], ['doc', '+ File'], ['cost', '+ Supplier quote'], ['booking', '+ Booking'], ['person', '+ Person']];

// ---------- the card ----------
export async function projectView(app, id, ctx) {
  const { user, listRequests, REQ_TOPICS, bindReqFiles } = ctx;
  if (id !== lastId) { activeTab = 'activity'; lastId = id; feedFilter = 'all'; }
  const [d, staff, costs, mail, pq, reqs, tasks, pco, log, bookings] = await Promise.all([store.getProject(id), store.listStaff(), loadCosts(id), loadMail(id), projectQuotes(id).catch(() => []), listRequests(), loadTasks({ projectId: id }),
    loadProjectCompanies(id), store.crmLog ? store.crmLog({ projectId: id }).catch(() => []) : [], store.listBookings ? store.listBookings({ projectId: id }).catch(() => []) : []]);
  const nameOf = await names();
  const openTasks = (tasks || []).filter((t) => !t.done_at), lateTasks = openTasks.filter(taskLate).length;
  const src = (reqs || []).find((r) => r.project_id === id) || null;
  const p = d.project, wait = d.internal || {};
  document.title = `${p.ref} · ${p.name} | CRM`;
  const nextIdx = STAGES.findIndex((s) => s.id === p.stage) + 1;
  const suggested = STAGES[nextIdx]?.id || null;
  const c = counts(d, 'staff', user);
  const tabLabel = (tid, label) => `${tr(label)}${tid === 'documents' && c.documents ? ` (${c.documents})` : tid === 'changes' && c.changes ? ` (${c.changes})` : tid === 'messages' && c.messages ? ` (${c.messages})` : tid === 'mail' && mail?.length ? ` (${mail.length})` : tid === 'money' && (pq.length || costs.costs?.length) ? ` (${pq.length + (costs.costs?.length || 0)})` : ''}`;
  const items = feed(d, { tasks, mail, costs, log, staff, pco, bookings, nameOf });
  const panel = activeTab === 'documents' ? documentsPanel(d, 'staff', user) : activeTab === 'changes' ? changesPanel(d, 'staff', user) : activeTab === 'messages' ? messagesPanel(d, user)
    : activeTab === 'overview' ? overviewPanel(d, 'staff', 'staff', user) : activeTab === 'mail' ? mailPanel(mail)
    : activeTab === 'money' ? `<section class="ctl pq" data-project-quotes>
        <div class="pq-head"><h2 class="panel-h">${tr('Quotes')}</h2><button type="button" class="btn btn-sm" data-new-quote>+ ${tr('New quote')}</button></div>
        ${pq.length ? `<ul class="pq-list">${pq.map((x) => `<li><a href="#/quotes/${esc(x.id)}">${esc(x.reference)}${x.revision && x.revision !== '00' ? ` rev ${esc(x.revision)}` : ''}</a> <span class="tag">${esc(x.statusName)}</span> <span class="pq-total">${esc(fmtMoney(x.total))}</span></li>`).join('')}</ul>` : `<p class="hint">${tr('No quote yet. A new one takes the client, the site and the openings from this project.')}</p>`}
      </section>${costsPanel(costs)}`
    : activityPanel(items);
  const fold = (key, title, body, open = false) => `<details class="ctl fold" data-fold="${key}" ${openFolds.has(key) || open ? 'open' : ''}><summary class="panel-h">${title}</summary>${body}</details>`;
  const coName = (cid) => nameOf(cid);
  app.innerHTML = `
    <div class="container-wide section-tight project-card">
      <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/board">${tr('Pipeline')}</a></li><li aria-current="page">${esc(p.ref)}</li></ol></nav>
      <div class="detail-head project-head">
        <div><h1 class="app-h1">${esc(p.name)}</h1><p class="note">${esc(p.ref)} · ${esc(p.location || '')} · ${headClient(p, d.invites)}</p></div>
        ${suggested ? `<button type="button" class="btn btn-sm" data-next-stage="${esc(suggested)}">${esc(tr('Next stage: {stage}', { stage: tr(stage(suggested).staffLabel || stage(suggested).label) }))} ▸</button>` : ''}
      </div>
      ${headFacts(p, d, costs.margin, staff, wait)}
      <div class="quick-bar" role="toolbar" aria-label="${tr('Quick actions')}">${QUICK.map(([k, v]) => `<button type="button" class="btn btn-sm btn-ghost" data-quick="${k}">${esc(tr(v))}</button>`).join('')}</div>
      <div class="crm-grid">
        <div class="crm-main">
          ${nowCard(p, 'staff')}
          ${pipeline(p, d.events, 'staff')}
          <div class="tabs" role="tablist">${TABS.map(([tid, label]) => `<button type="button" role="tab" id="tab-${tid}" aria-selected="${tid === activeTab}" aria-controls="panel-${tid}" data-tab="${tid}">${tabLabel(tid, label)}${tid === 'changes' && c.pendingChanges ? ` <span class="dot-you" aria-label="${tr('action needed')}"></span>` : ''}</button>`).join('')}</div>
          <div class="tabpanel" role="tabpanel" id="panel-${activeTab}" aria-labelledby="tab-${activeTab}">${panel}</div>
        </div>
        <aside class="crm-side">
          <form class="ctl" data-stage novalidate>
            <h2 class="panel-h">${tr('Move stage')}</h2>
            <div class="field"><label for="ctl-stage">${tr('New stage')}</label><select id="ctl-stage" name="stage" required><option value="">${tr('Choose the new stage…')}</option>${ALL_STAGES.filter((s) => s.id !== p.stage).map((s) => `<option value="${s.id}">${esc(tr(s.staffLabel || s.label))}${s.id === suggested ? ` ${tr('(next)')}` : ''}</option>`).join('')}</select><span class="hint">${tr('Current:')} ${esc(tr(stage(p.stage).staffLabel || stage(p.stage).label))}</span></div>
            <div class="field"><label for="ctl-note">${tr('Note to client')}</label><textarea id="ctl-note" name="note" rows="2" placeholder="${tr('e.g. Quotation Q1 is in Documents.')}"></textarea></div>
            <div class="field"><label for="ctl-next">${tr('Next step (shown to client)')}</label><input id="ctl-next" name="next_step" value="${esc(p.next_step || '')}"></div>
            <div class="field"><label for="ctl-due">${tr('Next update by')}</label><input id="ctl-due" name="due" type="date" value="${p.due_at ? esc(new Date(p.due_at).toISOString().slice(0, 10)) : ''}"><span class="hint">${tr('Kept as it is unless you change it; blank = no date.')}</span></div>
            <label class="consent"><input type="checkbox" id="ctl-visible" name="visible"> <span>${tr('Visible to client and notify them')}</span></label>
            <p class="hint" data-stage-preview>${tr('Only the team sees this change.')}</p>
            <p class="hint" data-stage-tasks></p>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Update stage')}</button>
          </form>

          ${fold('waiting', `${tr('Waiting on')}${wait.waiting_on ? ` <span class="tag tag-wait">${esc(tr(WAITING[wait.waiting_on]))}</span>` : ''}`, `<form class="fold-body" data-waiting novalidate>
            <div class="field"><label for="w-on">${tr('Who has the ball')}</label><select id="w-on" name="waiting_on"><option value="">${tr('Nobody: our move')}</option>${Object.entries(WAITING).map(([k, v]) => `<option value="${k}" ${wait.waiting_on === k ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
            <div class="field"><label for="w-note">${tr('What for')}</label><input id="w-note" name="waiting_note" maxlength="300" value="${esc(wait.waiting_note || '')}" placeholder="${esc(tr('e.g. Production date from the factory'))}"></div>
            <div class="field"><label for="w-chase">${tr('Chase on')}</label><input id="w-chase" name="chase_on" type="date" value="${esc(wait.chase_on || '')}"><span class="hint">${tr('It shows in Today and My work on that day.')}</span></div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save')}</button></form>`, !!wait.waiting_on)}

          ${fold('companies', `${tr('People & companies')} ${(pco?.links?.length || 0) + (pco?.people?.length || 0) ? `<span class="tag">${(pco?.links?.length || 0) + (pco?.people?.length || 0)}</span>` : ''}`, `<div class="fold-body">${projectCompaniesBox(pco)}</div>`)}
          ${fold('tasks', `${tr('Tasks')} ${openTasks.length ? `<span class="tag${lateTasks ? ' tag-late' : ''}">${openTasks.length}</span>` : ''}`, `<div class="fold-body">${tasksBox(tasks, staff, user, { projectId: id }, 'tk-p')}</div>`, !!lateTasks)}

          ${fold('dates', `${tr('Dates & bookings')} ${bookings.length ? `<span class="tag">${bookings.length}</span>` : ''}`, `<div class="fold-body">
            <form data-dates>
              <p class="hint">${tr('What the client sees:')}</p>
              <div class="field-row">
                <div class="field"><label for="ctl-del">${tr('Delivery')}</label><input id="ctl-del" name="delivery" type="date" value="${p.delivery_at ? p.delivery_at.slice(0, 10) : ''}"></div>
                <div class="field"><label for="ctl-ins">${tr('Fitting')}</label><input id="ctl-ins" name="install" type="date" value="${p.install_at ? p.install_at.slice(0, 10) : ''}"></div>
              </div>
              <button class="btn btn-sm btn-ghost" type="submit">${tr('Save & notify client')}</button>
            </form>
            <h3 class="panel-h">${tr('Team calendar')}</h3>
            ${bookings.length ? `<ul class="task-list">${bookings.map((b) => `<li class="task" data-booking="${esc(b.id)}"><span><strong>${esc(tr(BOOKING_KINDS[b.kind] || b.kind))}</strong> · ${esc(fmtDay(b.starts_on))}${b.ends_on !== b.starts_on ? ` – ${esc(fmtDay(b.ends_on))}` : ''}<span class="note">${esc([coName(b.crew_company_id), staff.find((s) => s.id === b.staff_id)?.full_name, b.note].filter(Boolean).join(' · '))}</span></span><button type="button" class="q-icon" data-booking-del aria-label="${esc(tr('Remove booking'))}" title="${esc(tr('Remove booking'))}">×</button></li>`).join('')}</ul>` : `<p class="hint">${tr('Nothing booked yet.')}</p>`}
            <form class="task-form" data-booking-add novalidate>
              <div class="field-row">
                <div class="field"><label for="bk-kind">${tr('What')}</label><select id="bk-kind" name="kind">${Object.entries(BOOKING_KINDS).map(([k, v]) => `<option value="${k}" ${k === (['production', 'delivery', 'installation'].includes(p.stage) ? 'install' : 'survey') ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
                <div class="field"><label for="bk-staff">${tr('Who from the team')}</label><select id="bk-staff" name="staff_id"><option value="">—</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === (p.assignee_id || user.id) ? 'selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></div>
              </div>
              <div class="field-row">
                <div class="field"><label for="bk-start">${tr('From')}</label><input id="bk-start" name="starts_on" type="date" value="${workdays(2)}"></div>
                <div class="field"><label for="bk-end">${tr('To')}</label><input id="bk-end" name="ends_on" type="date" value="${workdays(2)}"></div>
              </div>
              ${linker({ id: 'bk-crew', label: t('Crew or subcontractor', 'Ekipa lub podwykonawca'), kinds: ['company'], name: 'crew', create: 'company:contractor', placeholder: tr('Type the company (optional)') })}
              <div class="field"><label for="bk-note">${tr('Note')}</label><input id="bk-note" name="note" maxlength="500" placeholder="${esc(tr('e.g. 2 fitters, crane at 8:00'))}"></div>
              <label class="consent"><input type="checkbox" name="client_date"> <span>${tr('Also set it as the client’s date (they get an email)')}</span></label>
              <button class="btn btn-sm" type="submit">${tr('Add to the calendar')}</button>
            </form>
            <a class="note" href="#/calendar">${tr('Open the calendar')}</a></div>`)}

          ${fold('internal', `${tr('Commercial')} <span class="tag">${tr('staff only')}</span>`, `<form class="fold-body" data-internal>
            <div class="field-row">
              <div class="field"><label for="ctl-val">${tr('Value (£)')}</label><input id="ctl-val" name="value_gbp" type="number" min="0" step="100" value="${esc(d.internal?.value_gbp ?? '')}"></div>
              <div class="field"><label for="ctl-prob">${tr('Probability (%)')}</label><input id="ctl-prob" name="probability" type="number" min="0" max="100" step="5" value="${esc(d.internal?.probability ?? '')}"></div>
            </div>
            <div class="field-row">
              <div class="field"><label for="ctl-src">${tr('Source')}</label><select id="ctl-src" name="source"><option value="">${tr('Not set')}</option>${Object.entries(SOURCES).filter(([k]) => k !== 'unknown').map(([k, v]) => `<option value="${k}" ${d.internal?.source === k ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
              <div class="field"><label for="ctl-camp">${tr('Campaign or referrer')}</label><input id="ctl-camp" name="campaign" maxlength="120" value="${esc(d.internal?.campaign || '')}"></div>
            </div>
            ${p.stage === 'closed' ? `<div class="field"><label for="ctl-lost">${tr('Why it was lost')}</label><input id="ctl-lost" name="lost_reason" maxlength="500" value="${esc(d.internal?.lost_reason || '')}" placeholder="${esc(tr('e.g. price, lead time, went with the builder'))}"></div>` : ''}
            <div class="field"><label for="ctl-notes">${tr('Notes')}</label><textarea id="ctl-notes" name="notes" rows="3">${esc(d.internal?.notes || '')}</textarea></div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Save')}</button>
          </form>`)}

          ${fold('doc', tr('Share a document'), `<form class="fold-body" data-doc>
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
          </form>`)}

          ${fold('payment', tr('Payment schedule'), `<form class="fold-body" data-payment>
            <div class="field"><label for="pay-label">${tr('Stage')}</label><input id="pay-label" name="label" placeholder="${tr('e.g. Deposit')}" required></div>
            <div class="field-row">
              <div class="field"><label for="pay-amt">${tr('Amount (£)')}</label><input id="pay-amt" name="amount" type="number" min="0" step="1" required></div>
              <div class="field"><label for="pay-due">${tr('Due')}</label><input id="pay-due" name="due" type="date"></div>
            </div>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Add payment')}</button>
          </form>`)}

          ${src ? fold('enquiry', tr('Source enquiry'), `<div class="fold-body enq-src">
            <p class="note">${esc(fmtDate(src.created_at))} · ${esc(tr(REQ_TOPICS[src.topic] || src.topic || ''))}${src.ref ? ` · ${esc(src.ref)}` : ''}</p>
            ${src.message ? `<p class="enq-msg">${esc(src.message)}</p>` : ''}
            ${src.files?.length || src.files_link ? `<p class="enq-files">${(src.files || []).map((f) => `<button type="button" class="btn btn-sm btn-ghost" data-req-file="${esc(f)}">${esc(f.split('/').pop())}</button>`).join(' ')}${src.files_link ? ` <a href="${esc(src.files_link)}" target="_blank" rel="noopener noreferrer">${tr('Link to larger files')}</a>` : ''}</p>` : ''}
            <a class="note" href="#/enquiries/${esc(src.id)}">${tr('Open the enquiry')}</a></div>`) : ''}
        </aside>
      </div>
    </div>`;

  const redraw = () => projectView(app, id, ctx);
  bindDetail(app, d, (tab) => { activeTab = tab; redraw(); });
  if (activeTab === 'money') bindCosts(app, id);
  bindTasks(app, user);
  bindProjectCompanies(app, id);
  if (activeTab === 'mail') bindMail(app, id);
  bindLinkers(app);
  bindReqFiles();
  $$('[data-feed]', app).forEach((b) => b.addEventListener('click', () => { feedFilter = b.dataset.feed; redraw(); }));
  $$('[data-feed-mail]', app).forEach((li) => li.addEventListener('click', () => { activeTab = 'mail'; redraw(); }));
  $('[data-new-quote]', app)?.addEventListener('click', async (e) => {
    const b = e.currentTarget; if (b.disabled) return; b.disabled = true;
    try { location.hash = `#/quotes/${await newQuoteFor(d)}`; } catch (err) { b.disabled = false; toast(tr(err.message)); }
  });
  $$('[data-fold]', app).forEach((el) => el.addEventListener('toggle', () => { if (el.open) openFolds.add(el.dataset.fold); else openFolds.delete(el.dataset.fold); }));

  // Quick actions: each opens the place where that thing is done and puts the cursor in it.
  const openFold = (key, sel) => { const f = $(`[data-fold="${key}"]`, app); if (f) { f.open = true; openFolds.add(key); } const el = sel && $(sel, app); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.focus({ preventScroll: true }); };
  const toTab = async (tab, after) => { activeTab = tab; await redraw(); after?.(); };
  const QUICK_DO = {
    note: () => toTab('messages', () => { const r = $('.composer-mode input[value="internal"]', app); if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } $('#msg-body', app)?.focus(); $('#msg-body', app)?.scrollIntoView({ block: 'center' }); }),
    task: () => openFold('tasks', '#tk-p-title'), call: () => openFold('tasks', '#tk-p-note'), doc: () => openFold('doc', '#ctl-file'),
    booking: () => openFold('dates', '#bk-start'), person: () => openFold('companies', '#pp-person'),
    mail: () => toTab('mail', () => $('[data-mail-new]', app)?.click()),
    cost: () => toTab('money', () => { const el = $('#cost-sup', app); el?.scrollIntoView({ block: 'center' }); el?.focus({ preventScroll: true }); }),
  };
  $$('[data-quick]', app).forEach((b) => b.addEventListener('click', () => QUICK_DO[b.dataset.quick]?.()));

  // The stage form: the next stage one tap away; the client is told only when ticked, and sees in advance what they
  // get; the stage's playbook tasks are named before they are made (0050).
  const sf = $('[data-stage]', app);
  let playbook = null;
  const pbLoad = async () => (playbook ??= store.listPlaybook ? await store.listPlaybook().catch(() => []) : []);
  const preview = async () => {
    const s = sf.stage.value ? stage(sf.stage.value) : null, out = $('[data-stage-preview]', sf), tk = $('[data-stage-tasks]', sf);
    out.textContent = !sf.visible.checked ? tr('Only the team sees this change.')
      : tr('The client sees “{stage}”{note} and gets an email.', { stage: s ? tr(s.homeLabel || s.label || s.id) : '…', note: sf.note.value.trim() ? tr(' with your note') : '' });
    const done = new Set((tasks || []).map((t) => t.template_id).filter(Boolean));
    const next = sf.stage.value ? (await pbLoad()).filter((b) => b.active && b.to_stage === sf.stage.value && !done.has(b.id)) : [];
    tk.textContent = next.length ? tr('Starts {n} tasks for {who}: {list}', { n: next.length, who: staff.find((x) => x.id === p.assignee_id)?.full_name || user.full_name || '', list: next.map((b) => tr(b.title)).join('; ') }) : '';
  };
  sf.stage.addEventListener('change', () => { const s = stage(sf.stage.value); if (s?.court === 'us' && !sf.due.value) { sf.due.value = workdays(2); sf.due.dataset.dirty = '1'; } preview(); });
  sf.visible.addEventListener('change', preview); sf.note.addEventListener('input', preview);
  $('[data-next-stage]', app)?.addEventListener('click', (e) => {
    sf.stage.value = e.currentTarget.dataset.nextStage; sf.stage.dispatchEvent(new Event('change', { bubbles: true })); // bubbles: marks it changed, so a live redraw keeps it
    sf.scrollIntoView({ block: 'start', behavior: 'smooth' }); sf.stage.focus({ preventScroll: true }); sf.classList.add('is-flash'); setTimeout(() => sf.classList.remove('is-flash'), 1200);
  });
  sf.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.stage.value) { f.stage.focus(); toast(tr('Choose the new stage first.')); return; }
    const due = f.due.value ? new Date(`${f.due.value}T17:00:00`).toISOString() : null;
    const btn = $('button[type="submit"]', f); if (btn.disabled) return; btn.disabled = true;
    try { await store.setStage(id, f.stage.value, { note: f.note.value.trim(), visible: f.visible.checked, next_step: f.next_step.value.trim(), due_at: due }); toast(tr(f.visible.checked ? 'Stage updated. Client notified.' : 'Stage updated (hidden from client).')); } catch (err) { btn.disabled = false; toast(tr(err.message)); }
  });
  $('[data-head-assignee]', app).addEventListener('change', async (e) => {
    try { await store.updateProject(id, { assignee_id: e.target.value || null }); toast(tr('Account manager saved.')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-waiting]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, on = f.waiting_on.value || null;
    try {
      await store.updateInternal(id, { waiting_on: on, waiting_note: on ? f.waiting_note.value.trim() : '', chase_on: on ? f.chase_on.value || null : null, waiting_since: on ? (on === wait.waiting_on && wait.waiting_since ? wait.waiting_since : new Date().toISOString()) : null });
      toast(tr(on ? 'Saved: waiting on {who}.' : 'Saved: our move.', { who: tr(WAITING[on] || '') }));
    } catch (err) { toast(tr(err.message)); }
  });
  $('[data-doc]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; const file = f.file.files[0]; if (!file) return;
    try { await store.uploadFiles(id, [file], { kind: f.kind.value, version: f.version.value.trim(), title: f.title.value.trim(), amount: f.amount.value, approval: f.approval.checked, visible: f.visible.checked }); toast(tr(f.visible.checked ? 'Shared. Client notified.' : 'Uploaded (internal).')); } catch (err) { toast(tr(err.message)); }
  });
  const iso = (v) => (v ? new Date(`${v}T09:00:00`).toISOString() : null);
  $('[data-dates]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.updateProject(id, { delivery_at: iso(f.delivery.value), install_at: iso(f.install.value) }); toast(tr('Dates saved. Client notified.')); } catch (err) { toast(tr(err.message)); }
  });
  const bf = $('[data-booking-add]', app);
  bf.starts_on.addEventListener('change', () => { if (!bf.ends_on.value || bf.ends_on.value < bf.starts_on.value) bf.ends_on.value = bf.starts_on.value; });
  bf.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.starts_on.value) { f.starts_on.focus(); toast(tr('Choose the day.')); return; }
    if (f.ends_on.value && f.ends_on.value < f.starts_on.value) { f.ends_on.focus(); toast(tr('The end date cannot be before the start.')); return; }
    const crew = picked(f, 'crew');
    try {
      await store.saveBooking({ project_id: id, kind: f.kind.value, starts_on: f.starts_on.value, ends_on: f.ends_on.value || f.starts_on.value, crew_company_id: crew?.id || null, staff_id: f.staff_id.value || null, note: f.note.value.trim() });
      if (crew && store.linkCompany) await store.linkCompany(id, crew.id, 'contractor').catch(() => {});
      if (f.client_date.checked && ['delivery', 'install'].includes(f.kind.value)) await store.updateProject(id, f.kind.value === 'delivery' ? { delivery_at: iso(f.starts_on.value) } : { install_at: iso(f.starts_on.value) });
      toast(tr('Added to the calendar.'));
    } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-booking-del]', app).forEach((b) => b.addEventListener('click', async () => { try { await store.deleteBooking(b.closest('[data-booking]').dataset.booking); toast(tr('Booking removed.')); } catch (err) { toast(tr(err.message)); } }));
  $('[data-payment]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.addPayment(id, { label: f.label.value.trim(), amount: f.amount.value, due_date: f.due.value ? new Date(`${f.due.value}T09:00:00`).toISOString() : null }); f.reset(); toast(tr('Payment added.')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-internal]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.updateInternal(id, { value_gbp: f.value_gbp.value === '' ? null : +f.value_gbp.value, probability: f.probability.value === '' ? null : +f.probability.value, notes: f.notes.value, source: f.source.value || null, campaign: f.campaign.value.trim(), ...(f.lost_reason ? { lost_reason: f.lost_reason.value.trim() } : {}) }); toast(tr('Saved.')); } catch (err) { toast(tr(err.message)); }
  });
}
