// "Link / move" picker (projects audit 26.11.2026): one search box with suggestions for projects, companies and
// people, used everywhere something is linked or moved (a company or a person on a project, a supplier on a quote,
// a task, an email or an enquiry to another project, a duplicate into the record it merges with). Replaces the bare
// <select> of 1000+ companies. STAFF ONLY: imported by the CRM modules alone.
// ARIA combobox: type, ↑/↓, Enter picks, Esc closes. The cold campaign list is searched only once 3 letters are typed
// and comes last. "+ Create" adds a company or a person in the same step.
import { store } from './store.js';
import { esc, stageBadge, $$, toast } from './core.js';
import { tr } from './i18n.js';

// Lists kept for 30 s: every live change would otherwise reload 2000+ rows; creating from a picker clears them.
const cache = {}, TTL = 30e3;
export const forget = () => { for (const k of Object.keys(cache)) delete cache[k]; };
addEventListener('hashchange', forget); // a new screen reads fresh lists
const load = (kind) => { if (cache[kind] && Date.now() - cache[kind].at > TTL) delete cache[kind]; return (cache[kind] ||= Object.assign(({
  project: () => store.listProjects(),
  company: () => (store.listCompanies ? store.listCompanies() : []),
  person: () => (store.listPeople ? store.listPeople() : []),
}[kind]() || Promise.resolve([])).then((x) => x || []).catch(() => { delete cache[kind]; return []; }), { at: Date.now() })); };
// id → the name of a company or a person, from the same lists (the activity feed, bookings).
export async function names() {
  const [co, pe] = await Promise.all([load('company'), load('person')]);
  const m = new Map([...co.map((c) => [c.id, c.name]), ...pe.map((p) => [p.id, p.full_name])]);
  return (id) => (id ? m.get(id) || '' : '');
}

export const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const LIMIT = 8;
const DONE = ['completed', 'closed'];

async function search(kinds, raw, exclude) {
  const q = fold(raw).trim(), words = q.split(/\s+/).filter(Boolean);
  const hit = (...xs) => { const hay = fold(xs.filter(Boolean).join(' ')); return words.every((w) => hay.includes(w)); };
  const [projects, companies, people] = await Promise.all([
    kinds.includes('project') ? load('project') : [], kinds.includes('company') || kinds.includes('person') ? load('company') : [], kinds.includes('person') ? load('person') : [],
  ]);
  const coName = (id) => companies.find((c) => c.id === id)?.name || '';
  const out = [];
  if (kinds.includes('project')) projects.filter((p) => !exclude.has(p.id) && (!q || hit(p.ref, p.name, p.location, p.owner?.full_name, p.owner?.company)))
    .sort((a, b) => (DONE.includes(a.stage) - DONE.includes(b.stage)) || String(b.updated_at).localeCompare(String(a.updated_at)))
    .forEach((p) => out.push({ kind: 'project', id: p.id, label: `${p.ref} · ${p.name}`, sub: `${stageBadge(p.stage, 'staff')} ${esc(p.location || '')}`, rank: DONE.includes(p.stage) ? 2 : 0 }));
  if (kinds.includes('company')) companies.filter((c) => !exclude.has(c.id) && (c.source !== 'cold' || q.length >= 3) && (!q || hit(c.name, c.email, c.website, c.phone)))
    .forEach((c) => out.push({ kind: 'company', id: c.id, label: c.name, sub: esc([tr({ architect: 'Architect', contractor: 'Contractor', developer: 'Developer', supplier: 'Supplier', homeowner: 'Homeowner', other: 'Other' }[c.kind] || c.kind), c.source === 'cold' ? tr('cold') : '', c.do_not_contact ? tr('do not contact') : '', c.email].filter(Boolean).join(' · ')), rank: c.source === 'cold' ? 3 : 1, item: c }));
  if (kinds.includes('person')) people.filter((p) => !exclude.has(p.id) && (q.length >= 2) && hit(p.full_name, p.email, p.phone, coName(p.company_id)))
    .forEach((p) => out.push({ kind: 'person', id: p.id, label: p.full_name, sub: esc([p.job_title, coName(p.company_id), p.email, p.do_not_contact ? tr('do not contact') : ''].filter(Boolean).join(' · ')), rank: 1, item: p }));
  // Exact starts first, then by rank (open projects, companies the team works with, the cold list last).
  const starts = (x) => (q && fold(x.label).startsWith(q) ? 0 : 1);
  return out.sort((a, b) => starts(a) - starts(b) || a.rank - b.rank || a.label.localeCompare(b.label)).slice(0, LIMIT);
}

// o: { id, label, kinds: ['project'|'company'|'person'], value, text, placeholder, create: 'company:supplier' | 'person',
//      free: true (the typed text is kept as is when nothing is picked, e.g. a supplier's name), name (hidden id field),
//      textName (name of the visible field), exclude: [ids], hint }
export function linker(o) {
  const id = o.id;
  return `<div class="field linker" data-linker data-kinds="${esc(o.kinds.join(','))}" data-create="${esc(o.create || '')}" data-free="${o.free ? '1' : ''}" data-exclude="${esc((o.exclude || []).join(','))}">
    <label for="${esc(id)}">${esc(o.label)}</label>
    <input id="${esc(id)}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${esc(id)}-list" autocomplete="off" maxlength="200"
      ${o.textName ? `name="${esc(o.textName)}"` : ''} value="${esc(o.text || '')}" placeholder="${esc(o.placeholder || tr('Type to search…'))}" data-linker-input>
    <input type="hidden" id="${esc(id)}-v" name="${esc(o.name || 'target')}" value="${esc(o.value || '')}" data-linker-value data-linker-kind="${esc(o.valueKind || '')}">
    <ul class="linker-list" role="listbox" id="${esc(id)}-list" hidden></ul>
    ${o.hint ? `<span class="hint">${esc(o.hint)}</span>` : ''}
  </div>`;
}

// Wires every picker under root. A pick fires "linker:pick" on the picker element with { kind, id, label, item }.
export function bindLinkers(root) {
  $$('[data-linker]', root).forEach((box) => {
    if (box.dataset.bound) return; box.dataset.bound = '1';
    const input = box.querySelector('[data-linker-input]'), hidden = box.querySelector('[data-linker-value]'), list = box.querySelector('.linker-list');
    const kinds = box.dataset.kinds.split(','), creating = () => (box.dataset.create || '').split(':'); // read on use: a role can change the kind
    const exclude = new Set((box.dataset.exclude || '').split(',').filter(Boolean));
    let items = [], active = -1, seq = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const mark = () => $$('[role="option"]', list).forEach((li, i) => { li.classList.toggle('is-active', i === active); li.setAttribute('aria-selected', String(i === active)); if (i === active) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } });
    const draw = async () => {
      const n = ++seq, text = input.value.trim();
      const found = await search(kinds, text, exclude);
      if (n !== seq) return; // a newer keystroke won
      items = [...found]; const [ckind] = creating();
      if (ckind && text.length >= 2 && !found.some((x) => fold(x.label) === fold(text))) items.push({ kind: ckind, create: true, label: text, sub: esc(tr(ckind === 'person' ? 'Add as a new person' : 'Add it to Companies')) });
      list.innerHTML = items.length ? items.map((x, i) => `<li role="option" id="${esc(input.id)}-o${i}" aria-selected="false" data-i="${i}" class="linker-opt${x.create ? ' is-create' : ''}"><span class="linker-t">${x.create ? `+ ${esc(tr('Create “{name}”', { name: x.label }))}` : esc(x.label)}</span><span class="linker-s">${x.sub || ''}</span></li>`).join('')
        : `<li class="linker-empty">${esc(tr(text ? 'Nothing found.' : 'Type to search…'))}</li>`;
      // A free-text box (a supplier's name) picks nothing until asked, so Enter still sends its form.
      list.hidden = false; input.setAttribute('aria-expanded', 'true'); active = items.length && !box.dataset.free ? 0 : -1; mark();
    };
    const pick = async (x) => {
      if (!x) return;
      try {
        if (x.create) {
          const [, csub] = creating();
          const row = x.kind === 'person' ? await store.savePerson({ full_name: x.label }) : await store.saveCompany({ name: x.label, kind: csub || 'other' });
          x = { kind: x.kind, id: row.id, label: x.kind === 'person' ? row.full_name : row.name, item: row, created: true };
        }
      } catch (err) { toast(/already exists/.test(err.message) ? tr('A company with this name and kind already exists.') : tr(err.message)); return; }
      if (x.created) forget();
      hidden.value = x.id; hidden.dataset.linkerKind = x.kind; input.value = x.label; input.dataset.picked = x.label; close();
      box.dispatchEvent(new CustomEvent('linker:pick', { bubbles: true, detail: x }));
    };
    input.addEventListener('input', () => { if (input.dataset.picked !== input.value) { hidden.value = ''; hidden.dataset.linkerKind = ''; } clearTimeout(input._t); input._t = setTimeout(draw, 120); });
    input.addEventListener('focus', () => { if (!input.value) draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) { draw(); return; } active = Math.min(active + 1, items.length - 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); mark(); }
      else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); pick(items[active]); }
      else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the box while clicking
    list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) pick(items[+li.dataset.i]); });
    input.addEventListener('blur', () => setTimeout(close, 150));
  });
}

// The value a form's picker holds: { id, kind } or null.
export const picked = (form, name = 'target') => { const h = form.querySelector(`[data-linker-value][name="${name}"]`); return h?.value ? { id: h.value, kind: h.dataset.linkerKind || '' } : null; };
// Is a picker open or being typed in? (A live redraw waits until it is not.)
export const linkerBusy = () => !!document.activeElement?.closest?.('[data-linker]');
