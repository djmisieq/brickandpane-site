// Companies and people (migration 0044, CRM audit phase 5: our own CRM instead of HubSpot). STAFF ONLY.
// A practice, a contractor, a developer or a supplier is a company with its people; a project lists the companies
// it works with, each in a role. Imported by admin.js alone.
import { store } from './store.js';
import { esc, stageBadge, $, $$, toast } from './core.js';
import { tr } from './i18n.js';

export const KINDS = { architect: 'Architect', contractor: 'Contractor', developer: 'Developer', supplier: 'Supplier', homeowner: 'Homeowner', other: 'Other' };
export const ROLES = { client: 'Client', architect: 'Architect', contractor: 'Contractor', developer: 'Developer', supplier: 'Supplier', other: 'Other' };
const friendly = (e) => (/companies_name_kind|already exists/.test(e.message) ? tr('A company with this name and kind already exists.') : tr(e.message));
let kindFilter = 'all', textFilter = '';

export async function companiesView(app, nav) {
  document.title = `${tr('Companies')} | CRM`;
  const [list, people] = await Promise.all([store.listCompanies(), store.listPeople().catch(() => [])]);
  const q = textFilter.toLowerCase();
  const count = (id) => people.filter((p) => p.company_id === id).length;
  const shown = list.filter((c) => (kindFilter === 'all' || c.kind === kindFilter) && (!q || [c.name, c.email, c.phone, c.website, c.address, ...people.filter((p) => p.company_id === c.id).map((p) => `${p.full_name} ${p.email}`)].join(' ').toLowerCase().includes(q)));
  app.innerHTML = `<div class="container-wide section-tight" id="companies">
    <div class="dash-head"><div><h1 class="app-h1">${tr('Companies')}</h1></div><div class="board-tools">${nav}</div></div>
    <div class="board-tools">
      <div class="seg" role="group" aria-label="${tr('Kind')}">${[['all', 'All'], ...Object.entries(KINDS)].map(([k, v]) => `<button type="button" data-kind="${k}" aria-pressed="${kindFilter === k}" class="${kindFilter === k ? 'is-on' : ''}">${esc(tr(v))}</button>`).join('')}</div>
      <label class="visually-hidden" for="co-q">${tr('Search companies')}</label><input id="co-q" type="search" placeholder="${tr('Search name, person, email')}" value="${esc(textFilter)}">
    </div>
    <form class="ctl co-new" data-co-new novalidate><h2 class="panel-h">${tr('Add a company')}</h2>
      <div class="field-row"><div class="field"><label for="co-name">${tr('Name')}</label><input id="co-name" name="name" maxlength="200" required></div>
      <div class="field"><label for="co-kind">${tr('Kind')}</label><select id="co-kind" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${kindFilter === k ? 'selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></div></div>
      <button class="btn btn-sm" type="submit">${tr('Add company')}</button></form>
    ${shown.length ? `<table class="dash-table co-table"><thead><tr><th scope="col">${tr('Company')}</th><th scope="col">${tr('Kind')}</th><th scope="col">${tr('People')}</th><th scope="col">${tr('Contact')}</th></tr></thead><tbody>
      ${shown.map((c) => `<tr><th scope="row"><a href="#/company/${esc(c.id)}">${esc(c.name)}</a></th><td>${esc(tr(KINDS[c.kind] || c.kind))}</td><td>${count(c.id)}</td><td>${esc(c.email || c.phone || '')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="callout">${tr(list.length ? 'No company matches.' : 'No companies yet. Add the practices, contractors and suppliers you work with.')}</p>`}
  </div>`;
  $$('[data-kind]', app).forEach((b) => b.addEventListener('click', () => { kindFilter = b.dataset.kind; companiesView(app, nav); }));
  $('#co-q', app).addEventListener('input', (e) => { textFilter = e.target.value; clearTimeout(companiesView.t); companiesView.t = setTimeout(() => { companiesView(app, nav).then(() => { const i = $('#co-q', app); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); });
  $('[data-co-new]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, name = f.name.value.trim();
    if (!name) { f.name.focus(); toast(tr('Enter the company name.')); return; }
    try { const row = await store.saveCompany({ name, kind: f.kind.value }); location.hash = `#/company/${row.id}`; } catch (err) { toast(friendly(err)); }
  });
}

export async function companyView(app, id) {
  const { company: c, people, projects, quotes } = await store.getCompany(id);
  if (!c) { app.innerHTML = `<div class="container section-tight"><p class="callout">${tr('This company is not in the CRM.')} <a href="#/companies">${tr('All companies')}</a></p></div>`; return; }
  document.title = `${c.name} | CRM`;
  const fld = (n, label, v, type = 'text', max = 200) => `<div class="field"><label for="co-${n}">${tr(label)}</label><input id="co-${n}" name="${n}" type="${type}" maxlength="${max}" value="${esc(v || '')}"></div>`;
  app.innerHTML = `<div class="container section-tight" id="company">
    <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/companies">${tr('Companies')}</a></li><li aria-current="page">${esc(c.name)}</li></ol></nav>
    <div class="detail-head"><div><h1 class="app-h1">${esc(c.name)}</h1><p class="note">${esc(tr(KINDS[c.kind] || c.kind))}${c.website ? ` · <a href="${esc(/^https?:/.test(c.website) ? c.website : `https://${c.website}`)}" target="_blank" rel="noopener noreferrer">${esc(c.website)}</a>` : ''}</p></div></div>
    <div class="crm-grid">
      <div>
        <section class="ctl"><h2 class="panel-h">${tr('People')}</h2>
          ${people.length ? `<ul class="task-list">${people.map((p) => `<li class="task" data-person="${esc(p.id)}"><span><strong>${esc(p.full_name)}</strong>${p.job_title ? ` · ${esc(p.job_title)}` : ''}<span class="note">${[p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`, p.phone && esc(p.phone)].filter(Boolean).join(' · ')}</span></span><button type="button" class="q-icon" data-person-del aria-label="${esc(tr('Remove person'))}" title="${esc(tr('Remove person'))}">×</button></li>`).join('')}</ul>` : `<p class="hint">${tr('No people yet.')}</p>`}
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
          <button class="btn btn-sm" type="submit">${tr('Save')}</button></form>
        <form class="ctl" data-co-del novalidate><label class="consent"><input type="checkbox" name="sure"> <span>${tr('Delete this company (its people stay, without a company)')}</span></label><button class="btn btn-sm btn-ghost" type="submit">${tr('Delete company')}</button></form>
      </aside>
    </div></div>`;
  $('[data-co-edit]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, name = f.name.value.trim(); if (!name) { f.name.focus(); toast(tr('Enter the company name.')); return; }
    try { await store.saveCompany({ id, name, kind: f.kind.value, website: f.website.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), notes: f.notes.value.trim() }); toast(tr('Saved.')); } catch (err) { toast(friendly(err)); }
  });
  $('[data-co-del]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); if (!e.currentTarget.sure.checked) { toast(tr('Tick the box to delete the company.')); return; }
    try { await store.deleteCompany(id); toast(tr('Company deleted.')); location.hash = '#/companies'; } catch (err) { toast(tr(err.message)); }
  });
  $('[data-person-add]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, full_name = f.pname.value.trim(); if (!full_name) { f.pname.focus(); toast(tr('Enter the name.')); return; }
    try { await store.savePerson({ company_id: id, full_name, job_title: f.ptitle.value.trim(), email: f.pemail.value.trim(), phone: f.pphone.value.trim() }); toast(tr('Person added.')); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-person-del]', app).forEach((b) => b.addEventListener('click', async () => { try { await store.deletePerson(b.closest('[data-person]').dataset.person); toast(tr('Person removed.')); } catch (err) { toast(tr(err.message)); } }));
}

// The companies on a project, on its card.
export async function loadProjectCompanies(pid) {
  if (!store.projectCompanies) return null;
  try { const [links, all] = await Promise.all([store.projectCompanies(pid), store.listCompanies()]); return { links, all }; } catch { return null; }
}
export function projectCompaniesBox(data) {
  if (!data) return `<p class="hint">${tr('Companies are not available right now.')}</p>`;
  const { links, all } = data;
  return `<div data-pco>
    ${links.length ? `<ul class="task-list">${links.map((l) => `<li class="task" data-pco-item data-company="${esc(l.company.id)}" data-role="${esc(l.role)}"><span><a href="#/company/${esc(l.company.id)}"><strong>${esc(l.company.name)}</strong></a><span class="note">${esc(tr(ROLES[l.role] || l.role))}</span></span><button type="button" class="q-icon" data-pco-del aria-label="${esc(tr('Remove from the project'))}" title="${esc(tr('Remove from the project'))}">×</button></li>`).join('')}</ul>` : `<p class="hint">${tr('No company linked yet.')}</p>`}
    ${all.length ? `<form class="task-form" data-pco-add novalidate><div class="field-row">
      <div class="field"><label for="pco-co">${tr('Company')}</label><select id="pco-co" name="company">${all.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(tr(KINDS[c.kind] || c.kind))}</option>`).join('')}</select></div>
      <div class="field"><label for="pco-role">${tr('Role')}</label><select id="pco-role" name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></div></div>
      <button class="btn btn-sm" type="submit">${tr('Link company')}</button></form>` : ''}
    <a class="note" href="#/companies">${tr('All companies')}</a>
  </div>`;
}
export function bindProjectCompanies(root, pid) {
  const box = $('[data-pco]', root); if (!box) return;
  $('[data-pco-add]', box)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.linkCompany(pid, f.company.value, f.role.value); toast(tr('Company linked.')); } catch (err) { toast(/duplicate|already/.test(err.message) ? tr('This company is already on the project in that role.') : tr(err.message)); }
  });
  $$('[data-pco-del]', box).forEach((b) => b.addEventListener('click', async () => { const li = b.closest('[data-pco-item]'); try { await store.unlinkCompany(pid, li.dataset.company, li.dataset.role); toast(tr('Removed from the project.')); } catch (err) { toast(tr(err.message)); } }));
}
