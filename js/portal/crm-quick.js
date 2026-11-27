// UX audit 27.11.2026, stage U1: the quick ways in. One dialog to move a stage (from a drag on the board, the list
// or anywhere else), "+ New" for a project from a phone call or a task, and the Ctrl+K / "/" palette that finds
// anything and goes anywhere. Native <dialog>: Escape closes, focus returns to what opened it.
import { store } from './store.js';
import { ALL_STAGES, stage, esc, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { ICON } from './icons.js';

const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (iso) => (iso ? isoDay(new Date(iso)) : '');

function dialog(cls, html) {
  const d = document.createElement('dialog');
  d.className = `qd ${cls}`;
  d.innerHTML = html;
  document.body.append(d);
  const back = document.activeElement;
  d.addEventListener('close', () => { d.remove(); back?.focus?.(); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // a click on the backdrop
  d.showModal();
  return d;
}
const head = (title) => `<div class="qd-head"><h2 class="qd-h">${title}</h2><button type="button" class="qd-x" data-close aria-label="${esc(tr('Close'))}">×</button></div>`;
const bindClose = (d) => $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));

// ---------- moving a stage ----------
// The same choices as the card's "Move stage" form: the client hears of it only when ticked, the date stays as it is.
export function stageDialog(p, to = '') {
  const d = dialog('qd-stage', `${head(esc(tr('Move {ref} to…', { ref: p.ref })))}
    <form class="qd-body" data-stage-go novalidate>
      <p class="note">${esc(p.name)}</p>
      <div class="field"><label for="qs-stage">${tr('New stage')}</label><select id="qs-stage" name="stage">${ALL_STAGES.filter((s) => s.id !== p.stage).map((s) => `<option value="${esc(s.id)}" ${s.id === to ? 'selected' : ''}>${esc(tr(s.staffLabel || s.label))}</option>`).join('')}</select></div>
      <div class="field"><label for="qs-note">${tr('Note to client')}</label><textarea id="qs-note" name="note" rows="2"></textarea></div>
      <div class="field"><label for="qs-due">${tr('Next update by')}</label><input id="qs-due" name="due" type="date" value="${esc(dayOf(p.due_at))}"><span class="hint">${tr('Kept as it is unless you change it; blank = no date.')}</span></div>
      <label class="consent"><input type="checkbox" name="visible"> <span>${tr('Tell the client (email and portal)')}</span></label>
      <div class="qd-acts"><button class="btn" type="submit">${tr('Move')}</button><button class="btn btn-ghost" type="button" data-close>${tr('Cancel')}</button></div>
    </form>`);
  bindClose(d);
  const f = $('form', d); f.stage.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', f); if (btn.disabled) return; btn.disabled = true;
    try {
      await store.setStage(p.id, f.stage.value, { note: f.note.value.trim(), visible: f.visible.checked, due_at: f.due.value ? new Date(`${f.due.value}T17:00:00`).toISOString() : null });
      d.close();
      toast(tr(f.visible.checked ? 'Stage updated. Client notified.' : 'Stage updated (hidden from client).'), { tone: 'ok' });
    } catch (err) { btn.disabled = false; toast(tr(err.message), { tone: 'error' }); }
  });
  return d;
}

// ---------- + New ----------
export function newDialog(user, kind = 'project') {
  const d = dialog('qd-new', `${head(tr('New'))}
    <div class="seg qd-tabs" role="tablist">${[['project', 'Project from a call'], ['task', 'Task']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === kind}" class="${k === kind ? 'is-on' : ''}" data-new-kind="${k}">${tr(l)}</button>`).join('')}</div>
    <form class="qd-body" data-new="project" ${kind === 'project' ? '' : 'hidden'} novalidate>
      <div class="field"><label for="qn-name">${tr('Project name')}</label><input id="qn-name" name="name" required maxlength="200" placeholder="${esc(tr('e.g. Rear sliders, Hackney'))}"></div>
      <div class="field"><label for="qn-loc">${tr('Site / postcode')}</label><input id="qn-loc" name="location" maxlength="200"></div>
      <div class="field-row">
        <div class="field"><label for="qn-who">${tr('Contact name')}</label><input id="qn-who" name="who" maxlength="200"></div>
        <div class="field"><label for="qn-tel">${tr('Phone')}</label><input id="qn-tel" name="phone" type="tel" maxlength="60"></div>
      </div>
      <div class="field"><label for="qn-mail">${tr('Email address')}</label><input id="qn-mail" name="email" type="email" maxlength="200"></div>
      <div class="field"><label for="qn-brief">${tr('What they want')}</label><textarea id="qn-brief" name="brief" rows="2" maxlength="4000"></textarea></div>
      <p class="hint">${tr('The project starts at Received with you as account manager. The client gets nothing until you invite them.')}</p>
      <div class="qd-acts"><button class="btn" type="submit">${tr('Create the project')}</button><button class="btn btn-ghost" type="button" data-close>${tr('Cancel')}</button></div>
    </form>
    <form class="qd-body" data-new="task" ${kind === 'task' ? '' : 'hidden'} novalidate>
      <div class="field"><label for="qt-title">${tr('Task')}</label><input id="qt-title" name="title" required maxlength="300"></div>
      <div class="field"><label for="qt-due">${tr('Due')}</label><input id="qt-due" name="due" type="date" value="${isoDay()}"></div>
      <p class="hint">${tr('A task of your own, not on a project. Tasks on a project are added on its card.')}</p>
      <div class="qd-acts"><button class="btn" type="submit">${tr('Add the task')}</button><button class="btn btn-ghost" type="button" data-close>${tr('Cancel')}</button></div>
    </form>`);
  bindClose(d);
  const show = (k) => { $$('[data-new]', d).forEach((f) => { f.hidden = f.dataset.new !== k; }); $$('[data-new-kind]', d).forEach((b) => { const on = b.dataset.newKind === k; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }); $(`[data-new="${k}"] input`, d).focus(); };
  $$('[data-new-kind]', d).forEach((b) => b.addEventListener('click', () => show(b.dataset.newKind)));
  show(kind);
  $('[data-new="project"]', d).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.name.value.trim()) { f.name.setAttribute('aria-invalid', 'true'); f.name.focus(); toast(tr('Give the project a name.'), { tone: 'error' }); return; }
    const btn = $('button[type="submit"]', f); if (btn.disabled) return; btn.disabled = true;
    try {
      const id = await store.createProject({ name: f.name.value.trim(), location: f.location.value.trim(), brief: f.brief.value.trim(), systems: [] }, [], []);
      await store.updateProject(id, { assignee_id: user.id }).catch(() => {});
      if (f.who.value.trim() && store.savePerson) {
        const pe = await store.savePerson({ full_name: f.who.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim() }).catch(() => null);
        if (pe && store.linkPerson) await store.linkPerson(id, pe.id, 'decision', true).catch(() => {});
      }
      d.close(); toast(tr('Project created.'), { tone: 'ok' }); location.hash = `#/p/${id}`;
    } catch (err) { btn.disabled = false; toast(tr(err.message), { tone: 'error' }); }
  });
  $('[data-new="task"]', d).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    if (!f.title.value.trim()) { f.title.setAttribute('aria-invalid', 'true'); f.title.focus(); return; }
    try { await store.addTask({ title: f.title.value.trim(), due_on: f.due.value || null, assignee_id: user.id }); d.close(); toast(tr('Task added.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  });
}

// ---------- Ctrl+K: find anything, go anywhere ----------
const PLACES = [['#/today', 'Today'], ['#/my', 'My work'], ['#/board', 'Projects'], ['#/list', 'Projects: list'], ['#/enquiries', 'Enquiries'], ['#/calendar', 'Calendar'], ['#/mail', 'Email'], ['#/companies', 'Companies'], ['#/quotes', 'Quotes'], ['#/owner', 'Dashboard'], ['#/playbook', 'Stage tasks']];
export async function palette(user) {
  if ($('dialog.qd-pal')) return;
  const d = dialog('qd-pal', `<form class="pal" role="search" data-pal><label class="visually-hidden" for="pal-q">${tr('Find or go to')}</label>
    <span class="pal-ico">${ICON.search}</span><input id="pal-q" type="search" autocomplete="off" placeholder="${esc(tr('Find a project, enquiry, company or person… or type a command'))}" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list">
    <kbd class="pal-k">Esc</kbd></form><ul class="pal-list" id="pal-list" role="listbox"></ul>`);
  const q = $('#pal-q', d), list = $('#pal-list', d);
  q.focus();
  const [projects, reqs, cos, ppl] = await Promise.all([store.listProjects().catch(() => []), store.listRequests ? store.listRequests().catch(() => []) : [], store.listCompanies ? store.listCompanies().catch(() => []) : [], store.listPeople ? store.listPeople().catch(() => []) : []]);
  const client = (p) => (p.owner && p.owner.role !== 'staff' ? p.owner.company || p.owner.full_name || '' : '');
  const items = [
    { kind: 'action', label: tr('New project from a call'), sub: tr('Command'), run: () => newDialog(user, 'project') },
    { kind: 'action', label: tr('New task'), sub: tr('Command'), run: () => newDialog(user, 'task') },
    ...PLACES.map(([href, l]) => ({ kind: 'place', label: tr(l), sub: tr('Go to'), href })),
    ...projects.map((p) => ({ kind: 'project', label: `${p.ref} · ${p.name}`, sub: [tr(stage(p.stage).staffLabel || stage(p.stage).label), p.location, client(p)].filter(Boolean).join(' · '), href: `#/p/${p.id}`, hay: [p.ref, p.name, p.location, client(p), p.assignee?.full_name].join(' ') })),
    ...reqs.map((r) => ({ kind: 'enquiry', label: `${r.ref || ''} · ${r.name || r.email}`, sub: [tr('Enquiry'), r.company, r.location].filter(Boolean).join(' · '), href: `#/enquiries/${r.id}`, hay: [r.ref, r.name, r.email, r.company, r.location, r.phone].join(' ') })),
    ...cos.map((c) => ({ kind: 'company', label: c.name, sub: tr('Company'), href: `#/company/${c.id}`, hay: [c.name, c.email, c.phone].join(' ') })),
    ...ppl.map((p) => ({ kind: 'person', label: p.full_name, sub: [tr('Person'), cos.find((c) => c.id === p.company_id)?.name].filter(Boolean).join(' · '), href: p.company_id ? `#/company/${p.company_id}` : '#/companies', hay: [p.full_name, p.email, p.phone].join(' ') })),
  ];
  // Recently opened projects first when nothing is typed (kept in this browser only).
  let recent = []; try { recent = JSON.parse(localStorage.getItem('bp-crm-recent') || '[]'); } catch { /* private mode */ }
  let shown = [], at = 0;
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const draw = () => {
    const words = fold(q.value).split(/\s+/).filter(Boolean);
    shown = words.length
      ? items.filter((x) => { const h = fold(`${x.label} ${x.sub} ${x.hay || ''}`); return words.every((w) => h.includes(w)); }).slice(0, 12)
      : [...recent.map((h) => items.find((x) => x.href === h)).filter(Boolean).slice(0, 5), ...items.filter((x) => x.kind === 'action' || x.kind === 'place')].slice(0, 14);
    at = Math.min(at, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((x, i) => `<li role="option" id="pal-${i}" aria-selected="${i === at}" class="pal-i pal-${x.kind}${i === at ? ' is-on' : ''}" data-i="${i}"><span class="pal-t">${esc(x.label)}</span><span class="pal-s">${esc(x.sub || '')}</span></li>`).join('') : `<li class="pal-none">${tr('Nothing found.')}</li>`;
    q.setAttribute('aria-activedescendant', shown.length ? `pal-${at}` : '');
    $('.pal-i.is-on', list)?.scrollIntoView({ block: 'nearest' });
  };
  const go = (x) => {
    if (!x) return;
    d.close();
    if (x.run) { x.run(); return; }
    location.hash = x.href;
  };
  q.addEventListener('input', () => { at = 0; draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[at]); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) go(shown[Number(li.dataset.i)]); });
  draw();
}
// Remember the last projects opened, for the palette (this browser only; nothing is stored on the server).
export const rememberRecent = (hash) => {
  if (!/^#\/p\/[\w-]+$/.test(hash)) return;
  try { const r = JSON.parse(localStorage.getItem('bp-crm-recent') || '[]').filter((h) => h !== hash); r.unshift(hash); localStorage.setItem('bp-crm-recent', JSON.stringify(r.slice(0, 8))); } catch { /* private mode */ }
};

// ---------- keyboard ----------
// Ctrl+K or / opens the palette; N new; G then T/M/P/E/C/D goes to a place; ? shows the list. Never while typing.
const GO = { t: '#/today', m: '#/my', p: '#/board', l: '#/list', e: '#/enquiries', c: '#/calendar', d: '#/owner', q: '#/quotes', o: '#/companies', i: '#/mail' };
export function bindKeys(getUser) {
  let g = 0;
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('dialog[open]')) palette(getUser()); return; }
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === '/') { e.preventDefault(); palette(getUser()); return; }
    if (g && Date.now() - g < 1200 && GO[e.key.toLowerCase()]) { e.preventDefault(); g = 0; location.hash = GO[e.key.toLowerCase()]; return; }
    g = 0;
    if (e.key === 'g') g = Date.now();
    else if (e.key === 'n') { e.preventDefault(); newDialog(getUser(), 'project'); }
    else if (e.key === 't') { e.preventDefault(); newDialog(getUser(), 'task'); }
    else if (e.key === '?') { e.preventDefault(); keysHelp(); }
  });
}
function keysHelp() {
  const rows = [['Ctrl K  /', 'Find or go to'], ['N', 'New project from a call'], ['T', 'New task'], ['G T', 'Today'], ['G M', 'My work'], ['G P', 'Projects'], ['G L', 'Projects: list'], ['G E', 'Enquiries'], ['G C', 'Calendar'], ['G I', 'Email'], ['G O', 'Companies'], ['G Q', 'Quotes'], ['G D', 'Dashboard'], ['?', 'This list']];
  const d = dialog('qd-keys', `${head(tr('Keyboard shortcuts'))}<dl class="keys">${rows.map(([k, l]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(tr(l))}</dd></div>`).join('')}</dl>`);
  bindClose(d);
}
