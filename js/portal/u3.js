// UX audit 27.11.2026, stage U3: the inbox, the side preview of a project, crew workload, the timeline, the team's
// own project fields and the offline notice. Staff only (imported by admin.js and the views it draws).
import { store } from './store.js';
import { esc, fmtDay, fmtMoney, ago, stageBadge, isOverdue, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { names } from './linker.js';
import { dialog, head, bindClose } from './crm-quick.js';

const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const monday = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDay(d); };
const KIND = { survey: 'Survey', delivery: 'Delivery', install: 'Installation', service: 'Service visit', other: 'Other' };

// ---------- Inbox: what was meant for me, with Done and Later ----------
let inboxTab = 'mine';
export async function inboxView(app) {
  document.title = `${tr('Inbox')} | CRM`;
  const notes = await store.notifications();
  const nowIso = new Date().toISOString();
  const snoozed = (n) => n.snooze_until && n.snooze_until > nowIso;
  const tabs = { mine: ['For me', notes.filter((n) => !n.read_at && !snoozed(n))], later: ['Later', notes.filter((n) => !n.read_at && snoozed(n))], all: ['Everything', notes] };
  const list = tabs[inboxTab][1];
  app.innerHTML = `<div class="container-wide section-tight" id="inbox">
    <div class="dash-head"><div><h1 class="app-h1">${tr('Inbox')}</h1></div>
      ${tabs.mine[1].length ? `<button type="button" class="btn btn-sm btn-ghost" data-inbox-all>${tr('Mark all done')}</button>` : ''}</div>
    <div class="seg" role="tablist" aria-label="${tr('Show')}">${Object.entries(tabs).map(([k, [l, arr]]) => `<button type="button" role="tab" aria-selected="${k === inboxTab}" class="${k === inboxTab ? 'is-on' : ''}" data-inbox-tab="${k}">${tr(l)} <span class="today-n">${arr.length}</span></button>`).join('')}</div>
    ${list.length ? `<ul class="inbox-list">${list.map((n) => `<li class="inbox-i${n.read_at ? ' is-read' : ''}" data-note-row="${esc(n.id)}">
      <a class="inbox-main" href="#/${n.project_id ? `p/${esc(n.project_id)}` : 'my'}" data-inbox-open="${esc(n.id)}"><span class="inbox-t">${esc(n.title)}</span>${n.body ? `<span class="inbox-b">${esc(n.body)}</span>` : ''}<span class="inbox-time">${esc(ago(n.created_at))}${snoozed(n) ? ` · ${esc(tr('back {date}', { date: fmtDay(n.snooze_until) }))}` : ''}</span></a>
      ${n.read_at ? '' : `<span class="inbox-acts"><button type="button" class="btn btn-sm btn-ghost" data-inbox-later="${esc(n.id)}">${tr('Tomorrow')}</button><button type="button" class="btn btn-sm" data-inbox-done="${esc(n.id)}">${tr('Done')}</button></span>`}
    </li>`).join('')}</ul>` : `<p class="today-done">${inboxTab === 'mine' ? tr('Inbox zero. Nothing waits for you.') : tr('Nothing here.')}</p>`}
  </div>`;
  $$('[data-inbox-tab]', app).forEach((b) => b.addEventListener('click', () => { inboxTab = b.dataset.inboxTab; inboxView(app); }));
  $$('[data-inbox-done]', app).forEach((b) => b.addEventListener('click', async () => { b.closest('li').hidden = true; try { await store.markRead([b.dataset.inboxDone]); } catch (err) { toast(tr(err.message), { tone: 'error' }); } }));
  $$('[data-inbox-open]', app).forEach((a) => a.addEventListener('click', () => store.markRead([a.dataset.inboxOpen]).catch(() => {})));
  $$('[data-inbox-later]', app).forEach((b) => b.addEventListener('click', async () => {
    const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0);
    b.closest('li').hidden = true;
    try { await store.snoozeNote(b.dataset.inboxLater, t.toISOString()); toast(tr('Back tomorrow at 8:00.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  }));
  $('[data-inbox-all]', app)?.addEventListener('click', async () => { try { await store.markRead(tabs.mine[1].map((n) => n.id)); } catch (err) { toast(tr(err.message), { tone: 'error' }); } });
}

// ---------- Preview of a project beside the board or list (Esc closes, the board stays) ----------
export async function peekProject(id) {
  const [d, tasks, staff] = await Promise.all([store.getProject(id), store.listTasks ? store.listTasks({ projectId: id, open: true }).catch(() => []) : [], store.listStaff().catch(() => [])]);
  const p = d.project, i = d.internal || {};
  const open = (tasks || []).filter((t) => !t.done_at).slice(0, 6);
  const fact = (l, v) => `<div><dt>${tr(l)}</dt><dd>${v}</dd></div>`;
  const dlg = dialog('qd-peek', `${head(`${esc(p.ref)} · ${esc(p.name)}`)}
    <div class="qd-body">
      <p class="note">${esc(p.location || '')}</p>
      <dl class="peek-facts">
        ${fact('Stage', stageBadge(p.stage, 'staff'))}
        ${fact('Due', p.due_at ? `${isOverdue(p) ? '<strong class="kn-late">' : ''}${esc(fmtDay(p.due_at))}${isOverdue(p) ? '</strong>' : ''}` : '—')}
        ${fact('Value', i.value_gbp ? esc(fmtMoney(i.value_gbp)) : '—')}
        ${fact('Account manager', esc(staff.find((s) => s.id === p.assignee_id)?.full_name || '—'))}
      </dl>
      ${p.next_step ? `<p><span class="note">${tr('Next step shown to client:')}</span> ${esc(p.next_step)}</p>` : ''}
      <h3 class="panel-h">${tr('Open tasks')} <span class="today-n">${open.length}</span></h3>
      ${open.length ? `<ul class="peek-tasks">${open.map((t) => `<li>${esc(t.title)}${t.due_on ? ` <span class="note">· ${esc(fmtDay(t.due_on))}</span>` : ''}</li>`).join('')}</ul>` : `<p class="note">${tr('No open tasks.')}</p>`}
      <div class="qd-acts"><a class="btn" href="#/p/${esc(p.id)}" data-close>${tr('Open the full card')}</a><button type="button" class="btn btn-ghost" data-close>${tr('Close')}</button></div>
    </div>`);
  bindClose(dlg);
}

// ---------- Crew and team workload: days booked per week, six weeks ahead ----------
export async function workloadSection() {
  const from = monday(isoDay()), to = addDays(from, 41);
  const [books, staff, nameOf] = await Promise.all([store.listBookings ? store.listBookings({ from, to }).catch(() => []) : [], store.listStaff().catch(() => []), names()]);
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => addDays(from, w * 7));
  const rows = new Map();
  const add = (key, label, b) => { if (!rows.has(key)) rows.set(key, { label, days: weeks.map(() => new Set()) }); const r = rows.get(key); for (let d = b.starts_on; d <= b.ends_on; d = addDays(d, 1)) { const w = weeks.findIndex((s) => d >= s && d < addDays(s, 7)); if (w >= 0 && new Date(`${d}T12:00:00`).getDay() % 6) r.days[w].add(d); } };
  (books || []).forEach((b) => { if (b.crew_company_id) add(`c:${b.crew_company_id}`, nameOf(b.crew_company_id) || tr('Crew'), b); if (b.staff_id) add(`s:${b.staff_id}`, staff.find((s) => s.id === b.staff_id)?.full_name || tr('Staff'), b); });
  const list = [...rows.values()];
  return `<section class="ctl workload"><h2 class="panel-h">${tr('Workload, next 6 weeks')}</h2>
    ${list.length ? `<div class="table-scroll"><table class="dash-table wl-table"><thead><tr><th scope="col">${tr('Crew or person')}</th>${weeks.map((w) => `<th scope="col">${esc(fmtDay(`${w}T12:00:00`))}</th>`).join('')}</tr></thead><tbody>
      ${list.map((r) => `<tr><th scope="row">${esc(r.label)}</th>${r.days.map((s, i) => `<td class="wl-c${s.size >= 5 ? ' is-full' : s.size >= 3 ? ' is-busy' : s.size ? ' is-some' : ''}"><a href="#/calendar" data-wl-week="${esc(weeks[i])}" aria-label="${esc(tr('{n} days booked', { n: s.size }))}">${s.size || '·'}</a></td>`).join('')}</tr>`).join('')}
    </tbody></table></div><p class="note">${tr('Weekdays with a booking. 5 = a full week.')}</p>` : `<p class="note">${tr('No bookings in the next 6 weeks.')} <a href="#/calendar">${tr('Open the calendar')}</a></p>`}
  </section>`;
}

// ---------- Timeline: each project's bookings on one line, eight weeks ----------
export async function timelineView(app) {
  document.title = `${tr('Timeline')} | CRM`;
  const from = monday(addDays(isoDay(), -7)), days = 63, to = addDays(from, days - 1), t0 = isoDay();
  const [books, projects] = await Promise.all([store.listBookings ? store.listBookings({ from, to }).catch(() => []) : [], store.listProjects()]);
  const byP = new Map(); (books || []).forEach((b) => byP.set(b.project_id, [...(byP.get(b.project_id) || []), b]));
  const rows = projects.filter((p) => byP.has(p.id) || ((p.delivery_at || p.install_at) && [p.delivery_at, p.install_at].some((x) => x && x.slice(0, 10) >= from && x.slice(0, 10) <= to)));
  const col = (iso) => Math.max(1, Math.min(days, Math.round((new Date(`${iso}T12:00:00`) - new Date(`${from}T12:00:00`)) / 864e5) + 1));
  const weeks = Array.from({ length: 9 }, (_, w) => addDays(from, w * 7));
  app.innerHTML = `<div class="container-wide section-tight" id="timeline">
    <div class="dash-head"><div><h1 class="app-h1">${tr('Timeline')}</h1></div><a class="btn btn-sm btn-ghost" href="#/calendar">${tr('Calendar')}</a></div>
    <p class="note mb-m">${tr('Surveys, deliveries and fittings of each project over eight weeks. Change a date on the project card.')}</p>
    ${rows.length ? `<div class="tl-scroll"><div class="tl" style="--tl-days:${days}">
      <div class="tl-head"><span class="tl-name"></span>${weeks.map((w) => `<span class="tl-w" style="grid-column:${col(w) + 1} / span 7">${esc(fmtDay(`${w}T12:00:00`))}</span>`).join('')}${t0 >= from && t0 <= to ? `<span class="tl-today" style="grid-column:${col(t0) + 1}" aria-hidden="true"></span>` : ''}</div>
      ${rows.map((p) => `<div class="tl-row"><a class="tl-name" href="#/p/${esc(p.id)}">${esc(p.ref)} · ${esc(p.name)}</a>${(byP.get(p.id) || []).map((b) => `<a class="tl-bar cal-${esc(b.kind)}" href="#/p/${esc(p.id)}" style="grid-column:${col(b.starts_on < from ? from : b.starts_on) + 1} / ${col(b.ends_on > to ? to : b.ends_on) + 2}" title="${esc(`${tr(KIND[b.kind] || b.kind)}: ${fmtDay(`${b.starts_on}T12:00:00`)}${b.ends_on !== b.starts_on ? ` – ${fmtDay(`${b.ends_on}T12:00:00`)}` : ''}`)}">${esc(tr(KIND[b.kind] || b.kind))}</a>`).join('')}</div>`).join('')}
    </div></div>` : `<p class="callout">${tr('Nothing booked in these eight weeks.')} <a href="#/calendar">${tr('Open the calendar')}</a></p>`}
  </div>`;
}

// ---------- The team's own project fields ----------
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40) || 'field';
export async function fieldsManager() {
  const fields = store.listFields ? await store.listFields().catch(() => []) : [];
  return `<section class="ctl mt-l" data-fields-box><h2 class="panel-h">${tr('Project fields of our own')}</h2>
    <p class="note">${tr('Extra facts every project card shows to the team, e.g. system, RAL colour or crew. The client never sees them.')}</p>
    ${fields.length ? `<ul class="task-list">${fields.map((f) => `<li class="task" data-field="${esc(f.key)}"><span><strong>${esc(f.label)}</strong> <span class="note">${esc(tr({ text: 'Text', select: 'List', date: 'Date', number: 'Number' }[f.kind] || f.kind))}${f.options?.length ? `: ${esc(f.options.join(', '))}` : ''}</span></span><button type="button" class="q-icon" data-field-del="${esc(f.key)}" aria-label="${esc(tr('Remove the field {name}', { name: f.label }))}">×</button></li>`).join('')}</ul>` : ''}
    <form class="field-add" data-field-add novalidate>
      <div class="field"><label for="pf-label">${tr('Field name')}</label><input id="pf-label" name="label" maxlength="60" required placeholder="${esc(tr('e.g. RAL colour'))}"></div>
      <div class="field"><label for="pf-kind">${tr('Kind')}</label><select id="pf-kind" name="kind"><option value="text">${tr('Text')}</option><option value="select">${tr('List')}</option><option value="date">${tr('Date')}</option><option value="number">${tr('Number')}</option></select></div>
      <div class="field"><label for="pf-opts">${tr('List choices, comma between')}</label><input id="pf-opts" name="options" maxlength="400"></div>
      <button class="btn btn-sm" type="submit">${tr('Add the field')}</button>
    </form></section>`;
}
export function bindFieldsManager(root, again) {
  $('[data-field-add]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, label = f.label.value.trim();
    if (!label) { f.label.focus(); return; }
    try { await store.saveField({ key: slug(label), label, kind: f.kind.value, options: f.kind.value === 'select' ? f.options.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30) : [], sort: Date.now() % 1e6 }); toast(tr('Field added.'), { tone: 'ok' }); again(); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  });
  $$('[data-field-del]', root).forEach((b) => b.addEventListener('click', async () => { try { await store.deleteField(b.dataset.fieldDel); again(); } catch (err) { toast(tr(err.message), { tone: 'error' }); } }));
}
// On the project card: one input per field, saved when it changes.
export function projectFieldsBox(fields, custom = {}) {
  if (!fields.length) return '';
  const input = (f) => {
    const v = custom[f.key] ?? '', id = `pfv-${f.key}`;
    if (f.kind === 'select') return `<select id="${id}" data-pf="${esc(f.key)}"><option value="">—</option>${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    return `<input id="${id}" data-pf="${esc(f.key)}" type="${f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'}" value="${esc(String(v))}" maxlength="200">`;
  };
  return `<dl class="pf-list">${fields.map((f) => `<div class="field"><dt><label for="pfv-${esc(f.key)}">${esc(f.label)}</label></dt><dd>${input(f)}</dd></div>`).join('')}</dl>`;
}
export function bindProjectFields(root, pid, custom = {}) {
  const now = { ...custom };
  $$('[data-pf]', root).forEach((el) => el.addEventListener('change', async () => {
    now[el.dataset.pf] = el.value;
    try { await store.updateInternal(pid, { custom: now }); delete el.dataset.dirty; toast(tr('Saved.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  }));
}

// ---------- Offline: say so at once, instead of failing on the next save ----------
export function watchOnline() {
  const bar = document.createElement('div'); bar.className = 'offline-bar'; bar.setAttribute('role', 'status'); bar.hidden = navigator.onLine !== false;
  bar.textContent = tr('You are offline. What you see may be out of date and changes will not save until the connection is back.');
  document.body.prepend(bar);
  const text = bar.textContent;
  const show = () => { const n = store.queued ? store.queued() : 0; bar.textContent = n ? `${text} ${tr('{n} change(s) wait on this device.', { n })}` : text; };
  addEventListener('offline', () => { bar.hidden = false; show(); });
  addEventListener('online', () => { bar.hidden = true; toast(tr('Back online.'), { tone: 'ok' }); });
  // Queued changes (store-supabase.js): say when they are kept, sent, or could not be saved.
  addEventListener('bp-queue', (e) => {
    show();
    if (!e.detail) { toast(tr('No connection: kept on this device, sent when you are back online.')); return; }
    if (e.detail.failed) toast(tr('{n} change(s) made offline could not be saved. Check them and try again.', { n: e.detail.failed }), { tone: 'error' });
    else if (e.detail.sent) toast(tr('{n} change(s) made offline are saved.', { n: e.detail.sent }), { tone: 'ok' });
  });
}
