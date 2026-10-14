// Shared UI for the client portal and the staff CRM.
import { store } from './store.js';
import {
  STAGES, PHASES, DOC_KINDS, SYSTEMS, stage, stageIndex, stageLabel, stageText, tracker, esc, fmtDate, fmtDay, ago, fmtSize,
  stageBadge, courtLabel, estimatePanel, $, $$, toast,
} from './core.js';
import { PRICING, pricingVisible, pricingIsExample, estimateOpening, fmtGBP } from '../pricing.js';

export const showPrices = () => pricingVisible({ demo: store.mode === 'demo' });
export const estimateNote = () => (pricingIsExample() ? `${PRICING.label}.` : 'Automatic estimate, not a quotation.');

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
  el.innerHTML = `
    ${store.mode === 'demo' ? `<div class="demo-bar" role="note"><strong>Demo mode.</strong> Sample data stored in this browser only. Open the <a href="${area === 'admin' ? 'portal.html' : 'admin.html'}" target="_blank" rel="noopener">${area === 'admin' ? 'client portal' : 'staff CRM'}</a> in another tab to see updates arrive live. <button type="button" class="linkish" data-reset-demo>Reset demo</button></div>` : ''}
    <div class="appbar">
      <div class="container appbar-inner">
        <a class="appbar-title" href="${home}">${area === 'admin' ? 'Projects CRM' : 'Your projects'}</a>
        <div class="appbar-actions">
          ${area === 'portal' ? '<a class="btn btn-sm" href="#/new">New project</a>' : ''}
          <div class="notif">
            <button type="button" class="notif-btn" aria-expanded="false" aria-controls="notif-panel" aria-label="Notifications${unread ? `, ${unread} unread` : ''}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>
              ${unread ? `<span class="notif-count">${unread}</span>` : ''}
            </button>
            <div class="notif-panel" id="notif-panel" hidden>
              <div class="notif-head"><strong>Notifications</strong>${unread ? '<button type="button" class="linkish" data-read-all>Mark all read</button>' : ''}</div>
              <ul class="notif-list">${notes.length ? notes.map((n) => `
                <li class="${n.read_at ? '' : 'is-unread'}"><a href="${area === 'admin' ? 'admin.html' : 'portal.html'}#/p/${esc(n.project_id)}" data-note="${esc(n.id)}">
                  <span class="notif-title">${esc(n.title)}</span>${n.body ? `<span class="notif-body">${esc(n.body)}</span>` : ''}<span class="notif-time">${ago(n.created_at)}</span></a></li>`).join('') : '<li class="notif-empty">Nothing yet.</li>'}
              </ul>
            </div>
          </div>
          <details class="usermenu"><summary>${esc(user.full_name || user.email)}</summary>
            <div class="usermenu-panel">
              <span class="note">${esc(user.email || '')}${user.role === 'staff' ? ' · staff' : ''}</span>
              ${area === 'portal' ? '<a href="#/settings">Settings</a>' : '<a href="portal.html">Client view</a>'}
              ${user.role === 'staff' && area === 'portal' ? '<a href="admin.html">Staff CRM</a>' : ''}
              <button type="button" class="linkish" data-signout>Sign out</button>
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
  $('[data-reset-demo]', el)?.addEventListener('click', async () => { await store.resetDemo(); toast('Demo data reset.'); });
}

// ---------- pipeline ----------
export function pipeline(project, events, audience = 'trade') {
  const reached = {};
  events.forEach((e) => { reached[e.to_stage] = e.created_at; });
  const cur = stageIndex(project.stage);
  const side = cur < 0 ? stage(project.stage) : null;
  return `
    <div class="pipeline" aria-label="Project pipeline">
      ${side ? `<p class="pipeline-side">${stageBadge(project.stage, audience)} ${esc(side.client)}</p>` : ''}
      ${PHASES.map((ph) => `
        <div class="pipeline-phase">
          <h3 class="pipeline-phase-title">${ph}</h3>
          <ol>${STAGES.map((s, i) => ({ s, i })).filter(({ s }) => s.phase === ph).map(({ s, i }) => {
            const st = i < cur ? 'done' : i === cur ? 'current' : 'todo';
            return `<li class="ps ps-${st}${s.court === 'you' ? ' ps-you' : ''}" ${st === 'current' ? 'aria-current="step"' : ''}>
              <span class="ps-dot" aria-hidden="true"></span>
              <span class="ps-label">${esc(stageLabel(s.id, audience))}</span>
              <span class="ps-date">${reached[s.id] && st !== 'todo' ? fmtDate(reached[s.id]) : ''}</span>
            </li>`;
          }).join('')}</ol>
        </div>`).join('')}
    </div>`;
}

export function nowCard(project, viewer, audience = viewer === 'staff' ? 'staff' : 'trade') {
  const s = stage(project.stage);
  const court = courtLabel(project.stage, viewer);
  const due = project.due_at && s.court === 'us'
    ? `<li><span>${viewer === 'client' ? 'Next update by' : 'Due'}</span><span>${fmtDay(project.due_at)}</span></li>` : '';
  return `
    <section class="now-card ${s.court === 'you' ? 'is-you' : ''}" aria-label="Current status">
      ${audience === 'home' ? tracker(project.stage) : ''}
      <div class="now-head">${stageBadge(project.stage, audience)}${court ? `<span class="court court-${s.court}">${court}</span>` : ''}</div>
      <p class="now-text">${esc(viewer === 'client' ? stageText(project.stage, audience) : s.client.replace(/\byour\b/gi, 'the client’s'))}</p>
      ${project.next_step ? `<p class="now-next"><strong>Next step:</strong> ${esc(project.next_step)}</p>` : ''}
      <ul class="proof-list">
        ${due}
        <li><span>${viewer === 'client' ? 'Your contact' : 'Owner'}</span><span>${esc(project.assignee?.full_name || 'Being assigned')}</span></li>
        <li><span>In this stage since</span><span>${fmtDate(project.stage_changed_at)}</span></li>
      </ul>
    </section>`;
}

// ---------- tabs ----------
export function tabs(active, counts) {
  const t = [['overview', 'Overview'], ['documents', `Documents${counts.documents ? ` (${counts.documents})` : ''}`], ['messages', `Messages${counts.messages ? ` (${counts.messages})` : ''}`], ['timeline', 'Timeline']];
  return `<div class="tabs" role="tablist">${t.map(([id, label]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${id === active}" aria-controls="panel-${id}" data-tab="${id}">${label}${id === 'documents' && counts.pending ? ' <span class="dot-you" aria-label="action needed"></span>' : ''}</button>`).join('')}</div>`;
}

export function overviewPanel(d, viewer = 'client') {
  const p = d.project;
  const prices = showPrices();
  const hasQuote = d.documents.some((x) => x.kind === 'quote');
  const estBlock = p.estimate_low && prices && !hasQuote ? `
    <div class="estimate" style="margin-bottom:var(--s-l)">
      <span class="estimate-label">${viewer === 'staff' ? 'Automatic estimate shown to client' : 'Budget estimate'}</span>
      <span class="estimate-value">${fmtGBP(p.estimate_low)}–${fmtGBP(p.estimate_high)} + VAT</span>
      <span class="estimate-text">Supplied &amp; installed. ${viewer === 'staff' ? 'Calculated from the client’s schedule.' : 'Your formal quotation follows after our technical review.'} ${esc(estimateNote())}</span>
    </div>` : '';
  return `
    ${estBlock}
    <div class="grid-12">
      <div class="span-8">
        <h3 class="panel-h">Openings</h3>
        ${d.openings.length ? `<div style="overflow-x:auto"><table class="spec spec-compact"><thead><tr><th scope="col">Ref</th><th scope="col">System</th><th scope="col">W × H (mm)</th><th scope="col">Layout</th><th scope="col">Qty</th><th scope="col">Est. panel</th>${prices ? '<th scope="col">Est. budget</th>' : ''}</tr></thead><tbody>
          ${d.openings.map((o) => { const e = estimatePanel(o); return `<tr><th scope="row">${esc(o.ref)}</th><td>${esc(SYSTEMS[o.system] || o.system)}</td><td>${esc(o.width_mm)} × ${esc(o.height_mm)}</td><td>${esc(o.config || '—')}</td><td>${esc(o.qty)}</td><td>${e ? `${e.kg} kg${e.over ? ' <span class="tag tag-accent">check</span>' : ''}` : '—'}</td>${prices ? `<td>${(() => { const b = estimateOpening(o); return b ? fmtGBP(b.total) : '—'; })()}</td>` : ''}</tr>${o.notes ? `<tr class="sub"><td></td><td colspan="${prices ? 6 : 5}">${esc(o.notes)}</td></tr>` : ''}`; }).join('')}
        </tbody></table></div>` : '<p class="note">No openings listed yet.</p>'}
        ${p.brief ? `<h3 class="panel-h">Brief</h3><p class="measure">${esc(p.brief)}</p>` : ''}
      </div>
      <div class="start-9" style="grid-column:9 / span 4">
        <h3 class="panel-h">Project</h3>
        <ul class="proof-list">
          <li><span>Reference</span><span>${esc(p.ref)}</span></li>
          <li><span>Location</span><span>${esc(p.location || '—')}</span></li>
          ${p.riba_stage ? `<li><span>RIBA stage</span><span>${esc(p.riba_stage)}</span></li>` : ''}
          ${p.building_type ? `<li><span>Building</span><span>${esc(p.building_type)}</span></li>` : ''}
          ${p.start_window ? `<li><span>Start on site</span><span>${esc(p.start_window)}</span></li>` : ''}
          <li><span>Submitted</span><span>${fmtDate(p.created_at)}</span></li>
        </ul>
      </div>
    </div>`;
}

export function documentsPanel(d, viewer) {
  const docs = d.documents;
  const row = (doc) => {
    const approvals = d.approvals.filter((a) => a.document_id === doc.id);
    const last = approvals[approvals.length - 1];
    const status = doc.approval === 'pending' ? `<span class="badge badge-you">${viewer === 'client' ? 'Your approval needed' : 'Awaiting client'}</span>`
      : doc.approval === 'approved' ? '<span class="badge badge-ok">Approved</span>'
      : doc.approval === 'changes_requested' ? '<span class="badge badge-warn">Changes requested</span>' : '';
    return `
      <li class="doc">
        <div class="doc-main">
          <span class="doc-kind">${esc(DOC_KINDS[doc.kind] || 'Document')}${doc.version ? ` · ${esc(doc.version)}` : ''}${viewer === 'staff' && !doc.visible_to_client ? ' · <span class="tag">internal</span>' : ''}</span>
          <span class="doc-title">${esc(doc.title)}</span>
          <span class="doc-meta">${fmtDate(doc.created_at)} · ${esc(doc.uploader?.full_name || '')}${doc.size_bytes ? ` · ${fmtSize(doc.size_bytes)}` : ''}</span>
          ${last ? `<span class="doc-meta">${last.decision === 'approved' ? 'Approved' : 'Changes requested'} by ${esc(last.actor?.full_name || '')}, ${fmtDate(last.created_at, true)}${last.comment ? `: “${esc(last.comment)}”` : ''}</span>` : ''}
        </div>
        <div class="doc-side">
          ${status}
          <button type="button" class="btn btn-sm btn-ghost" data-download="${esc(doc.id)}">Download</button>
        </div>
        ${viewer === 'client' && doc.approval === 'pending' ? `
          <form class="approve-form" data-approve="${esc(doc.id)}">
            <label class="visually-hidden" for="c-${esc(doc.id)}">Comment</label>
            <textarea id="c-${esc(doc.id)}" name="comment" rows="2" placeholder="Comment (required if you request changes)"></textarea>
            <div class="btn-row"><button class="btn btn-sm" value="approved">Approve</button><button class="btn btn-sm btn-ghost" value="changes_requested">Request changes</button></div>
          </form>` : ''}
      </li>`;
  };
  return `
    ${docs.length ? `<ul class="doc-list">${docs.map(row).join('')}</ul>` : '<p class="note">No documents yet.</p>'}
    ${viewer === 'client' ? `
      <form class="upload-inline" data-client-upload>
        <label for="client-files" class="panel-h">Add files</label>
        <input id="client-files" type="file" name="files" multiple accept=".pdf,.dwg,.dxf,.xlsx,.xls,.csv,.jpg,.jpeg,.png">
        <button class="btn btn-sm" type="submit">Upload</button>
      </form>` : ''}`;
}

export function messagesPanel(d, user) {
  return `
    <ol class="thread">${d.messages.length ? d.messages.map((m) => `
      <li class="msg ${m.author_id === user.id ? 'is-mine' : ''} ${m.internal ? 'is-internal' : ''}">
        <span class="msg-meta">${esc(m.author?.full_name || '')}${m.author?.role === 'staff' ? ' · Brick &amp; Pane' : ''} · ${fmtDate(m.created_at, true)}${m.internal ? ' · <span class="tag">internal note</span>' : ''}</span>
        <div class="msg-body">${esc(m.body).replace(/\n/g, '<br>')}</div>
      </li>`).join('') : '<li class="note">No messages yet. Ask anything here instead of phoning: the whole team sees it.</li>'}
    </ol>
    <form class="composer" data-message>
      <label for="msg-body" class="visually-hidden">Message</label>
      <textarea id="msg-body" name="body" rows="3" required placeholder="Write a message…"></textarea>
      <div class="btn-row">
        ${user.role === 'staff' ? '<label class="consent"><input type="checkbox" name="internal"> <span>Internal note (staff only)</span></label>' : ''}
        <button class="btn btn-sm" type="submit">Send</button>
      </div>
    </form>`;
}

export function timelinePanel(d, viewer, audience = viewer === 'staff' ? 'staff' : 'trade') {
  return `<ol class="timeline">${[...d.events].reverse().map((e) => `
    <li><span class="tl-date">${fmtDate(e.created_at, true)}</span>
      <span class="tl-body">${stageBadge(e.to_stage, audience)}${viewer === 'staff' && !e.visible_to_client ? ' <span class="tag">hidden from client</span>' : ''}
      ${e.note ? `<span class="tl-note">${esc(e.note)}</span>` : ''}<span class="tl-actor">${esc(e.actor?.full_name || '')}</span></span></li>`).join('')}
  </ol>`;
}

// Wires the shared panels. `refresh` re-renders after a change.
export function bindDetail(root, d, refresh) {
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => refresh(b.dataset.tab)));
  $$('[data-download]', root).forEach((b) => b.addEventListener('click', async () => {
    const doc = d.documents.find((x) => x.id === b.dataset.download);
    try { const url = await store.fileUrl(doc); url ? window.open(url, '_blank', 'noopener') : toast('Demo mode: files are not stored, so there is nothing to download.'); } catch (e) { toast(e.message); }
  }));
  $$('[data-approve]', root).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const decision = e.submitter?.value; const comment = f.comment.value.trim();
    if (decision === 'changes_requested' && !comment) { f.comment.focus(); toast('Please say what needs to change.'); return; }
    try { await store.decide(f.dataset.approve, decision, comment); toast(decision === 'approved' ? 'Approved. We’ve been notified.' : 'Change request sent.'); } catch (err) { toast(err.message); }
  }));
  $('[data-message]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; const body = f.body.value.trim(); if (!body) return;
    try { await store.addMessage(d.project.id, body, !!f.internal?.checked); f.reset(); } catch (err) { toast(err.message); }
  });
  $('[data-client-upload]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const files = [...e.currentTarget.files.files]; if (!files.length) return;
    try { await store.uploadFiles(d.project.id, files); toast('Uploaded. Your technical lead has been notified.'); } catch (err) { toast(err.message); }
  });
}

export const counts = (d, viewer) => ({
  documents: d.documents.length,
  messages: d.messages.length,
  pending: viewer === 'client' && d.documents.some((x) => x.approval === 'pending'),
});
