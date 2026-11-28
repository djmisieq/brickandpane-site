// Mail in the CRM (migration 0035, plan: brickandpane-docs/docs/PLAN-WLASNY-CRM.md). STAFF ONLY: imported by admin.js
// alone. A READ-ONLY copy of the Zimbra mailboxes (contact@ whole, chris@ and kate@ for known people only), shown on
// the project it belongs to and, for what matches no project, in the Mail view.
// Replies (stage 1b, migration 0045): written on the project and sent only when the person ticks that they checked
// the recipients and the text and presses Send (mail-send checks both). Nothing is sent on its own.
import { store } from './store.js';
import { esc, fmtDate, ago, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { linker, bindLinkers, picked } from './linker.js';

const KINDS = { client: 'Client', supplier: 'Supplier', other: 'Other' };
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const who = (m) => (m.direction === 'out' ? `${tr('To')} ${(m.to_addrs || []).join(', ')}` : `${m.from_name ? `${m.from_name} ` : ''}<${m.from_addr}>`);

export async function loadMail(pid) {
  if (!store.listMail) return null;
  const [list, keywords] = await Promise.all([store.listMail({ pid }).catch(() => null), store.listMailKeywords ? store.listMailKeywords(pid).catch(() => []) : []]);
  return list == null ? null : Object.assign(list, { keywords });
}
let boxes = null; // the company mailboxes that can send
const loadBoxes = async () => (boxes ||= store.mailAccounts ? (await store.mailAccounts().catch(() => [])).map((a) => a.address) : []);
let draft = null; // { pid, reply_to, from, to, cc, subject, text }

function item(m, { projects = null } = {}) {
  const files = (m.attachments || []).map((a) => a.path
    ? `<button type="button" class="q-link" data-mail-file="${esc(a.path)}">${esc(a.name)}</button> <span class="note">${esc(size(a.size))}</span>`
    : `<span class="note">${esc(a.name)} (${tr('in Zimbra only')})</span>`).join(' · ');
  const assign = projects ? `<form class="mail-assign" data-mail-assign>
      ${linker({ id: `ma-${m.id}`, label: tr('Project'), kinds: ['project'], name: 'project', placeholder: tr('Type a reference, a name or a site…') })}
      <button class="btn btn-sm btn-ghost" type="submit">${tr('File on project')}</button>
      ${m.direction === 'in' ? `<button class="btn btn-sm btn-ghost" type="button" data-mail-known="${esc(m.from_addr)}">${tr('Add sender as contact')}</button>` : ''}
      ${!m.dismissed ? `<button class="btn btn-sm btn-ghost" type="button" data-mail-dismiss>${tr('Not for the CRM')}</button>` : ''}
    </form>` : '';
  return `<details class="mail${m.direction === 'out' ? ' is-out' : ''}" data-mail="${esc(m.id)}">
    <summary>
      <span class="mail-dir" aria-label="${tr(m.direction === 'out' ? 'Sent' : 'Received')}">${m.direction === 'out' ? '↗' : '↙'}</span>
      <span class="mail-subj">${esc(m.subject || tr('(no subject)'))}${m.direction === 'in' ? (m.handled_at ? ` <span class="tag tone-ok">${tr('dealt with')}</span>` : '') : ''}</span>
      <span class="mail-who note">${esc(who(m))}</span>
      <span class="mail-when note" title="${esc(fmtDate(m.sent_at, true))}">${esc(ago(m.sent_at))}${(m.attachments || []).length ? ` · 📎 ${(m.attachments || []).length}` : ''}</span>
    </summary>
    <div class="mail-body">
      <p class="note">${esc(fmtDate(m.sent_at, true))} · ${esc(m.account)}${m.folder !== 'INBOX' ? ` / ${esc(m.folder)}` : ''}${(m.cc_addrs || []).length ? ` · ${tr('Cc')} ${esc(m.cc_addrs.join(', '))}` : ''}</p>
      <div class="mail-text">${esc(m.body_text || '')}</div>
      ${files ? `<p class="mail-files">${files}</p>` : ''}
      ${projects ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-mail-reply>${tr('Reply')}</button>`}
      ${m.direction === 'in' ? `<button type="button" class="btn btn-sm btn-ghost" data-mail-handled="${m.handled_at ? '' : '1'}">${m.handled_at ? tr('Mark as waiting for us') : tr('Mark as dealt with')}</button>` : ''}
      ${assign}
      ${projects ? '' : `<details class="mail-move"><summary class="note">${tr('Not this project? Move it')}</summary><form class="mail-assign" data-mail-assign>
        ${linker({ id: `mm-${m.id}`, label: tr('Move to project'), kinds: ['project'], name: 'project', placeholder: tr('Type a reference, a name or a site…') })}
        <button class="btn btn-sm btn-ghost" type="submit">${tr('Move here')}</button></form></details>`}
    </div>
  </details>`;
}

// On a project: its mail, newest first.
// Threads (UX audit U3): replies hang under the email they answer (In-Reply-To), the rest by subject without
// "Re:/Fwd:". A thread whose newest email came in and is not dealt with is "waiting for us".
const subjKey = (s) => String(s || '').toLowerCase().replace(/^\s*((re|fw|fwd|aw|odp|pd|wg)\s*(\[\d+\])?\s*:\s*)+/g, '').replace(/\s+/g, ' ').trim();
export function threads(list) {
  const byMsg = new Map(list.filter((m) => m.message_id).map((m) => [m.message_id, m]));
  const root = (m, seen = new Set()) => { const up = m.in_reply_to && byMsg.get(m.in_reply_to); if (!up || seen.has(up.id)) return m; seen.add(up.id); return root(up, seen); };
  const groups = new Map();
  // The other side of the conversation: who wrote to us, or whom we wrote to. Same subject with someone else = another thread.
  const party = (m) => String((m.direction === 'out' ? (m.to_addrs || [])[0] : m.from_addr) || '').toLowerCase();
  list.forEach((m) => { const r = root(m); const k = subjKey(r.subject) ? `${subjKey(r.subject)}|${party(r)}` : `id:${r.id}`; groups.set(k, [...(groups.get(k) || []), m]); });
  return [...groups.values()].map((ms) => ms.sort((a, b) => b.sent_at.localeCompare(a.sent_at))).sort((a, b) => b[0].sent_at.localeCompare(a[0].sent_at));
}
const threadBox = (ms, opts) => {
  if (ms.length === 1) return item(ms[0], opts);
  const last = ms[0], waiting = last.direction === 'in' && !last.handled_at;
  return `<section class="mail-thread${waiting ? ' is-waiting' : ''}" aria-label="${esc(last.subject || tr('(no subject)'))}">
    <h3 class="mail-thread-h"><span>${esc(last.subject || tr('(no subject)'))}</span> <span class="tag">${tr('{n} emails', { n: ms.length })}</span>${waiting ? ` <span class="tag tone-info">${tr('waiting for us')}</span>` : ''}</h3>
    ${ms.map((m) => item(m, opts)).join('')}</section>`;
};
export function mailPanel(list) {
  const head = `<h2 class="panel-h">${tr('Email')} <span class="tag">${tr('staff only')}</span></h2>`;
  if (list == null) return `<section class="mail-panel" data-mail-panel>${head}<p class="hint">${tr('Mail is not available right now.')}</p></section>`;
  return `<section class="mail-panel" data-mail-panel>${head}
    <p class="hint">${tr('A copy of the Zimbra mailboxes. A reply written here goes out only after you check it and press Send.')}</p>
    ${list.length ? `<div class="mail-list">${threads(list).map((ms) => threadBox(ms)).join('')}</div>` : `<p class="hint">${tr('No email with this project’s client yet.')}</p>`}
    <div data-mail-compose-slot>${composeForm()}</div>
    ${draft ? '' : `<button type="button" class="btn btn-sm" data-mail-new>${tr('New email')}</button>`}
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

function composeForm() {
  if (!draft) return '';
  const opts = (boxes || []).map((a) => `<option value="${esc(a)}" ${a === draft.from ? 'selected' : ''}>${esc(a)}</option>`).join('');
  return `<form class="ctl mail-compose" data-mail-compose novalidate>
    <h3 class="panel-h">${draft.reply_to ? tr('Reply') : tr('New email')}</h3>
    <div class="field-row"><div class="field"><label for="mc-from">${tr('From')}</label><select id="mc-from" name="from">${opts}</select></div>
      <div class="field"><label for="mc-to">${tr('To')}</label><input id="mc-to" name="to" value="${esc(draft.to)}" autocomplete="off"></div></div>
    <div class="field"><label for="mc-cc">${tr('Cc')}</label><input id="mc-cc" name="cc" value="${esc(draft.cc)}" autocomplete="off"></div>
    <div class="field"><label for="mc-subj">${tr('Subject')}</label><input id="mc-subj" name="subject" maxlength="300" value="${esc(draft.subject)}"></div>
    <div class="field"><label for="mc-text">${tr('Message')}</label><textarea id="mc-text" name="text" rows="8">
${esc(draft.text)}</textarea></div>
    <label class="consent"><input type="checkbox" name="copy_me" checked> <span>${tr('Put a copy in the mailbox it is sent from')}</span></label>
    <label class="consent mail-confirm"><input type="checkbox" name="confirm"> <span><strong>${tr('I checked the recipients and the text')}</strong></span></label>
    <div class="btn-row"><button class="btn btn-sm" type="submit">${tr('Send')}</button><button class="btn btn-sm btn-ghost" type="button" data-mail-cancel>${tr('Cancel')}</button></div>
  </form>`;
}
const redrawCompose = (root, pid) => { const slot = $('[data-mail-compose-slot]', root); if (slot) slot.innerHTML = composeForm(); $('[data-mail-new]', root)?.toggleAttribute('hidden', !!draft); bindCompose(root, pid); if (draft) $('#mc-text', root)?.focus(); };
function bindCompose(root, pid) {
  const f = $('[data-mail-compose]', root); if (!f) return;
  // What is typed survives a live redraw of the card.
  f.addEventListener('input', () => { if (draft) Object.assign(draft, { from: f.from.value, to: f.to.value, cc: f.cc.value, subject: f.subject.value, text: f.text.value }); });
  $('[data-mail-cancel]', f).addEventListener('click', () => { draft = null; redrawCompose(root, pid); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.confirm.checked) { f.confirm.focus(); toast(tr('Tick that you checked the recipients and the text.')); return; }
    if (!f.to.value.trim()) { f.to.focus(); toast(tr('Add a recipient.')); return; }
    const btn = $('button[type="submit"]', f); btn.disabled = true;
    try {
      const res = await store.sendMail({ from: f.from.value, to: f.to.value, cc: f.cc.value, subject: f.subject.value, text: f.text.value, reply_to: draft?.reply_to || null, project_id: pid, copy_me: f.copy_me.checked, confirm: true });
      if (res?.error) throw new Error(res.error);
      draft = null; toast(tr('Sent.')); redrawCompose(root, pid);
    } catch (err) { btn.disabled = false; toast(tr(err.message)); }
  });
}

export function bindMail(root, pid = null) {
  // Dealt with (0053): CRM-side only, nothing changes in the mailbox; "Email came in, our move" stops showing it.
  $$('[data-mail-handled]', root).forEach((b) => b.addEventListener('click', async () => {
    try { await store.markMailHandled(b.closest('[data-mail]').dataset.mail, !!b.dataset.mailHandled); toast(tr(b.dataset.mailHandled ? 'Marked as dealt with.' : 'Back on the list for us.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  }));
  if (pid) {
    loadBoxes().then(() => { if (draft && draft.pid === pid && !draft.from) draft.from = boxes[0] || ''; redrawCompose(root, pid); });
    if (draft && draft.pid !== pid) draft = null;
    $('[data-mail-new]', root)?.addEventListener('click', async () => { await loadBoxes(); draft = { pid, reply_to: null, from: boxes.includes('contact@brickandpane.co.uk') ? 'contact@brickandpane.co.uk' : boxes[0] || '', to: '', cc: '', subject: '', text: '' }; redrawCompose(root, pid); });
    $$('[data-mail-reply]', root).forEach((b) => b.addEventListener('click', async () => {
      await loadBoxes();
      const m = (await store.listMail({ pid }).catch(() => [])).find((x) => x.id === b.closest('[data-mail]').dataset.mail); if (!m) return;
      const to = m.direction === 'in' ? m.from_addr : (m.to_addrs || []).join(', ');
      const quote = (m.body_text || '').split('\n').map((l) => `> ${l}`).join('\n');
      draft = { pid, reply_to: m.id, from: boxes.includes(m.account) ? m.account : boxes[0] || '', to, cc: '', subject: /^re:/i.test(m.subject || '') ? m.subject : `Re: ${m.subject || ''}`, text: `\n\n${tr('On {date}, {who} wrote:', { date: fmtDate(m.sent_at, true), who: m.from_name || m.from_addr })}\n${quote}` };
      redrawCompose(root, pid);
    }));
  }
  // Filing an email on a project, or moving it from the wrong one (projects audit 26.11.2026).
  bindLinkers(root);
  $$('[data-mail-assign]', root).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const to = picked(f, 'project');
    if (!to) { $('[data-linker-input]', f)?.focus(); toast(tr('Choose a project first.')); return; }
    try { await store.assignMail(f.closest('[data-mail]').dataset.mail, to.id); toast(tr(pid ? 'Moved to the other project.' : 'Filed on the project.')); } catch (err) { toast(tr(err.message)); }
  }));
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
  // …and what is being typed into the contact form is kept (read right before the redraw, after the data loads).
  const typed = Object.fromEntries($$('[data-mail-contact] [id]', app).filter((el) => el.value).map((el) => [el.id, el.value]));
  app.innerHTML = `
    <div class="container section-tight">
      <div class="dash-head"><div><span class="eyebrow">${tr('Internal')}</span><h1 class="app-h1">${tr('Email')}</h1></div></div>
      <p class="note mb-m">${tr('A copy of the Zimbra mailboxes, read only: nothing is deleted, moved or marked read there. To reply from the CRM, put the email on its project and answer it there.')}</p>
      <div class="board-tools">
        ${switcher}
        <div class="seg" role="group" aria-label="${tr('Show')}">
          <button type="button" class="${filter === 'unassigned' ? 'is-on' : ''}" data-mail-filter="unassigned">${tr('Not on a project')}</button>
          <button type="button" class="${filter === 'all' ? 'is-on' : ''}" data-mail-filter="all">${tr('All')}</button>
        </div>
      </div>
      ${list.length ? `<div class="mail-list">${threads(list).map((ms) => threadBox(ms, { projects: open })).join('')}</div>` : `<p class="callout">${tr(filter === 'unassigned' ? 'Every email is on a project.' : 'No email yet.')}</p>`}
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
  Object.entries(typed).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
  const again = () => mailView(app, switcher);
  bindMail(app);
  $$('[data-mail-filter]', app).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.mailFilter; again(); }));
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
    try { await store.addMailContact({ match, kind: f.kind.value, label: f.label.value.trim(), project_id: f.project.value || null }); f.reset(); toast(tr('Contact added.')); await again(); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-contact-del]', app).forEach((b) => b.addEventListener('click', async () => {
    try { await store.deleteMailContact(b.closest('[data-contact]').dataset.contact); await again(); } catch (err) { toast(tr(err.message)); }
  }));
}
