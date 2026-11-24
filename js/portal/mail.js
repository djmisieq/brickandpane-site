// Mail in the CRM (migration 0035, plan: brickandpane-docs/docs/PLAN-WLASNY-CRM.md). STAFF ONLY: imported by admin.js
// alone. A READ-ONLY copy of the Zimbra mailboxes (contact@ whole, chris@ and kate@ for known people only), shown on
// the project it belongs to and, for what matches no project, in the Mail view. Replies are written in Zimbra for now.
import { store } from './store.js';
import { esc, fmtDate, ago, $, $$, toast } from './core.js';
import { tr } from './i18n.js';

const KINDS = { client: 'Client', supplier: 'Supplier', other: 'Other' };
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const who = (m) => (m.direction === 'out' ? `${tr('To')} ${(m.to_addrs || []).join(', ')}` : `${m.from_name ? `${m.from_name} ` : ''}<${m.from_addr}>`);

export async function loadMail(pid) {
  if (!store.listMail) return null;
  const [list, keywords] = await Promise.all([store.listMail({ pid }).catch(() => null), store.listMailKeywords ? store.listMailKeywords(pid).catch(() => []) : []]);
  return list == null ? null : Object.assign(list, { keywords });
}

function item(m, { projects = null } = {}) {
  const files = (m.attachments || []).map((a) => a.path
    ? `<button type="button" class="q-link" data-mail-file="${esc(a.path)}">${esc(a.name)}</button> <span class="note">${esc(size(a.size))}</span>`
    : `<span class="note">${esc(a.name)} (${tr('in Zimbra only')})</span>`).join(' · ');
  const assign = projects ? `<form class="mail-assign" data-mail-assign>
      <label class="visually-hidden" for="ma-${esc(m.id)}">${tr('Project')}</label>
      <select id="ma-${esc(m.id)}" name="project"><option value="">${tr('Choose a project…')}</option>${projects.map((p) => `<option value="${esc(p.id)}" ${(m.projects || []).includes(p.id) ? 'selected' : ''}>${esc(p.ref)} · ${esc(p.name)}</option>`).join('')}</select>
      <button class="btn btn-sm btn-ghost" type="submit">${tr('File on project')}</button>
      ${m.direction === 'in' ? `<button class="btn btn-sm btn-ghost" type="button" data-mail-known="${esc(m.from_addr)}">${tr('Add sender as contact')}</button>` : ''}
      ${!m.dismissed ? `<button class="btn btn-sm btn-ghost" type="button" data-mail-dismiss>${tr('Not for the CRM')}</button>` : ''}
    </form>` : '';
  return `<details class="mail${m.direction === 'out' ? ' is-out' : ''}" data-mail="${esc(m.id)}">
    <summary>
      <span class="mail-dir" aria-label="${tr(m.direction === 'out' ? 'Sent' : 'Received')}">${m.direction === 'out' ? '↗' : '↙'}</span>
      <span class="mail-subj">${esc(m.subject || tr('(no subject)'))}</span>
      <span class="mail-who note">${esc(who(m))}</span>
      <span class="mail-when note" title="${esc(fmtDate(m.sent_at, true))}">${esc(ago(m.sent_at))}${(m.attachments || []).length ? ` · 📎 ${(m.attachments || []).length}` : ''}</span>
    </summary>
    <div class="mail-body">
      <p class="note">${esc(fmtDate(m.sent_at, true))} · ${esc(m.account)}${m.folder !== 'INBOX' ? ` / ${esc(m.folder)}` : ''}${(m.cc_addrs || []).length ? ` · ${tr('Cc')} ${esc(m.cc_addrs.join(', '))}` : ''}</p>
      <div class="mail-text">${esc(m.body_text || '')}</div>
      ${files ? `<p class="mail-files">${files}</p>` : ''}
      ${assign}
    </div>
  </details>`;
}

// On a project: its mail, newest first.
export function mailPanel(list) {
  const head = `<h2 class="panel-h">${tr('Email')} <span class="tag">${tr('staff only')}</span></h2>`;
  if (list == null) return `<section class="mail-panel" data-mail-panel>${head}<p class="hint">${tr('Mail is not available right now.')}</p></section>`;
  return `<section class="mail-panel" data-mail-panel>${head}
    <p class="hint">${tr('A copy of the Zimbra mailboxes, read only: reply in Zimbra.')}</p>
    ${list.length ? `<div class="mail-list">${list.map((m) => item(m)).join('')}</div>` : `<p class="hint">${tr('No email with this project’s client yet.')}</p>`}
    <form class="mail-keywords" data-mail-keywords>
      <p class="hint">${tr('Site names: mail with one of these in its subject shows here, e.g. “Avon Run” when a client has several sites.')}</p>
      ${(list.keywords || []).length ? `<ul class="mail-contacts">${list.keywords.map((k) => `<li data-keyword="${esc(k.id)}"><strong>${esc(k.keyword)}</strong> <button type="button" class="q-link" data-keyword-del>${tr('Remove')}</button></li>`).join('')}</ul>` : ''}
      <div class="field-row">
        <div class="field"><label for="mk-word">${tr('Site name in the subject')}</label><input id="mk-word" name="keyword" minlength="3" maxlength="80" placeholder="Avon Run"></div>
      </div>
      <button class="btn btn-sm btn-ghost" type="submit">${tr('Add site name')}</button>
    </form>
  </section>`;
}

export function bindMail(root, pid = null) {
  const kw = $('[data-mail-keywords]', root);
  kw?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const word = kw.keyword.value.trim();
    if (word.length < 3) { kw.keyword.focus(); toast(tr('Enter at least 3 letters of the site name.')); return; }
    try { await store.addMailKeyword(pid, word); toast(tr('Site name added.')); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-keyword-del]', root).forEach((b) => b.addEventListener('click', async () => {
    try { await store.deleteMailKeyword(b.closest('[data-keyword]').dataset.keyword); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-mail-file]', root).forEach((b) => b.addEventListener('click', async () => {
    try { const url = await store.mailFileUrl(b.dataset.mailFile); if (url) open(url, '_blank', 'noopener'); else toast(tr('Files are not stored in demo mode.')); } catch (err) { toast(tr(err.message)); }
  }));
}

let filter = 'unassigned';

// The Mail view: what matches no project (strangers writing to contact@, new suppliers), or everything.
export async function mailView(app, switcher) {
  document.title = `${tr('Email')} | CRM`;
  const [list, accounts, projects, contacts] = await Promise.all([
    store.listMail({ unassigned: filter === 'unassigned' }),
    store.mailAccounts().catch(() => []),
    store.listProjects(),
    store.listMailContacts().catch(() => []),
  ]);
  const open = projects.filter((p) => !['closed'].includes(p.stage));
  const status = accounts.map((a) => `<li><strong>${esc(a.address)}</strong> <span class="note">${a.mode === 'known' ? tr('known people only') : tr('whole mailbox')} · ${a.last_error ? `<span class="q-warn">${esc(a.last_error)}</span>` : a.last_run_at ? tr('read {ago}', { ago: ago(a.last_run_at) }) : tr('not read yet')}</span></li>`).join('');
  // A live update redraws the list: mails that were open stay open.
  const openIds = new Set($$('details.mail[open]', app).map((d) => d.dataset.mail));
  app.innerHTML = `
    <div class="container section-tight">
      <div class="dash-head"><div><span class="eyebrow">${tr('Internal')}</span><h1 class="app-h1">${tr('Email')}</h1></div></div>
      <p class="note mb-m">${tr('A copy of the Zimbra mailboxes, read only: nothing is deleted, moved or marked read there. Reply in Zimbra.')}</p>
      <div class="board-tools">
        ${switcher}
        <div class="seg" role="group" aria-label="${tr('Show')}">
          <button type="button" class="${filter === 'unassigned' ? 'is-on' : ''}" data-mail-filter="unassigned">${tr('Not on a project')}</button>
          <button type="button" class="${filter === 'all' ? 'is-on' : ''}" data-mail-filter="all">${tr('All')}</button>
        </div>
      </div>
      ${list.length ? `<div class="mail-list">${list.map((m) => item(m, { projects: open })).join('')}</div>` : `<p class="callout">${tr(filter === 'unassigned' ? 'Every email is on a project.' : 'No email yet.')}</p>`}
      <div class="mail-side">
        <section class="ctl"><h2 class="panel-h">${tr('Mailboxes')}</h2><ul class="mail-accounts">${status || `<li class="note">${tr('No mailbox connected.')}</li>`}</ul></section>
        <form class="ctl" data-mail-contact>
          <h2 class="panel-h">${tr('Known contacts')}</h2>
          <p class="hint">${tr('Mail from these addresses is read from chris@ and kate@ too, and shows on the project chosen. A domain (@okna.pl) covers everyone there.')}</p>
          ${contacts.length ? `<ul class="mail-contacts">${contacts.map((c) => `<li data-contact="${esc(c.id)}"><strong>${esc(c.match)}</strong> <span class="note">${esc(tr(KINDS[c.kind] || c.kind))}${c.label ? ` · ${esc(c.label)}` : ''}${c.project_id ? ` · ${esc(projects.find((p) => p.id === c.project_id)?.ref || '')}` : ''}</span> <button type="button" class="q-link" data-contact-del>${tr('Remove')}</button></li>`).join('')}</ul>` : ''}
          <div class="field"><label for="mc-match">${tr('Address or @domain')}</label><input id="mc-match" name="match" required placeholder="jan@okna.pl / @okna.pl"></div>
          <div class="field-row">
            <div class="field"><label for="mc-kind">${tr('Type')}</label><select id="mc-kind" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></div>
            <div class="field"><label for="mc-label">${tr('Name')}</label><input id="mc-label" name="label" maxlength="120"></div>
          </div>
          <div class="field"><label for="mc-project">${tr('Project')}</label><select id="mc-project" name="project"><option value="">${tr('None')}</option>${open.map((p) => `<option value="${esc(p.id)}">${esc(p.ref)} · ${esc(p.name)}</option>`).join('')}</select></div>
          <button class="btn btn-sm" type="submit">${tr('Add contact')}</button>
        </form>
      </div>
    </div>`;
  openIds.forEach((id) => { const d = $$('details.mail', app).find((x) => x.dataset.mail === id); if (d) d.open = true; });
  const again = () => mailView(app, switcher);
  bindMail(app);
  $$('[data-mail-filter]', app).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.mailFilter; again(); }));
  $$('[data-mail-assign]', app).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.project.value) { f.project.focus(); toast(tr('Choose a project first.')); return; }
    try { await store.assignMail(f.closest('[data-mail]').dataset.mail, f.project.value); toast(tr('Filed on the project.')); await again(); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-mail-dismiss]', app).forEach((b) => b.addEventListener('click', async () => {
    try { await store.dismissMail(b.closest('[data-mail]').dataset.mail); toast(tr('Hidden from this list.')); await again(); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-mail-known]', app).forEach((b) => b.addEventListener('click', () => {
    const f = $('[data-mail-contact]', app); f.match.value = b.dataset.mailKnown; f.match.focus();
  }));
  $('[data-mail-contact]', app).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    const match = f.match.value.trim().toLowerCase();
    if (!/^([^@\s]+)?@[^@\s]+\.[^@\s]+$/.test(match)) { f.match.focus(); toast(tr('Enter an email address or @domain.')); return; }
    try { await store.addMailContact({ match, kind: f.kind.value, label: f.label.value.trim(), project_id: f.project.value || null }); toast(tr('Contact added.')); await again(); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-contact-del]', app).forEach((b) => b.addEventListener('click', async () => {
    try { await store.deleteMailContact(b.closest('[data-contact]').dataset.contact); await again(); } catch (err) { toast(tr(err.message)); }
  }));
}
