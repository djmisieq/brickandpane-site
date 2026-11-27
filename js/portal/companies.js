// Companies and people (migration 0044, CRM audit phase 5: our own CRM instead of HubSpot). STAFF ONLY.
// A practice, a contractor, a developer or a supplier is a company with its people; a project lists the companies
// it works with, each in a role. Imported by admin.js alone.
import { store } from './store.js';
import { esc, stageBadge, $, $$, toast, softDelete } from './core.js';
import { tr } from './i18n.js';
import { linker, bindLinkers, picked, fold } from './linker.js';

export const KINDS = { architect: 'Architect', contractor: 'Contractor', developer: 'Developer', supplier: 'Supplier', homeowner: 'Homeowner', other: 'Other' };
export const ROLES = { client: 'Client', architect: 'Architect', contractor: 'Contractor', developer: 'Developer', supplier: 'Supplier', other: 'Other' };
const friendly = (e) => (/companies_name_kind|already exists/.test(e.message) ? tr('A company with this name and kind already exists.') : tr(e.message));
let kindFilter = 'all', textFilter = '', showCold = false; // the ~1000 companies of the cold campaign list (import 25.11.2026) are hidden until asked for

export async function companiesView(app, nav) {
  document.title = `${tr('Companies')} | CRM`;
  const [list, people] = await Promise.all([store.listCompanies(), store.listPeople().catch(() => [])]);
  const q = textFilter.toLowerCase();
  const count = (id) => people.filter((p) => p.company_id === id).length;
  const cold = list.filter((c) => c.source === 'cold').length;
  const dupes = duplicates(list, people);
  const shown = list.filter((c) => (showCold || c.source !== 'cold' || q) && (kindFilter === 'all' || c.kind === kindFilter) && (!q || [c.name, c.email, c.phone, c.website, c.address, ...people.filter((p) => p.company_id === c.id).map((p) => `${p.full_name} ${p.email}`)].join(' ').toLowerCase().includes(q)));
  app.innerHTML = `<div class="container-wide section-tight" id="companies">
    <div class="dash-head"><div><h1 class="app-h1">${tr('Companies')}</h1></div><div class="board-tools">${nav}</div></div>
    <div class="board-tools">
      <div class="seg" role="group" aria-label="${tr('Kind')}">${[['all', 'All'], ...Object.entries(KINDS)].map(([k, v]) => `<button type="button" data-kind="${k}" aria-pressed="${kindFilter === k}" class="${kindFilter === k ? 'is-on' : ''}">${esc(tr(v))}</button>`).join('')}</div>
      ${cold ? `<button type="button" class="btn btn-sm btn-ghost" data-co-cold aria-pressed="${showCold}">${esc(showCold ? tr('Hide the cold campaign list') : tr('Show the cold campaign list ({n})', { n: cold }))}</button>` : ''}
      <label class="visually-hidden" for="co-q">${tr('Search companies')}</label><input id="co-q" type="search" placeholder="${tr('Search name, person, email')}" value="${esc(textFilter)}">
    </div>
    ${dupes.length ? `<details class="ctl fold co-dupes" data-dupes><summary class="panel-h">${tr('Possible duplicates')} <span class="tag">${dupes.length}</span></summary><div class="fold-body">
      <p class="hint">${tr('Same name, website or email domain. Open the one to keep and merge the other into it.')}</p>
      <ul class="today-list">${dupes.slice(0, 30).map((g) => `<li class="dupe">${g.map((c) => `<a href="#/company/${esc(c.id)}">${esc(c.name)}</a> <span class="note">${esc(tr(KINDS[c.kind] || c.kind))}${c.source === 'cold' ? ` · ${tr('cold')}` : ''}</span>`).join(' ↔ ')}</li>`).join('')}</ul></div></details>` : ''}
    <form class="ctl co-new" data-co-new novalidate><h2 class="panel-h">${tr('Add a company')}</h2>
      <div class="field-row"><div class="field"><label for="co-name">${tr('Name')}</label><input id="co-name" name="name" maxlength="200" required></div>
      <div class="field"><label for="co-kind">${tr('Kind')}</label><select id="co-kind" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${kindFilter === k ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div></div>
      <button class="btn btn-sm" type="submit">${tr('Add company')}</button></form>
    ${shown.length ? `<table class="dash-table co-table"><thead><tr><th scope="col">${tr('Company')}</th><th scope="col">${tr('Kind')}</th><th scope="col">${tr('People')}</th><th scope="col">${tr('Contact')}</th></tr></thead><tbody>
      ${shown.map((c) => `<tr><th scope="row"><a href="#/company/${esc(c.id)}">${esc(c.name)}</a></th><td>${esc(tr(KINDS[c.kind] || c.kind))}${c.source === 'cold' ? ` <span class="tag">${tr('cold')}</span>` : ''}${c.do_not_contact ? ` <span class="tag">${tr('do not contact')}</span>` : ''}</td><td>${count(c.id)}</td><td>${esc(c.email || c.phone || '')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="callout">${tr(list.length ? 'No company matches.' : 'No companies yet. Add the practices, contractors and suppliers you work with.')}</p>`}
  </div>`;
  $$('[data-kind]', app).forEach((b) => b.addEventListener('click', () => { kindFilter = b.dataset.kind; companiesView(app, nav); }));
  $('[data-co-cold]', app)?.addEventListener('click', () => { showCold = !showCold; companiesView(app, nav); });
  $('#co-q', app).addEventListener('input', (e) => { textFilter = e.target.value; clearTimeout(companiesView.t); companiesView.t = setTimeout(() => { companiesView(app, nav).then(() => { const i = $('#co-q', app); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); });
  $('[data-co-new]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, name = f.name.value.trim();
    if (!name) { f.name.focus(); toast(tr('Enter the company name.')); return; }
    try { const row = await store.saveCompany({ name, kind: f.kind.value }); location.hash = `#/company/${row.id}`; } catch (err) { toast(friendly(err)); }
  });
}

// Groups of companies that are probably one: the same name without punctuation and "Ltd", the same website, or the
// same email domain (not a free mail provider).
const FREE = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|btinternet|sky|wp|onet|o2|interia)\./;
const domain = (v) => { const m = String(v || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').match(/(?:@)?([a-z0-9.-]+\.[a-z]{2,})/); const d = m ? m[1].replace(/^.*@/, '') : ''; return FREE.test(d) ? '' : d; };
export function duplicates(list, people = []) {
  const norm = (n) => fold(n).replace(/&/g, ' and ').replace(/\b(ltd|limited|llp|plc|sp z o o|spolka|the|uk)\b/g, '').replace(/[^a-z0-9]/g, '');
  const groups = new Map(), add = (key, c) => { if (!key) return; if (!groups.has(key)) groups.set(key, new Set()); groups.get(key).add(c); };
  const pdom = {}; people.forEach((p) => { if (p.company_id && p.email) (pdom[p.company_id] ||= new Set()).add(domain(p.email.split('@')[1] ? `@${p.email.split('@')[1]}` : '')); });
  list.forEach((c) => { add(`n:${norm(c.name)}`, c); add(domain(c.website) && `d:${domain(c.website)}`, c); add(domain(c.email) && `d:${domain(c.email)}`, c); (pdom[c.id] || new Set()).forEach((d) => add(d && `d:${d}`, c)); });
  const seen = new Set(), out = [];
  [...groups.values()].map((g) => [...g]).filter((g) => g.length > 1).forEach((g) => { const k = g.map((c) => c.id).sort().join(); if (!seen.has(k)) { seen.add(k); out.push(g); } });
  // The team's own companies first; groups made only of cold-list entries last.
  return out.sort((a, b) => a.every((c) => c.source === 'cold') - b.every((c) => c.source === 'cold'));
}

export async function companyView(app, id) {
  const { company: c, people, projects, quotes } = await store.getCompany(id);
  const personProjects = {}; if (store.personProjects) await Promise.all((people || []).map(async (p) => { personProjects[p.id] = await store.personProjects(p.id).catch(() => []); }));
  if (!c) { app.innerHTML = `<div class="container section-tight"><p class="callout">${tr('This company is not in the CRM.')} <a href="#/companies">${tr('All companies')}</a></p></div>`; return; }
  document.title = `${c.name} | CRM`;
  const fld = (n, label, v, type = 'text', max = 200) => `<div class="field"><label for="co-${n}">${tr(label)}</label><input id="co-${n}" name="${n}" type="${type}" maxlength="${max}" value="${esc(v || '')}"></div>`;
  app.innerHTML = `<div class="container section-tight" id="company">
    <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/companies">${tr('Companies')}</a></li><li aria-current="page">${esc(c.name)}</li></ol></nav>
    <div class="detail-head"><div><h1 class="app-h1">${esc(c.name)}</h1><p class="note">${esc(tr(KINDS[c.kind] || c.kind))}${c.website ? ` · <a href="${esc(/^https?:/.test(c.website) ? c.website : `https://${c.website}`)}" target="_blank" rel="noopener noreferrer">${esc(c.website)}</a>` : ''}</p></div></div>
    <div class="crm-grid">
      <div>
        <section class="ctl"><h2 class="panel-h">${tr('People')}</h2>
          ${people.length ? `<ul class="task-list">${people.map((p) => `<li class="task" data-person="${esc(p.id)}" data-dnc="${p.do_not_contact ? '1' : ''}"><span><strong>${esc(p.full_name)}</strong>${p.job_title ? ` · ${esc(p.job_title)}` : ''}${p.do_not_contact ? ` <span class="tag">${tr('do not contact')}</span>` : ''}<span class="note">${[p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`, p.phone && `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>`].filter(Boolean).join(' · ')}</span></span><button type="button" class="btn btn-sm btn-ghost" data-person-dnc>${p.do_not_contact ? tr('Allow contact') : tr('Do not contact')}</button><button type="button" class="q-icon" data-person-del aria-label="${esc(tr('Remove person'))}" title="${esc(tr('Remove person'))}">×</button>
            <details class="person-edit"><summary class="note">${tr('Edit, move or merge')}</summary>
              <form class="task-form" data-person-edit novalidate>
                <div class="field-row">${fld(`e-name-${p.id}`, 'Name', p.full_name).replace(`name="e-name-${p.id}"`, 'name="full_name"')}${fld(`e-title-${p.id}`, 'Job title', p.job_title, 'text', 120).replace(`name="e-title-${p.id}"`, 'name="job_title"')}</div>
                <div class="field-row">${fld(`e-email-${p.id}`, 'Email', p.email, 'email').replace(`name="e-email-${p.id}"`, 'name="email"')}${fld(`e-phone-${p.id}`, 'Phone', p.phone, 'tel', 60).replace(`name="e-phone-${p.id}"`, 'name="phone"')}</div>
                ${linker({ id: `e-co-${p.id}`, label: tr('Company (move the person)'), kinds: ['company'], name: 'company', text: c.name, value: c.id, create: 'company:other' })}
                <button class="btn btn-sm" type="submit">${tr('Save')}</button></form>
              <form class="task-form" data-person-merge novalidate>
                ${linker({ id: `m-pe-${p.id}`, label: tr('Merge a duplicate into this person'), kinds: ['person'], name: 'person', exclude: [p.id], hint: tr('The duplicate’s projects, enquiries and missing details move here; then it is deleted.') })}
                <label class="consent"><input type="checkbox" name="sure"> <span>${tr('I checked it is the same person')}</span></label>
                <button class="btn btn-sm btn-ghost" type="submit">${tr('Merge')}</button></form>
              ${(personProjects[p.id] || []).length ? `<p class="note">${tr('On projects:')} ${personProjects[p.id].map((x) => `<a href="#/p/${esc(x.project.id)}">${esc(x.project.ref)}</a>`).join(', ')}</p>` : ''}
            </details></li>`).join('')}</ul>` : `<p class="hint">${tr('No people yet.')}</p>`}
          <form class="task-form" data-person-add novalidate>
            <div class="field-row">${fld('pname', 'Name', '')}${fld('ptitle', 'Job title', '', 'text', 120)}</div>
            <div class="field-row">${fld('pemail', 'Email', '', 'email')}${fld('pphone', 'Phone', '', 'tel', 60)}</div>
            <button class="btn btn-sm" type="submit">${tr('Add person')}</button></form></section>
        <section class="ctl"><h2 class="panel-h">${tr('Projects')}</h2>${projects.length ? `<ul class="today-list">${projects.map((p) => `<li><a class="today-row" href="#/p/${esc(p.id)}"><span class="today-t">${esc(p.ref)} · ${esc(p.name)}</span><span class="today-s">${stageBadge(p.stage, 'staff')} ${esc(tr(ROLES[p.role] || p.role))}</span></a></li>`).join('')}</ul>` : `<p class="hint">${tr('Not on any project yet. Link it from the project card.')}</p>`}</section>
        ${quotes.length ? `<section class="ctl"><h2 class="panel-h">${tr('Supplier quotes')}</h2><ul class="today-list">${quotes.map((x) => `<li><a class="today-row" href="#/p/${esc(x.project_id)}"><span class="today-t">${esc(x.supplier)}${x.reference ? ` · ${esc(x.reference)}` : ''}</span><span class="today-age">£${esc(Number(x.net_gbp ?? x.amount).toLocaleString('en-GB'))}</span></a></li>`).join('')}</ul></section>` : ''}
      </div>
      <aside class="crm-side">
        <form class="ctl" data-co-edit novalidate><h2 class="panel-h">${tr('Details')}</h2>
          ${fld('name', 'Name', c.name)}
          <div class="field"><label for="co-kind">${tr('Kind')}</label><select id="co-kind" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div>
          ${fld('website', 'Website', c.website, 'text', 300)}${fld('email', 'Email', c.email, 'email')}${fld('phone', 'Phone', c.phone, 'tel', 60)}
          <div class="field"><label for="co-address">${tr('Address')}</label><textarea id="co-address" name="address" rows="2" maxlength="500">${esc(c.address)}</textarea></div>
          <div class="field"><label for="co-notes">${tr('Notes')}</label><textarea id="co-notes" name="notes" rows="3" maxlength="4000">${esc(c.notes)}</textarea></div>
          <label class="consent"><input type="checkbox" name="dnc" ${c.do_not_contact ? 'checked' : ''}> <span>${tr('Do not contact (no campaign mail; kept so they are not added again)')}</span></label>
          <button class="btn btn-sm" type="submit">${tr('Save')}</button></form>
        <form class="ctl" data-co-merge novalidate><h2 class="panel-h">${tr('Merge a duplicate')}</h2>
          ${linker({ id: 'co-merge', label: tr('The duplicate company'), kinds: ['company'], name: 'company', exclude: [c.id], hint: tr('Its people, projects, supplier quotes and missing details move to this company; then the duplicate is deleted.') })}
          <label class="consent"><input type="checkbox" name="sure"> <span>${tr('I checked it is the same company')}</span></label>
          <button class="btn btn-sm btn-ghost" type="submit">${tr('Merge into this company')}</button></form>
        <form class="ctl" data-co-del novalidate><label class="consent"><input type="checkbox" name="sure"> <span>${tr('Delete this company (its people stay, without a company)')}</span></label><button class="btn btn-sm btn-ghost" type="submit">${tr('Delete company')}</button></form>
      </aside>
    </div></div>`;
  $('[data-co-edit]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, name = f.name.value.trim(); if (!name) { f.name.focus(); toast(tr('Enter the company name.')); return; }
    try { await store.saveCompany({ id, name, kind: f.kind.value, website: f.website.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), notes: f.notes.value.trim(), do_not_contact: f.dnc.checked }); toast(tr('Saved.')); } catch (err) { toast(friendly(err)); }
  });
  $('[data-co-del]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); if (!e.currentTarget.sure.checked) { toast(tr('Tick the box to delete the company.')); return; }
    try { await store.deleteCompany(id); toast(tr('Company deleted.')); location.hash = '#/companies'; } catch (err) { toast(tr(err.message)); }
  });
  $('[data-person-add]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, full_name = f.pname.value.trim(); if (!full_name) { f.pname.focus(); toast(tr('Enter the name.')); return; }
    try { await store.savePerson({ company_id: id, full_name, job_title: f.ptitle.value.trim(), email: f.pemail.value.trim(), phone: f.pphone.value.trim() }); toast(tr('Person added.')); } catch (err) { toast(tr(err.message)); }
  });
  bindLinkers(app);
  $('[data-co-merge]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, other = picked(f, 'company');
    if (!other) { $('#co-merge', f).focus(); toast(tr('Choose the duplicate from the list.')); return; }
    if (!f.sure.checked) { toast(tr('Tick that you checked it is the same company.')); return; }
    try { await store.mergeCompanies(id, other.id); toast(tr('Merged.')); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-person-edit]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const pid = f.closest('[data-person]').dataset.person, full_name = f.full_name.value.trim();
    if (!full_name) { f.full_name.focus(); toast(tr('Enter the name.')); return; }
    const co = picked(f, 'company');
    try { await store.savePerson({ id: pid, full_name, job_title: f.job_title.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), company_id: co ? co.id : null }); toast(co && co.id !== id ? tr('Saved. The person moved to the other company.') : tr('Saved.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-person-merge]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const keep = f.closest('[data-person]').dataset.person, other = picked(f, 'person');
    if (!other) { toast(tr('Choose the duplicate from the list.')); return; }
    if (!f.sure.checked) { toast(tr('Tick that you checked it is the same person.')); return; }
    try { await store.mergePeople(keep, other.id); toast(tr('Merged.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-person-dnc]', app).forEach((b) => b.addEventListener('click', async () => { const li = b.closest('[data-person]'); try { await store.savePerson({ id: li.dataset.person, do_not_contact: !li.dataset.dnc }); toast(tr('Saved.')); } catch (err) { toast(tr(err.message)); } }));
  $$('[data-person-del]', app).forEach((b) => b.addEventListener('click', async () => { const row = b.closest('[data-person]'); softDelete(row, tr('Person removed.'), () => store.deletePerson(row.dataset.person)); }));
}


// Who is on a project (projects audit 26.11.2026): the companies in their roles and the people, one of them the main
// contact, each found by typing (no list of 1000 companies), created on the spot if new, re-roled or removed in place.
export const PERSON_ROLES = { contact: 'Contact', decision: 'Decision maker', site: 'On site', accounts: 'Accounts', design: 'Design', other: 'Other' };
const ROLE_KIND = { client: 'other', architect: 'architect', contractor: 'contractor', developer: 'developer', supplier: 'supplier', other: 'other' };
export async function loadProjectCompanies(pid) {
  if (!store.projectCompanies) return null;
  try {
    const [links, people, all] = await Promise.all([store.projectCompanies(pid), store.projectPeople ? store.projectPeople(pid).catch(() => []) : [], store.listPeople ? store.listPeople().catch(() => []) : []]);
    // People of the linked companies who are not on the project yet: one tap adds them.
    const onIt = new Set(people.map((x) => x.person.id)), cos = new Set(links.map((l) => l.company.id));
    const suggest = all.filter((p) => p.company_id && cos.has(p.company_id) && !onIt.has(p.id)).slice(0, 6);
    return { links, people, suggest };
  } catch { return null; }
}
const opts = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(tr(v))}</option>`).join('');
export function projectCompaniesBox(data) {
  if (!data) return `<p class="hint">${tr('Companies are not available right now.')}</p>`;
  const { links, people, suggest } = data;
  const coOf = (id) => links.find((l) => l.company.id === id)?.company;
  return `<div data-pco>
    <h3 class="panel-h parties-h">${tr('Companies')}</h3>
    ${links.length ? `<ul class="task-list parties">${links.map((l, i) => `<li class="task party" data-pco-item data-company="${esc(l.company.id)}" data-role="${esc(l.role)}">
      <span class="party-main"><a href="#/company/${esc(l.company.id)}"><strong>${esc(l.company.name)}</strong></a>${l.company.do_not_contact ? ` <span class="tag">${tr('do not contact')}</span>` : ''}
        <span class="note">${[l.company.phone && `<a href="tel:${esc(l.company.phone.replace(/\s/g, ''))}">${esc(l.company.phone)}</a>`, l.company.email && `<a href="mailto:${esc(l.company.email)}">${esc(l.company.email)}</a>`].filter(Boolean).join(' · ')}</span></span>
      <label class="visually-hidden" for="pco-r-${i}">${tr('Role')}</label><select id="pco-r-${i}" class="party-role" data-pco-role>${opts(ROLES, l.role)}</select>
      <button type="button" class="q-icon" data-pco-del aria-label="${esc(tr('Remove from the project'))}" title="${esc(tr('Remove from the project'))}">×</button></li>`).join('')}</ul>` : `<p class="hint">${tr('No company linked yet.')}</p>`}
    <form class="task-form party-add" data-pco-add novalidate><div class="field-row">
      ${linker({ id: 'pco-co', label: tr('Company'), kinds: ['company'], name: 'company', create: 'company:other', placeholder: tr('Type a company name…') })}
      <div class="field"><label for="pco-role">${tr('Role')}</label><select id="pco-role" name="role">${opts(ROLES, 'client')}</select></div></div>
      <button class="btn btn-sm" type="submit">${tr('Link company')}</button></form>
    <h3 class="panel-h parties-h">${tr('People')}</h3>
    ${people.length ? `<ul class="task-list parties">${people.map((x, i) => { const p = x.person, co = coOf(p.company_id); return `<li class="task party${x.is_main ? ' is-main' : ''}" data-pp-item data-person="${esc(p.id)}">
      <span class="party-main"><strong>${esc(p.full_name)}</strong>${x.is_main ? ` <span class="tag tag-accent">${tr('main contact')}</span>` : ''}${p.do_not_contact ? ` <span class="tag">${tr('do not contact')}</span>` : ''}
        <span class="note">${[p.job_title && esc(p.job_title), co ? esc(co.name) : '', p.phone && `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a>`, p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`].filter(Boolean).join(' · ')}</span></span>
      <label class="visually-hidden" for="pp-r-${i}">${tr('Role')}</label><select id="pp-r-${i}" class="party-role" data-pp-role>${opts(PERSON_ROLES, x.role)}</select>
      ${x.is_main ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-pp-main>${tr('Make main')}</button>`}
      <button type="button" class="q-icon" data-pp-del aria-label="${esc(tr('Remove from the project'))}" title="${esc(tr('Remove from the project'))}">×</button></li>`; }).join('')}</ul>` : `<p class="hint">${tr('No person linked yet.')}</p>`}
    ${suggest.length ? `<p class="party-suggest"><span class="note">${tr('From the linked companies:')}</span> ${suggest.map((p) => `<button type="button" class="btn btn-sm btn-ghost" data-pp-quick="${esc(p.id)}">+ ${esc(p.full_name)}</button>`).join(' ')}</p>` : ''}
    <form class="task-form party-add" data-pp-add novalidate><div class="field-row">
      ${linker({ id: 'pp-person', label: tr('Person'), kinds: ['person'], name: 'person', create: 'person', placeholder: tr('Type a name or an email…') })}
      <div class="field"><label for="pp-role">${tr('Role')}</label><select id="pp-role" name="role">${opts(PERSON_ROLES, 'contact')}</select></div></div>
      <label class="consent"><input type="checkbox" name="main" ${people.length ? '' : 'checked'}> <span>${tr('Main contact')}</span></label>
      <button class="btn btn-sm" type="submit">${tr('Link person')}</button></form>
    <a class="note" href="#/companies">${tr('All companies')}</a>
  </div>`;
}
export function bindProjectCompanies(root, pid) {
  const box = $('[data-pco]', root); if (!box) return;
  bindLinkers(box);
  const coForm = $('[data-pco-add]', box), ppForm = $('[data-pp-add]', box);
  // A company created here takes the kind its role suggests (a supplier, an architect...).
  const coBox = $('[data-linker]', coForm);
  coForm.role.addEventListener('change', () => { coBox.dataset.create = `company:${ROLE_KIND[coForm.role.value] || 'other'}`; });
  coForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const co = picked(coForm, 'company');
    if (!co) { $('#pco-co', coForm).focus(); toast(tr('Choose a company from the list, or create it.')); return; }
    try { await store.linkCompany(pid, co.id, coForm.role.value); toast(tr('Company linked.')); } catch (err) { toast(/duplicate|already/.test(err.message) ? tr('This company is already on the project in that role.') : tr(err.message)); }
  });
  ppForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const pe = picked(ppForm, 'person');
    if (!pe) { $('#pp-person', ppForm).focus(); toast(tr('Choose a person from the list, or create them.')); return; }
    try { await store.linkPerson(pid, pe.id, ppForm.role.value, ppForm.main.checked); toast(tr('Person linked.')); } catch (err) { toast(/duplicate|already/.test(err.message) ? tr('This person is already on the project.') : tr(err.message)); }
  });
  $$('[data-pco-del]', box).forEach((b) => b.addEventListener('click', async () => { const li = b.closest('[data-pco-item]'); try { await store.unlinkCompany(pid, li.dataset.company, li.dataset.role); toast(tr('Removed from the project.')); } catch (err) { toast(tr(err.message)); } }));
  $$('[data-pco-role]', box).forEach((s) => s.addEventListener('change', async () => { const li = s.closest('[data-pco-item]'); try { await store.setCompanyRole(pid, li.dataset.company, li.dataset.role, s.value); toast(tr('Role changed.')); } catch (err) { s.value = li.dataset.role; toast(/duplicate|already/.test(err.message) ? tr('This company is already on the project in that role.') : tr(err.message)); } }));
  $$('[data-pp-del]', box).forEach((b) => b.addEventListener('click', async () => { try { await store.unlinkPerson(pid, b.closest('[data-pp-item]').dataset.person); toast(tr('Removed from the project.')); } catch (err) { toast(tr(err.message)); } }));
  $$('[data-pp-role]', box).forEach((s) => s.addEventListener('change', async () => { try { await store.updatePersonLink(pid, s.closest('[data-pp-item]').dataset.person, { role: s.value }); toast(tr('Role changed.')); } catch (err) { toast(tr(err.message)); } }));
  $$('[data-pp-main]', box).forEach((b) => b.addEventListener('click', async () => { try { await store.updatePersonLink(pid, b.closest('[data-pp-item]').dataset.person, { is_main: true }); toast(tr('Main contact changed.')); } catch (err) { toast(tr(err.message)); } }));
  $$('[data-pp-quick]', box).forEach((b) => b.addEventListener('click', async () => { try { await store.linkPerson(pid, b.dataset.ppQuick, 'contact', !$('[data-pp-item]', box)); toast(tr('Person linked.')); } catch (err) { toast(tr(err.message)); } }));
}
