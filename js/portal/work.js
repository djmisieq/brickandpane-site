// How the team works (projects audit 26.11.2026, teamwork review). STAFF ONLY: imported by admin.js alone.
//  - My work: one person's tasks by when they are due, what they gave to others, the projects to chase today, the
//    calendar for the week and the notes that mention them; the owner can open anyone's, and hand it all over to
//    someone else for a holiday in one step.
//  - Calendar: surveys, deliveries, fitting and service visits (migration 0050) by week or month, with clashes of a
//    crew or a person on the same day, and an .ics file to send to a crew.
//  - Stage playbook: the tasks each stage starts, edited by the team.
import { store } from './store.js';
import { ALL_STAGES, STAGES, esc, fmtDay, stageBadge, stageLabel, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { loadTasks, item as taskItem, bindTasks, taskLate } from './tasks.js';
import { names } from './linker.js';
import { BOOKING_KINDS, WAITING, t } from './project.js';

const DAY = 86400e3;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => isoDay(new Date());
const plus = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const monday = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDay(d); };

// ---------- My work ----------
let whose = null;
export async function myWorkView(app, nav, user) {
  document.title = `${tr('My work')} | CRM`;
  whose ||= user.id;
  const [tasks, projects, staff, notes, nameOf] = await Promise.all([loadTasks({ open: true }), store.listProjects(), store.listStaff(), store.notifications().catch(() => []), names()]);
  const bookings = store.listBookings ? await store.listBookings({ from: today(), to: plus(today(), 7) }).catch(() => []) : [];
  const me = staff.find((s) => s.id === whose) || user, mine = whose === user.id;
  const pOf = (id) => projects.find((p) => p.id === id);
  const label = (t) => { const p = pOf(t.project_id); return p ? { project: `${p.ref} · ${p.name}`, href: `#/p/${p.id}` } : t.request_id ? { project: tr('Enquiry'), href: `#/enquiries/${t.request_id}` } : {}; };
  const open = (tasks || []).filter((t) => t.assignee_id === whose || (!t.assignee_id && t.created_by === whose));
  const t0 = today(), wk = plus(t0, 7);
  const buckets = [
    ['late', 'Late', open.filter(taskLate)],
    ['today', 'Today', open.filter((t) => t.due_on === t0)],
    ['week', 'Next 7 days', open.filter((t) => t.due_on > t0 && t.due_on <= wk)],
    ['later', 'Later', open.filter((t) => t.due_on > wk)],
    ['nodate', 'No date', open.filter((t) => !t.due_on)],
  ];
  const given = (tasks || []).filter((t) => t.created_by === whose && t.assignee_id && t.assignee_id !== whose);
  const myProjects = projects.filter((p) => p.assignee_id === whose && !['completed', 'closed'].includes(p.stage));
  const chase = myProjects.filter((p) => p.internal?.waiting_on && p.internal.chase_on && p.internal.chase_on <= t0);
  const waiting = myProjects.filter((p) => p.internal?.waiting_on && !chase.includes(p));
  const myBookings = bookings.filter((b) => b.staff_id === whose || pOf(b.project_id)?.assignee_id === whose);
  const mentions = mine ? notes.filter((n) => ['mention', 'task', 'assigned'].includes(n.type) && !n.read_at) : [];
  const list = (arr, empty) => (arr.length ? `<ul class="task-list">${arr.map((t) => taskItem(t, staff, label(t))).join('')}</ul>` : `<p class="note">${tr(empty)}</p>`);
  const prow = (p, sub) => `<li><a class="today-row" href="#/p/${esc(p.id)}"><span class="today-t">${esc(p.ref)} · ${esc(p.name)}</span><span class="today-s">${sub}</span></a></li>`;
  app.innerHTML = `<div class="container-wide section-tight" id="my-work">
    <div class="dash-head"><div><span class="eyebrow">${esc(fmtDay(new Date().toISOString()))}</span><h1 class="app-h1">${mine ? tr('My work') : tr('Work of {name}', { name: esc(me.full_name || '') })}</h1></div>
      <dl class="stats"><div class="stat ${buckets[0][2].length ? 'is-you' : ''}"><dt>${tr('Late')}</dt><dd>${buckets[0][2].length}</dd></div><div class="stat"><dt>${tr('Today')}</dt><dd>${buckets[1][2].length}</dd></div><div class="stat ${chase.length ? 'is-you' : ''}"><dt>${tr('Chase today')}</dt><dd>${chase.length}</dd></div><div class="stat"><dt>${tr('Projects')}</dt><dd>${myProjects.length}</dd></div></dl></div>
    <div class="board-tools">${nav}
      <label class="visually-hidden" for="mw-who">${tr('Whose work')}</label><select id="mw-who" data-mw-who>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === whose ? 'selected' : ''}>${esc(s.id === user.id ? tr('Me ({name})', { name: s.full_name }) : s.full_name)}</option>`).join('')}</select>
      <a class="btn btn-sm btn-ghost" href="#/playbook">${tr('Stage playbook')}</a></div>
    <div class="work-grid">
      <div data-tasks data-project="" data-request="">
        ${buckets.map(([id, name, arr]) => `<section class="today-sec" id="mw-${id}"><h2 class="panel-h">${tr(name)} <span class="today-n">${arr.length}</span></h2>${list(arr, id === 'late' ? 'Nothing late.' : 'Nothing here.')}</section>`).join('')}
        <section class="today-sec" id="mw-given"><h2 class="panel-h">${tr('Given to others')} <span class="today-n">${given.length}</span></h2>${list(given, 'Nothing given to others.')}</section>
      </div>
      <div>
        ${mentions.length ? `<section class="today-sec" id="mw-mentions"><h2 class="panel-h">${tr('For you')} <span class="today-n">${mentions.length}</span></h2><ul class="today-list">${mentions.map((n) => `<li><a class="today-row" href="${n.project_id ? `#/p/${esc(n.project_id)}` : '#/my'}" data-note="${esc(n.id)}"><span class="today-t">${esc(n.title)}</span><span class="today-s">${esc(n.body || '')}</span></a></li>`).join('')}</ul></section>` : ''}
        <section class="today-sec" id="mw-chase"><h2 class="panel-h">${tr('Chase today')} <span class="today-n">${chase.length}</span></h2>${chase.length ? `<ul class="today-list">${chase.map((p) => prow(p, `${esc(tr('Waiting on {who}', { who: tr(WAITING[p.internal.waiting_on]) }))}${p.internal.waiting_note ? `: ${esc(p.internal.waiting_note)}` : ''}`)).join('')}</ul>` : `<p class="note">${tr('Nobody to chase today.')}</p>`}</section>
        <section class="today-sec" id="mw-week"><h2 class="panel-h">${tr('Calendar, next 7 days')} <span class="today-n">${myBookings.length}</span></h2>${myBookings.length ? `<ul class="today-list">${myBookings.map((b) => { const p = pOf(b.project_id); return `<li><a class="today-row" href="#/p/${esc(b.project_id)}"><span class="today-t">${esc(tr(BOOKING_KINDS[b.kind] || b.kind))} · ${esc(fmtDay(b.starts_on))}</span><span class="today-s">${esc(p ? `${p.ref} · ${p.name}` : '')}${b.crew_company_id ? ` · ${esc(nameOf(b.crew_company_id))}` : ''}</span></a></li>`; }).join('')}</ul>` : `<p class="note">${tr('Nothing booked.')} <a href="#/calendar">${tr('Open the calendar')}</a></p>`}</section>
        <section class="today-sec"><h2 class="panel-h">${tr('Projects I look after')} <span class="today-n">${myProjects.length}</span></h2>${myProjects.length ? `<ul class="today-list">${myProjects.map((p) => prow(p, `${stageBadge(p.stage, 'staff')}${p.internal?.waiting_on ? ` <span class="tag tag-wait">${esc(tr(WAITING[p.internal.waiting_on]))}</span>` : ''}`)).join('')}</ul>` : `<p class="note">${tr('No open projects.')}</p>`}${waiting.length ? `<p class="note">${tr('{n} waiting on others.', { n: waiting.length })}</p>` : ''}</section>
        <form class="ctl" data-handover novalidate><h2 class="panel-h">${tr('Hand over (holiday, sick leave)')}</h2>
          <p class="hint">${tr('Gives every open task and every open project of {name} to someone else. Each one is logged and the new person is told.', { name: esc(me.full_name || '') })}</p>
          <div class="field"><label for="ho-to">${tr('To')}</label><select id="ho-to" name="to"><option value="">${tr('Choose…')}</option>${staff.filter((s) => s.id !== whose).map((s) => `<option value="${esc(s.id)}">${esc(s.full_name)}</option>`).join('')}</select></div>
          <label class="consent"><input type="checkbox" name="sure"> <span>${tr('Hand over {t} tasks and {p} projects', { t: open.length, p: myProjects.length })}</span></label>
          <button class="btn btn-sm btn-ghost" type="submit">${tr('Hand over')}</button></form>
      </div>
    </div></div>`;
  bindTasks(app, user);
  $('[data-mw-who]', app).addEventListener('change', (e) => { whose = e.target.value; myWorkView(app, nav, user); });
  $$('[data-note]', app).forEach((a) => a.addEventListener('click', () => store.markRead([a.dataset.note])));
  $('[data-handover]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.to.value) { f.to.focus(); toast(tr('Choose who takes it over.')); return; }
    if (!f.sure.checked) { toast(tr('Tick the box to hand it over.')); return; }
    const btn = $('button[type="submit"]', f); btn.disabled = true;
    try {
      for (const t of open) await store.updateTask(t.id, { assignee_id: f.to.value });
      for (const p of myProjects) await store.updateProject(p.id, { assignee_id: f.to.value });
      toast(tr('Handed over.'));
    } catch (err) { btn.disabled = false; toast(tr(err.message)); }
  });
}

// ---------- Calendar ----------
let anchor = null, mode = 'week', calWho = '', calKind = '';
const ics = (rows) => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const txt = (s) => String(s || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brick & Pane//CRM//EN', 'CALSCALE:GREGORIAN',
    ...rows.flatMap((r) => ['BEGIN:VEVENT', `UID:${r.id}@brickandpane.co.uk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${r.starts_on.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${plus(r.ends_on, 1).replace(/-/g, '')}`,
      `SUMMARY:${txt(r.summary)}`, `LOCATION:${txt(r.location)}`, `DESCRIPTION:${txt(r.description)}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
};
export async function calendarView(app, nav, user) {
  document.title = `${tr('Calendar')} | CRM`;
  anchor ||= today();
  const start = mode === 'week' ? monday(anchor) : monday(`${anchor.slice(0, 8)}01`);
  const days = mode === 'week' ? 7 : 42, end = plus(start, days - 1);
  const [bookings, projects, staff, nameOf] = await Promise.all([store.listBookings ? store.listBookings({ from: start, to: end }).catch(() => []) : [], store.listProjects(), store.listStaff(), names()]);
  const pOf = (id) => projects.find((p) => p.id === id);
  const shown = bookings.filter((b) => (!calWho || b.staff_id === calWho || pOf(b.project_id)?.assignee_id === calWho) && (!calKind || b.kind === calKind));
  // The client's delivery and fitting dates, where no booking of that kind covers them yet.
  const client = projects.flatMap((p) => [['delivery', p.delivery_at], ['install', p.install_at]].filter(([, at]) => at && at.slice(0, 10) >= start && at.slice(0, 10) <= end)
    .filter(([k, at]) => !bookings.some((b) => b.project_id === p.id && b.kind === k && b.starts_on <= at.slice(0, 10) && b.ends_on >= at.slice(0, 10)))
    .map(([k, at]) => ({ id: `c-${p.id}-${k}`, project_id: p.id, kind: k, starts_on: at.slice(0, 10), ends_on: at.slice(0, 10), clientOnly: true })))
    .filter((b) => (!calKind || b.kind === calKind) && (!calWho || pOf(b.project_id)?.assignee_id === calWho));
  const all = [...shown, ...client];
  // A crew or a person on two jobs the same day.
  const clash = new Set();
  for (let i = 0; i < days; i++) {
    const d = plus(start, i), on = shown.filter((b) => b.starts_on <= d && b.ends_on >= d);
    const by = (k) => { const m = {}; on.forEach((b) => { if (b[k]) (m[b[k]] ||= []).push(b.id); }); Object.values(m).filter((x) => x.length > 1).flat().forEach((id) => clash.add(`${id}|${d}`)); };
    by('crew_company_id'); by('staff_id');
  }
  const entry = (b, d) => { const p = pOf(b.project_id); return `<a class="cal-e cal-${esc(b.kind)}${b.clientOnly ? ' is-client' : ''}${clash.has(`${b.id}|${d}`) ? ' is-clash' : ''}" href="#/p/${esc(b.project_id)}" title="${esc([p?.name, nameOf(b.crew_company_id), staff.find((s) => s.id === b.staff_id)?.full_name, b.note].filter(Boolean).join(' · '))}">
    <span class="cal-k">${esc(tr(BOOKING_KINDS[b.kind] || b.kind))}${b.clientOnly ? ` · ${tr('client date')}` : ''}${clash.has(`${b.id}|${d}`) ? ` · ${tr('clash')}` : ''}</span><span class="cal-p">${esc(p ? `${p.ref} · ${p.name}` : '')}</span>${b.crew_company_id || b.staff_id ? `<span class="cal-w">${esc([nameOf(b.crew_company_id), staff.find((s) => s.id === b.staff_id)?.full_name].filter(Boolean).join(' · '))}</span>` : ''}</a>`; };
  const cells = Array.from({ length: days }, (_, i) => plus(start, i));
  const month = anchor.slice(0, 7), t0 = today();
  const title = mode === 'week' ? tr('Week of {date}', { date: fmtDay(`${start}T12:00:00`) }) : new Date(`${anchor.slice(0, 8)}15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  app.innerHTML = `<div class="container-wide section-tight" id="calendar">
    <div class="dash-head"><div><h1 class="app-h1">${tr('Calendar')}</h1><p class="note">${esc(title)}${clash.size ? ` · <strong class="kn-late">${tr('{n} clashes', { n: new Set([...clash].map((x) => x.split('|')[0])).size })}</strong>` : ''}</p></div></div>
    <div class="board-tools">${nav}</div>
    <div class="board-tools cal-tools">
      <div class="seg" role="group" aria-label="${tr('Move')}"><button type="button" data-cal="-1" aria-label="${tr('Earlier')}">‹</button><button type="button" data-cal="0">${tr('Today')}</button><button type="button" data-cal="1" aria-label="${tr('Later')}">›</button></div>
      <div class="seg" role="group" aria-label="${tr('View')}"><button type="button" data-cal-mode="week" aria-pressed="${mode === 'week'}" class="${mode === 'week' ? 'is-on' : ''}">${tr('Week')}</button><button type="button" data-cal-mode="month" aria-pressed="${mode === 'month'}" class="${mode === 'month' ? 'is-on' : ''}">${tr('Month')}</button></div>
      <label class="visually-hidden" for="cal-who">${tr('Whose')}</label><select id="cal-who" data-cal-who><option value="">${tr('Everyone')}</option>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === calWho ? 'selected' : ''}>${esc(s.id === user.id ? tr('Me ({name})', { name: s.full_name }) : s.full_name)}</option>`).join('')}</select>
      <label class="visually-hidden" for="cal-kind">${tr('What')}</label><select id="cal-kind" data-cal-kind><option value="">${tr('Everything')}</option>${Object.entries(BOOKING_KINDS).map(([k, v]) => `<option value="${k}" ${k === calKind ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select>
      <button type="button" class="btn btn-sm btn-ghost" data-cal-ics ${shown.length ? '' : 'disabled'}>${tr('Download .ics')}</button>
    </div>
    <div class="cal cal-${mode}">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-h" aria-hidden="true">${tr(d)}</div>`).join('')}
      ${cells.map((d) => { const on = all.filter((b) => b.starts_on <= d && b.ends_on >= d); return `<div class="cal-d${d === t0 ? ' is-today' : ''}${mode === 'month' && d.slice(0, 7) !== month ? ' is-out' : ''}${new Date(`${d}T12:00:00`).getDay() % 6 ? '' : ' is-weekend'}" data-day="${d}">
        <span class="cal-n">${esc(fmtDay(`${d}T12:00:00`))}</span>${on.map((b) => entry(b, d)).join('')}</div>`; }).join('')}
    </div>
    <p class="hint">${tr('Bookings are added on the project card, in Dates & bookings. Client dates without a booking show faded.')}</p>
  </div>`;
  const again = () => calendarView(app, nav, user);
  $$('[data-cal]', app).forEach((b) => b.addEventListener('click', () => { const n = +b.dataset.cal; anchor = n === 0 ? today() : mode === 'week' ? plus(anchor, 7 * n) : (() => { const d = new Date(`${anchor.slice(0, 8)}15T12:00:00`); d.setMonth(d.getMonth() + n); return isoDay(d); })(); again(); }));
  $$('[data-cal-mode]', app).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.calMode; again(); }));
  $('[data-cal-who]', app).addEventListener('change', (e) => { calWho = e.target.value; again(); });
  $('[data-cal-kind]', app).addEventListener('change', (e) => { calKind = e.target.value; again(); });
  $('[data-cal-ics]', app).addEventListener('click', () => {
    const rows = shown.map((b) => { const p = pOf(b.project_id); return { id: b.id, starts_on: b.starts_on, ends_on: b.ends_on, summary: `${tr(BOOKING_KINDS[b.kind] || b.kind)}: ${p?.name || ''}`, location: p?.location || '', description: [p?.ref, nameOf(b.crew_company_id), b.note].filter(Boolean).join(' · ') }; });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics(rows)], { type: 'text/calendar' })); a.download = `brickandpane-${start}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

// ---------- Stage playbook ----------
const KINDS = { task: 'Task', call: 'Call', email: 'Email', visit: 'Visit' };
export async function playbookView(app, nav) {
  document.title = `${tr('Stage playbook')} | CRM`;
  const list = store.listPlaybook ? await store.listPlaybook() : [];
  const stages = ALL_STAGES.filter((s) => STAGES.some((x) => x.id === s.id));
  app.innerHTML = `<div class="container section-tight" id="playbook">
    <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/my">${tr('My work')}</a></li><li aria-current="page">${tr('Stage playbook')}</li></ol></nav>
    <h1 class="app-h1">${tr('Stage playbook')}</h1>
    <p class="note mb-m">${t('When a project reaches a stage, these tasks are made for its account manager, once per project, due the given number of working days later. Switch one off to stop it.', 'Gdy projekt dochodzi do etapu, te zadania powstają dla jego opiekuna, raz na projekt, z terminem po podanej liczbie dni roboczych. Wyłącz zadanie, żeby przestało powstawać.')}</p>
    <div class="board-tools">${nav}</div>
    ${stages.map((s) => { const rows = list.filter((b) => b.to_stage === s.id); return `<section class="ctl pb-stage"><h2 class="panel-h">${stageBadge(s.id, 'staff')} <span class="note">${esc(stageLabel(s.id, 'staff'))}</span></h2>
      ${rows.length ? `<ul class="task-list">${rows.map((b) => `<li class="task${b.active ? '' : ' is-done'}" data-pb="${esc(b.id)}"><span><strong>${esc(tr(b.title))}</strong><span class="note">${esc(tr(KINDS[b.kind] || b.kind))} · ${esc(t('{n} working days', 'dni robocze: {n}', { n: b.offset_days }))}</span></span>
        <button type="button" class="btn btn-sm btn-ghost" data-pb-toggle>${b.active ? tr('Switch off') : tr('Switch on')}</button><button type="button" class="q-icon" data-pb-del aria-label="${esc(tr('Delete'))}" title="${esc(tr('Delete'))}">×</button></li>`).join('')}</ul>` : `<p class="hint">${tr('No tasks for this stage.')}</p>`}
      <form class="task-form" data-pb-add data-stage="${esc(s.id)}" novalidate><div class="field-row">
        <div class="field"><label for="pb-t-${s.id}">${tr('New task')}</label><input id="pb-t-${s.id}" name="title" maxlength="300"></div>
        <div class="field"><label for="pb-k-${s.id}">${tr('How')}</label><select id="pb-k-${s.id}" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></div>
        <div class="field"><label for="pb-d-${s.id}">${t('Working days later', 'Ile dni roboczych później')}</label><input id="pb-d-${s.id}" name="offset_days" type="number" min="0" max="90" value="1"></div></div>
        <button class="btn btn-sm btn-ghost" type="submit">${tr('Add')}</button></form></section>`; }).join('')}
  </div>`;
  $$('[data-pb-add]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const title = f.title.value.trim(); if (!title) { f.title.focus(); toast(tr('Write what needs doing.')); return; }
    try { await store.savePlaybook({ to_stage: f.dataset.stage, title, kind: f.kind.value, offset_days: Math.max(0, Math.min(90, +f.offset_days.value || 0)), sort: list.filter((b) => b.to_stage === f.dataset.stage).length + 1 }); toast(tr('Added.')); playbookView(app, nav); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-pb-toggle]', app).forEach((b) => b.addEventListener('click', async () => { const row = list.find((x) => x.id === b.closest('[data-pb]').dataset.pb); try { await store.savePlaybook({ id: row.id, active: !row.active }); playbookView(app, nav); } catch (err) { toast(tr(err.message)); } }));
  $$('[data-pb-del]', app).forEach((b) => b.addEventListener('click', async () => { try { await store.deletePlaybook(b.closest('[data-pb]').dataset.pb); playbookView(app, nav); } catch (err) { toast(tr(err.message)); } }));
}
