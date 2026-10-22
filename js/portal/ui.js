// Shared UI for the client portal and the staff CRM.
import { store } from './store.js';
import {
  STAGES, PHASES, DOC_KINDS, SYSTEMS, MATERIALS, stage, stageIndex, stageLabel, stageText, tracker, esc, fmtDate, fmtDay, ago, fmtSize,
  stageBadge, courtLabel, estimatePanel, $, $$, toast, MEMBER_ROLES, decisionRights, decisionLabels, CHANGE_STATUS, fmtGBP, incVat,
} from './core.js';
import { tr } from './i18n.js';

const ADMIN = 'admin.html';

export const route = () => {
  const h = location.hash.replace(/^#\/?/, '');
  const [name = '', id = ''] = h.split('/');
  return { name, id };
};

// ---------- app bar with notifications ----------
export async function renderAppBar(el, user, area) {
  const notes = await store.notifications();
  const unread = notes.filter((n) => !n.read_at).length;
  const home = area === 'admin' ? 'admin.html#/' : 'portal.html#/';
  const crmLink = area === 'admin' ? 'portal.html' : ADMIN;
  el.innerHTML = `
    ${store.mode === 'demo' ? `<div class="demo-bar" role="note"><strong>${tr('Demo mode.')}</strong> ${tr('Sample data stored in this browser only. Open the')} <a href="${crmLink}" target="_blank" rel="noopener">${tr(area === 'admin' ? 'client portal' : 'staff CRM')}</a> ${tr('in another tab to see updates arrive live.')} <button type="button" class="linkish" data-reset-demo>${tr('Reset demo')}</button></div>` : ''}
    <div class="appbar">
      <div class="${area === 'admin' ? 'container-wide' : 'container'} appbar-inner">
        <a class="appbar-title" href="${home}">${area === 'admin' ? tr('Projects CRM') : tr(user.account_type === 'homeowner' ? 'Your orders' : 'Your projects')}</a>
        <div class="appbar-actions">
          ${area === 'portal' ? `<a class="btn btn-sm" href="#/new">${tr(user.account_type === 'homeowner' ? 'Add your opening' : 'New project')}</a>` : ''}
          <div class="notif">
            <button type="button" class="notif-btn" aria-expanded="false" aria-controls="notif-panel" aria-label="${tr('Notifications')}${unread ? `, ${tr('{n} unread', { n: unread })}` : ''}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>
              ${unread ? `<span class="notif-count">${unread}</span>` : ''}
            </button>
            <div class="notif-panel" id="notif-panel" hidden>
              <div class="notif-head"><strong>${tr('Notifications')}</strong>${unread ? `<button type="button" class="linkish" data-read-all>${tr('Mark all read')}</button>` : ''}</div>
              <ul class="notif-list">${notes.length ? notes.map((n) => `
                <li class="${n.read_at ? '' : 'is-unread'}"><a href="${area === 'admin' ? 'admin.html' : 'portal.html'}#/p/${esc(n.project_id)}" data-note="${esc(n.id)}">
                  <span class="notif-title">${esc(n.title)}</span>${n.body ? `<span class="notif-body">${esc(n.body)}</span>` : ''}<span class="notif-time">${ago(n.created_at)}</span></a></li>`).join('') : `<li class="notif-empty">${tr('Nothing yet.')}</li>`}
              </ul>
            </div>
          </div>
          <details class="usermenu"><summary>${esc(user.full_name || user.email)}</summary>
            <div class="usermenu-panel">
              <span class="note">${esc(user.email || '')}${user.role === 'staff' ? ` · ${tr('staff')}` : ''}</span>
              ${area === 'portal' ? `<a href="#/settings">${tr('Settings')}</a>` : `<a href="portal.html">${tr('Client view')}</a>`}
              ${user.role === 'staff' && area === 'portal' ? `<a href="${ADMIN}">${tr('Staff CRM')}</a>` : ''}
              <button type="button" class="linkish" data-signout>${tr('Sign out')}</button>
            </div>
          </details>
        </div>
      </div>
    </div>`;

  const btn = $('.notif-btn', el), panel = $('#notif-panel', el);
  btn.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.notif')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } }, { once: true });
  $('[data-read-all]', el)?.addEventListener('click', () => store.markRead('all'));
  $$('[data-note]', el).forEach((a) => a.addEventListener('click', () => store.markRead([a.dataset.note])));
  $('[data-signout]', el).addEventListener('click', async () => { await store.signOut(); location.href = 'login.html'; });
  $('[data-reset-demo]', el)?.addEventListener('click', async () => { await store.resetDemo(); toast(tr('Demo data reset.')); });
}

// ---------- pipeline ----------
export function pipeline(project, events, audience = 'trade') {
  const reached = {};
  events.forEach((e) => { if (!reached[e.to_stage]) reached[e.to_stage] = e.created_at; }); // first time each stage was reached
  const cur = stageIndex(project.stage);
  const side = cur < 0 ? stage(project.stage) : null;
  return `
    <div class="pipeline" aria-label="${tr('Project pipeline')}">
      ${side ? `<p class="pipeline-side">${stageBadge(project.stage, audience)} ${esc(tr(side.client))}</p>` : ''}
      ${PHASES.map((ph) => `
        <div class="pipeline-phase">
          <h3 class="pipeline-phase-title">${tr(ph)}</h3>
          <ol>${STAGES.map((s, i) => ({ s, i })).filter(({ s }) => s.phase === ph).map(({ s, i }) => {
            const st = i < cur ? (reached[s.id] ? 'done' : 'skipped') : i === cur ? 'current' : 'todo';
            return `<li class="ps ps-${st}${s.court === 'you' ? ' ps-you' : ''}" ${st === 'current' ? 'aria-current="step"' : ''}>
              <span class="ps-dot" aria-hidden="true"></span>
              <span class="ps-label">${esc(stageLabel(s.id, audience))}</span>
              <span class="ps-date">${st === 'skipped' ? tr('not needed') : reached[s.id] && st !== 'todo' ? fmtDate(reached[s.id]) : ''}</span>
            </li>`;
          }).join('')}</ol>
        </div>`).join('')}
    </div>`;
}

export function nowCard(project, viewer, audience = viewer === 'staff' ? 'staff' : 'trade') {
  const s = stage(project.stage);
  const court = courtLabel(project.stage, viewer);
  const due = project.due_at && s.court === 'us'
    ? `<li><span>${tr('Next update by')}</span><span>${fmtDay(project.due_at)}</span></li>` : '';
  const dates = [
    project.delivery_at ? `<li><span>${tr('Delivery')}</span><span>${fmtDay(project.delivery_at)}</span></li>` : '',
    project.install_at ? `<li><span>${tr('Fitting')}</span><span>${fmtDay(project.install_at)}</span></li>` : '',
  ].join('');
  return `
    <section class="now-card ${s.court === 'you' ? 'is-you' : ''}" aria-label="${tr('Current status')}">
      ${audience === 'home' ? tracker(project.stage) : ''}
      <div class="now-head">${stageBadge(project.stage, audience)}${court ? `<span class="court court-${s.court}">${court}</span>` : ''}</div>
      <p class="now-text">${esc(viewer === 'client' ? stageText(project.stage, audience) : tr(s.staff || s.client))}</p>
      ${project.next_step ? `<p class="now-next"><strong>${tr(viewer === 'client' ? 'Next step' : 'Next step shown to client')}:</strong> ${esc(tr(project.next_step))}</p>` : ''}
      <ul class="proof-list">
        ${dates}${due}
        ${viewer !== 'client' || project.assignee ? `<li><span>${tr(viewer === 'client' ? 'Contact' : 'Owner')}</span><span>${esc(project.assignee?.full_name || tr('Unassigned'))}</span></li>` : ''}
        <li><span>${tr('In this stage since')}</span><span>${fmtDate(project.stage_changed_at)}</span></li>
      </ul>
    </section>`;
}

// ---------- tabs ----------
export function tabs(active, c) {
  const t = [
    ['overview', tr('Overview')],
    ['documents', `${tr('Documents')}${c.documents ? ` (${c.documents})` : ''}`, c.pendingDocs],
    ['changes', `${tr('Changes')}${c.changes ? ` (${c.changes})` : ''}`, c.pendingChanges],
    ['messages', `${tr('Messages')}${c.messages ? ` (${c.messages})` : ''}`],
    ['timeline', tr('Timeline')],
  ];
  return `<div class="tabs" role="tablist">${t.map(([id, label, dot]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${id === active}" aria-controls="panel-${id}" data-tab="${id}">${label}${dot ? ` <span class="dot-you" aria-label="${tr('action needed')}"></span>` : ''}</button>`).join('')}</div>`;
}

const money = (n, audience) => (audience === 'home' ? `${fmtGBP(incVat(n))} ${tr('inc. VAT')}` : `${fmtGBP(n)} + VAT`);

export function overviewPanel(d, viewer = 'client', audience = 'trade', user = null) {
  const p = d.project;
  const members = d.members || [];
  const isOwner = viewer === 'staff' || members.some((m) => m.user_id === user?.id && m.role === 'owner');
  const payments = d.payments || [];
  const paid = payments.filter((x) => x.paid_at).reduce((t, x) => t + Number(x.amount), 0);
  const total = payments.reduce((t, x) => t + Number(x.amount), 0);
  return `
    <div class="grid-12">
      <div class="span-8">
        <h3 class="panel-h">${tr('Openings')}</h3>
        ${d.openings.length ? `<table class="spec spec-compact"><thead><tr><th scope="col">${tr('Ref')}</th><th scope="col">${tr('System')}</th><th scope="col">${tr('W × H (mm)')}</th><th scope="col">${tr('Layout')}</th><th scope="col">${tr('Qty')}</th><th scope="col">${tr('Panel weight')}</th></tr></thead><tbody>
          ${d.openings.map((o) => { const e = estimatePanel(o); return `<tr><th scope="row">${esc(o.ref)}</th><td>${esc(tr(SYSTEMS[o.system] || o.system))}${o.material && MATERIALS[o.material] ? ` · ${esc(tr(MATERIALS[o.material]))}` : ''}</td><td>${esc(o.width_mm)} × ${esc(o.height_mm)}</td><td>${esc(o.config || '—')}</td><td>${esc(o.qty)}</td><td>${e ? `${e.kg} kg${e.over ? ` <span class="tag tag-accent">${tr('check')}</span>` : ''}` : '—'}</td></tr>${o.notes ? `<tr class="sub"><td colspan="6">${esc(o.notes)}</td></tr>` : ''}`; }).join('')}
        </tbody></table>` : `<p class="note">${tr('No openings listed yet.')}</p>`}
        ${p.brief ? `<h3 class="panel-h">${tr('Brief')}</h3><p class="measure">${esc(p.brief)}</p>` : ''}
        ${payments.length ? `
          <h3 class="panel-h">${tr('Payments')}</h3>
          <table class="spec spec-compact"><thead><tr><th scope="col">${tr('Stage')}</th><th scope="col">${tr('Amount')}</th><th scope="col">${tr('Due')}</th><th scope="col">${tr('Status')}</th></tr></thead><tbody>
            ${payments.map((x) => `<tr><th scope="row">${esc(tr(x.label))}</th><td>${fmtGBP(x.amount)}</td><td>${x.due_date ? fmtDay(x.due_date) : '—'}</td><td>${x.paid_at ? `<span class="badge badge-ok">${tr('Paid {date}', { date: fmtDate(x.paid_at) })}</span>` : `<span class="badge">${tr('Not yet due')}</span>`}${viewer === 'staff' ? ` <button type="button" class="linkish" data-paid="${esc(x.id)}">${tr(x.paid_at ? 'Mark unpaid' : 'Mark paid')}</button>` : ''}</td></tr>`).join('')}
          </tbody></table>
          <p class="note" style="margin-top:.6rem">${tr('Paid {paid} of {total}', { paid: fmtGBP(paid), total: fmtGBP(total) })}${audience === 'home' ? ` ${tr('(amounts include VAT)')}` : ''}.</p>` : ''}
      </div>
      <div class="start-9" style="grid-column:9 / span 4">
        <h3 class="panel-h">${tr('Project')}</h3>
        <ul class="proof-list">
          <li><span>${tr('Reference')}</span><span>${esc(p.ref)}</span></li>
          <li><span>${tr('Location')}</span><span>${esc(p.location || '—')}</span></li>
          ${p.riba_stage ? `<li><span>${tr('RIBA stage')}</span><span>${esc(tr(p.riba_stage))}</span></li>` : ''}
          ${p.building_type ? `<li><span>${tr('Building')}</span><span>${esc(tr(p.building_type))}</span></li>` : ''}
          ${p.start_window ? `<li><span>${tr('Start on site')}</span><span>${esc(tr(p.start_window))}</span></li>` : ''}
          <li><span>${tr('Submitted')}</span><span>${fmtDate(p.created_at)}</span></li>
        </ul>
        <h3 class="panel-h">${tr('Team')}</h3>
        <ul class="team">
          ${p.assignee ? `<li><span>${esc(p.assignee.full_name)}</span><span class="tag">Brick &amp; Pane</span></li>` : ''}
          ${members.map((m) => `<li><span>${esc(m.user?.full_name || m.user?.email || '')}${m.user_id === user?.id ? ` ${tr('(you)')}` : ''}</span><span class="tag">${esc(tr(MEMBER_ROLES[m.role] || m.role))}</span></li>`).join('')}
          ${(d.invites || []).map((i) => `<li><span>${esc(i.email)}</span><span class="tag">${esc(tr(MEMBER_ROLES[i.role] || i.role))} · ${tr('invited')}</span></li>`).join('')}
        </ul>
        ${isOwner ? `
          <form class="invite" data-invite>
            <label for="inv-email" class="visually-hidden">${tr('Email')}</label>
            <input id="inv-email" name="email" type="email" placeholder="name@example.com" required>
            <label for="inv-role" class="visually-hidden">${tr('Role')}</label>
            <select id="inv-role" name="role">${Object.entries(MEMBER_ROLES).filter(([k]) => k !== 'owner').map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select>
            <button class="btn btn-sm btn-ghost" type="submit">${tr('Invite')}</button>
            <p class="note">${tr('Invite your client, engineer or contractor. Clients accept quotations; architects and engineers review drawings.')}</p>
          </form>` : ''}
      </div>
    </div>`;
}

export function documentsPanel(d, viewer, user = null) {
  const docs = d.documents;
  const members = d.members || [];
  const row = (doc) => {
    const L = decisionLabels(doc.kind);
    const approvals = d.approvals.filter((a) => a.document_id === doc.id);
    const last = approvals[approvals.length - 1];
    const rights = viewer === 'client' && doc.approval === 'pending' ? decisionRights(doc, user, members) : { can: false };
    const waiting = rights.reason === 'client' ? tr('Waiting for {name}', { name: esc(rights.waitingFor?.user?.full_name || tr('your client')) }) : (viewer === 'client' ? tr(doc.kind === 'quote' ? 'Your acceptance needed' : 'Your review needed') : tr('Awaiting client'));
    const status = doc.approval === 'pending' ? `<span class="badge badge-you">${waiting}</span>`
      : doc.approval === 'approved' ? `<span class="badge badge-ok">${tr(L.doneYes)}</span>`
      : doc.approval === 'changes_requested' ? `<span class="badge badge-warn">${tr(L.doneNo)}</span>` : '';
    const amount = doc.amount ? ` · ${money(doc.amount, viewer === 'client' && user?.account_type === 'homeowner' ? 'home' : 'trade')}` : '';
    return `
      <li class="doc">
        <div class="doc-main">
          <span class="doc-kind">${esc(tr(DOC_KINDS[doc.kind] || 'Document'))}${doc.version ? ` · ${esc(doc.version)}` : ''}${viewer === 'staff' && !doc.visible_to_client ? ` · <span class="tag">${tr('internal')}</span>` : ''}</span>
          <span class="doc-title">${esc(doc.title)}${amount}</span>
          <span class="doc-meta">${fmtDate(doc.created_at)} · ${esc(doc.uploader?.full_name || '')}${doc.size_bytes ? ` · ${fmtSize(doc.size_bytes)}` : ''}</span>
          ${last ? `<span class="doc-meta">${tr(last.decision === 'approved' ? L.doneYes : L.doneNo)} ${tr('by')} ${esc(last.actor?.full_name || '')}${last.on_behalf ? ` ${tr('on the client’s behalf')}` : ''}, ${fmtDate(last.created_at, true)}${last.comment ? `: “${esc(last.comment)}”` : ''}</span>` : ''}
        </div>
        <div class="doc-side">
          ${status}
          <button type="button" class="btn btn-sm btn-ghost" data-download="${esc(doc.id)}">${tr('Download')}</button>
        </div>
        ${rights.can ? `
          <form class="approve-form" data-approve="${esc(doc.id)}">
            <p class="approve-title"><strong>${tr(doc.kind === 'quote' ? 'Accept' : 'Review')}:</strong> ${esc(doc.title)}${doc.version ? `, ${esc(doc.version)}` : ''}${amount}</p>
            <label class="visually-hidden" for="c-${esc(doc.id)}">${tr('Comment')}</label>
            <textarea id="c-${esc(doc.id)}" name="comment" rows="2" placeholder="${tr(doc.kind === 'quote' ? 'Comment (required if you ask for changes)' : 'Your comments (required for “with comments”)')}"></textarea>
            ${doc.kind === 'quote' ? `<label class="consent"><input type="checkbox" name="confirm"> <span>${tr('I have read {doc}', { doc: esc(doc.version || tr('this quotation')) })}${amount ? ` (${amount.slice(3)})` : ''} ${tr('including its exclusions')}${rights.onBehalf ? tr(', and I have my client’s authority to accept it on their behalf') : ''}.</span></label>` : ''}
            <div class="btn-row"><button class="btn btn-sm" value="approved">${tr(L.approved)}</button><button class="btn btn-sm btn-ghost" value="changes_requested">${tr(L.changes_requested)}</button></div>
          </form>` : ''}
      </li>`;
  };
  return `
    ${docs.length ? `<ul class="doc-list">${docs.map(row).join('')}</ul>` : `<p class="note">${tr('No documents yet.')}</p>`}
    ${viewer === 'client' ? `
      <form class="upload-inline" data-client-upload>
        <label for="client-files" class="panel-h">${tr('Add files')}</label>
        <input id="client-files" type="file" name="files" multiple accept=".pdf,.dwg,.dxf,.xlsx,.xls,.csv,.jpg,.jpeg,.png">
        <button class="btn btn-sm" type="submit">${tr('Upload')}</button>
      </form>` : ''}`;
}

export function changesPanel(d, viewer, user) {
  const list = d.changes || [];
  const mine = (d.members || []).find((m) => m.user_id === user.id);
  const canDecide = (c) => c.status === 'proposed' && (viewer === 'staff' ? c.raiser?.role !== 'staff' : c.raiser?.role === 'staff' && mine && mine.role !== 'contractor');
  return `
    <p class="note" style="margin-bottom:var(--s-m)">${esc(tr('Every change to the specification is recorded here with its effect on performance, cost and programme, and nothing changes until it’s approved. Brick & Pane proposals are decided by the client team; requests from the client team are answered by Brick & Pane.'))}</p>
    ${list.length ? `<ul class="doc-list">${list.map((c) => `
      <li class="doc">
        <div class="doc-main">
          <span class="doc-kind">${tr('Change · raised by')} ${esc(c.raiser?.full_name || '')}${c.raiser?.role === 'staff' ? ' (Brick &amp; Pane)' : ''} · ${fmtDate(c.created_at)}</span>
          <span class="doc-title">${esc(c.title)}</span>
          ${c.description ? `<span class="doc-meta">${esc(c.description)}</span>` : ''}
          ${c.impact ? `<span class="change-impact"><strong>${tr('Impact:')}</strong> ${esc(c.impact)}</span>` : ''}
          ${c.decided_at ? `<span class="doc-meta">${esc(tr(CHANGE_STATUS[c.status]))} ${tr('by')} ${esc(c.decider?.full_name || '')}, ${fmtDate(c.decided_at, true)}${c.comment ? `: “${esc(c.comment)}”` : ''}</span>` : ''}
        </div>
        <div class="doc-side"><span class="badge ${c.status === 'approved' ? 'badge-ok' : c.status === 'proposed' ? 'badge-you' : 'badge-warn'}">${esc(tr(CHANGE_STATUS[c.status]))}</span></div>
        ${canDecide(c) ? `
          <form class="approve-form" data-change="${esc(c.id)}">
            <label class="visually-hidden" for="cc-${esc(c.id)}">${tr('Comment')}</label>
            <textarea id="cc-${esc(c.id)}" name="comment" rows="2" placeholder="${tr('Comment (required to reject)')}"></textarea>
            <div class="btn-row"><button class="btn btn-sm" value="approved">${tr('Approve change')}</button><button class="btn btn-sm btn-ghost" value="rejected">${tr('Reject')}</button></div>
          </form>` : ''}
        ${c.status === 'proposed' && c.raised_by === user.id ? `<div><button type="button" class="linkish" data-withdraw="${esc(c.id)}">${tr('Withdraw')}</button></div>` : ''}
      </li>`).join('')}</ul>` : `<p class="note">${tr('No changes so far. The specification is exactly as quoted.')}</p>`}
    <form class="ctl" data-raise style="margin-top:var(--s-l)">
      <h3 class="panel-h">${tr(viewer === 'staff' ? 'Propose a change to the client' : 'Request a change')}</h3>
      <div class="field"><label for="ch-title">${tr('What should change?')}</label><input id="ch-title" name="title" required placeholder="${viewer === 'staff' ? tr('e.g. Handle finish satin → black') : tr('e.g. Add a third panel')}"></div>
      <div class="field"><label for="ch-desc">${tr('Details')}</label><textarea id="ch-desc" name="description" rows="2"></textarea></div>
      ${viewer === 'staff' ? `<div class="field"><label for="ch-impact">${tr('Impact on U-value, security, weather, cost and programme')}</label><textarea id="ch-impact" name="impact" rows="2" required placeholder="${tr('e.g. No change to U-value or PAS 24. Cost and programme: no change.')}"></textarea></div>` : ''}
      <div><button class="btn btn-sm" type="submit">${tr(viewer === 'staff' ? 'Send for approval' : 'Send request')}</button></div>
    </form>`;
}

export function messagesPanel(d, user) {
  const staff = user.role === 'staff';
  return `
    <ol class="thread">${d.messages.length ? d.messages.map((m) => `
      <li class="msg ${m.author_id === user.id ? 'is-mine' : ''} ${m.internal ? 'is-internal' : ''}">
        <span class="msg-meta">${esc(m.author?.full_name || '')}${m.author?.role === 'staff' ? ' · Brick &amp; Pane' : ''} · ${fmtDate(m.created_at, true)}${m.internal ? ` · <span class="tag">${tr('internal note — client can’t see this')}</span>` : ''}</span>
        <div class="msg-body">${esc(m.body).replace(/\n/g, '<br>')}</div>
      </li>`).join('') : `<li class="note">${tr('No messages yet. Ask anything here instead of phoning: the whole team sees it.')}</li>`}
    </ol>
    <form class="composer" data-message data-mode="client">
      ${staff ? `<div class="seg composer-mode" role="radiogroup" aria-label="${tr('Message type')}">
        <label><input type="radio" name="mode" value="client" checked> <span>${tr('Message to client')}</span></label>
        <label><input type="radio" name="mode" value="internal"> <span>${tr('Internal note')}</span></label>
      </div>` : ''}
      <label for="msg-body" class="visually-hidden">${tr('Message')}</label>
      <textarea id="msg-body" name="body" rows="3" required placeholder="${tr(staff ? 'Write to the client…' : 'Write a message…')}"></textarea>
      <div class="btn-row"><span class="note composer-hint">${tr(staff ? 'The client will see this and get an email.' : 'Brick & Pane gets an email.')}</span><button class="btn btn-sm" type="submit">${tr(staff ? 'Send to client' : 'Send')}</button></div>
    </form>`;
}

export function timelinePanel(d, viewer, audience = viewer === 'staff' ? 'staff' : 'trade') {
  return `<ol class="timeline">${[...d.events].reverse().map((e) => `
    <li><span class="tl-date">${fmtDate(e.created_at, true)}</span>
      <span class="tl-body">${stageBadge(e.to_stage, audience)}${viewer === 'staff' && !e.visible_to_client ? ` <span class="tag">${tr('hidden from client')}</span>` : ''}
      ${e.note ? `<span class="tl-note">${esc(tr(e.note))}</span>` : ''}<span class="tl-actor">${esc(e.actor?.full_name || '')}</span></span></li>`).join('')}
  </ol>`;
}

// Message composer state per project, kept across live re-renders.
const composerDrafts = new Map();

// Wires the shared panels. `refresh` re-renders after a change.
export function bindDetail(root, d, refresh) {
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => refresh(b.dataset.tab)));
  $$('[data-download]', root).forEach((b) => b.addEventListener('click', async () => {
    const doc = d.documents.find((x) => x.id === b.dataset.download);
    try { const url = await store.fileUrl(doc); url ? window.open(url, '_blank', 'noopener') : toast(tr('Demo mode: files are not stored, so there is nothing to download.')); } catch (e) { toast(tr(e.message)); }
  }));
  $$('[data-approve]', root).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const decision = e.submitter?.value; const comment = f.comment.value.trim();
    if (decision === 'changes_requested' && !comment) { f.comment.focus(); toast(tr('Please add your comments.')); return; }
    if (decision === 'approved' && f.confirm && !f.confirm.checked) { f.confirm.focus(); toast(tr('Please tick the confirmation first.')); return; }
    try { await store.decide(f.dataset.approve, decision, comment, { onBehalf: !!f.confirm?.checked }); toast(tr(decision === 'approved' ? 'Done. We’ve been notified.' : 'Comments sent.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-change]', root).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const decision = e.submitter?.value; const comment = f.comment.value.trim();
    if (decision === 'rejected' && !comment) { f.comment.focus(); toast(tr('Please say why.')); return; }
    try { await store.decideChange(f.dataset.change, decision, comment); toast(tr(decision === 'approved' ? 'Change approved.' : 'Change rejected.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-withdraw]', root).forEach((b) => b.addEventListener('click', async () => { try { await store.decideChange(b.dataset.withdraw, 'withdrawn'); } catch (err) { toast(tr(err.message)); } }));
  $('[data-raise]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { await store.raiseChange(d.project.id, { title: f.title.value.trim(), description: f.description.value.trim(), impact: f.impact?.value.trim() || '' }); f.reset(); toast(tr('Sent.')); } catch (err) { toast(tr(err.message)); }
  });
  $('[data-invite]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try { const r = await store.inviteMember(d.project.id, f.email.value, f.role.value); f.reset(); toast(tr(r === 'added' ? 'Added to the project.' : 'Invitation saved. They’ll join when they create an account with that email.')); } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-paid]', root).forEach((b) => b.addEventListener('click', async () => { try { await store.markPaid(b.dataset.paid); } catch (err) { toast(tr(err.message)); } }));
  const composer = $('[data-message]', root);
  // Live updates re-render the whole panel. Keep the chosen mode and the draft, or an internal note
  // the staff member is writing would silently flip back to "message to client".
  const draft = composerDrafts.get(d.project.id) || { mode: 'client', body: '' };
  const setMode = (internal) => {
    composer.dataset.mode = internal ? 'internal' : 'client';
    const radio = $(`input[name="mode"][value="${internal ? 'internal' : 'client'}"]`, composer);
    if (radio) radio.checked = true;
    $('button[type=submit]', composer).textContent = tr(internal ? 'Save internal note' : (radio ? 'Send to client' : 'Send'));
    $('.composer-hint', composer).textContent = tr(internal ? 'Only Brick & Pane staff can see internal notes.' : (radio ? 'The client will see this and get an email.' : 'Brick & Pane gets an email.'));
    composer.body.placeholder = tr(internal ? 'Internal note — staff only…' : (radio ? 'Write to the client…' : 'Write a message…'));
  };
  if (composer) {
    composer.body.value = draft.body;
    if (draft.mode === 'internal' && $('input[name="mode"]', composer)) setMode(true);
  }
  composer?.addEventListener('change', (e) => {
    if (e.target.name !== 'mode') return;
    draft.mode = e.target.value === 'internal' ? 'internal' : 'client';
    composerDrafts.set(d.project.id, draft);
    setMode(draft.mode === 'internal');
  });
  composer?.addEventListener('input', (e) => { if (e.target.name === 'body') { draft.body = e.target.value; composerDrafts.set(d.project.id, draft); } });
  composer?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; const body = f.body.value.trim(); if (!body) return;
    const internal = f.dataset.mode === 'internal';
    // One click, one message: the button stays off until the first send finishes.
    const btn = $('button[type=submit]', f); if (btn?.disabled) return; if (btn) btn.disabled = true;
    try { await store.addMessage(d.project.id, body, internal); f.body.value = ''; draft.body = ''; composerDrafts.set(d.project.id, draft); } catch (err) { toast(tr(err.message)); }
    finally { if (btn) btn.disabled = false; }
  });
  $('[data-client-upload]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const files = [...e.currentTarget.files.files]; if (!files.length) return;
    if (files.some((x) => x.size > 50e6)) { toast(tr('Each file must be under 50 MB.')); return; }
    const btn = $('button[type=submit]', e.currentTarget); if (btn?.disabled) return; if (btn) btn.disabled = true;
    try { await store.uploadFiles(d.project.id, files); toast(tr('Uploaded. We’ve been notified.')); } catch (err) { toast(tr(err.message)); }
    finally { if (btn) btn.disabled = false; }
  });
}

export const counts = (d, viewer, user = null) => {
  const changes = d.changes || [];
  const mine = (d.members || []).find((m) => m.user_id === user?.id);
  return {
    documents: d.documents.length,
    messages: d.messages.length,
    changes: changes.length,
    pendingDocs: viewer === 'client' && d.documents.some((x) => x.approval === 'pending' && decisionRights(x, user, d.members || []).can),
    pendingChanges: changes.some((c) => c.status === 'proposed' && (viewer === 'staff' ? c.raiser?.role !== 'staff' : c.raiser?.role === 'staff' && mine && mine.role !== 'contractor')),
  };
};
