// On site (top-CRM audit 28.11.2026): the fitter's day on a phone, and the handover record signed with a finger.
// STAFF ONLY: imported by admin.js alone. Nothing here sends anything to anyone; a handover PDF reaches the client's
// Documents only when the person ticks "share", and its date is the one the person enters.
import { store } from './store.js';
import { esc, fmtDay, SYSTEMS, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { ICON } from './icons.js';
import { item, bindChecklists } from './tasks.js';

const KIND = { survey: 'Survey', delivery: 'Delivery', install: 'Fitting', service: 'Service visit', other: 'Visit' };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
let mineOnly = true;

export async function siteView(app, user) {
  document.title = `${tr('On site')} | CRM`;
  const from = dayOf(-1), to = dayOf(7);
  const [bookings, staff] = await Promise.all([store.listBookings ? store.listBookings({ from, to }).catch(() => []) : [], store.listStaff ? store.listStaff().catch(() => []) : []]);
  const list = bookings.filter((b) => !mineOnly || !b.staff_id || b.staff_id === user.id).filter((b) => b.ends_on >= dayOf(0));
  const ids = [...new Set(list.map((b) => b.project_id))].slice(0, 12);
  const data = new Map(await Promise.all(ids.map(async (id) => [id, await Promise.all([
    store.getProject(id).catch(() => null), store.listTasks ? store.listTasks({ projectId: id, open: true }).catch(() => []) : [], store.projectPeople ? store.projectPeople(id).catch(() => []) : []])])));
  const when = (b) => (b.starts_on <= dayOf(0) ? tr('Today') : b.starts_on === dayOf(1) ? tr('Tomorrow') : fmtDay(`${b.starts_on}T12:00:00`)) + (b.ends_on > b.starts_on ? ` – ${fmtDay(`${b.ends_on}T12:00:00`)}` : '');
  const card = (b) => {
    const [d, tasks, people] = data.get(b.project_id) || [];
    if (!d) return '';
    const p = d.project, main = people.find((x) => x.is_main)?.person || people[0]?.person;
    const maps = p.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location)}` : '';
    const ops = d.openings || [];
    return `<article class="ctl site-card" data-site="${esc(p.id)}">
      <p class="site-when"><span class="tag tone-info">${esc(tr(KIND[b.kind] || 'Visit'))}</span> ${esc(when(b))}${b.note ? ` · ${esc(b.note)}` : ''}</p>
      <h2 class="site-h"><a href="#/p/${esc(p.id)}">${esc(p.ref)} · ${esc(p.name)}</a></h2>
      <p class="site-acts">${maps ? `<a class="btn btn-sm btn-ghost" href="${esc(maps)}" target="_blank" rel="noopener">${ICON.map}${esc(p.location)}</a>` : ''}
        ${main?.phone ? `<a class="btn btn-sm btn-ghost" href="tel:${esc(main.phone.replace(/[^\d+]/g, ''))}">${ICON.phone}${esc(main.full_name || tr('Call'))}</a>` : ''}
        <a class="btn btn-sm" href="#/handover/${esc(p.id)}">${tr('Handover record')}</a></p>
      ${ops.length ? `<details class="site-ops" open><summary class="note">${esc(tr('{n} openings', { n: ops.reduce((n, o) => n + (o.qty || 1), 0) }))}</summary><table class="dash-table"><tbody>${ops.map((o) => `<tr><th scope="row">${esc(o.ref || '—')}</th><td>${esc(tr(SYSTEMS[o.system] || o.system || ''))}</td><td class="num">${o.width_mm && o.height_mm ? `${o.width_mm}×${o.height_mm}` : '—'}</td><td class="num">×${o.qty || 1}</td></tr>`).join('')}</tbody></table></details>` : ''}
      ${tasks.length ? `<ul class="task-list">${tasks.map((t) => item(t, staff)).join('')}</ul>` : `<p class="hint">${tr('No open tasks.')}</p>`}
    </article>`;
  };
  app.innerHTML = `<div class="container-wide section-tight site">
    <div class="dash-head"><h1 class="app-h1">${tr('On site')}</h1>
      <div class="seg" role="group" aria-label="${tr('Whose visits')}"><button type="button" data-site-mine="1" class="${mineOnly ? 'is-on' : ''}" aria-pressed="${mineOnly}">${tr('Mine')}</button><button type="button" data-site-mine="" class="${mineOnly ? '' : 'is-on'}" aria-pressed="${!mineOnly}">${tr('Everyone')}</button></div></div>
    <p class="hint">${tr('Surveys, deliveries and fitting from today for a week: the address, the openings and the checklists to tick on site.')}</p>
    ${list.length ? list.map(card).join('') : `<p class="callout">${tr('Nothing booked from today for a week. Bookings are made on the project card, in the calendar.')}</p>`}
  </div>`;
  $$('[data-site-mine]', app).forEach((b) => b.addEventListener('click', () => { mineOnly = !!b.dataset.siteMine; siteView(app, user); }));
  bindChecklists(app);
  $$('[data-task-done]', app).forEach((c) => c.addEventListener('change', async () => { try { await store.setTaskDone(c.closest('[data-task]').dataset.task, c.checked); } catch (err) { c.checked = !c.checked; toast(tr(err.message)); } }));
}

// ---------- the handover record ----------
const CHECKS = ['Every sash opens, closes and locks', 'Drainage and seals checked', 'Glass checked for scratches and labels removed', 'Frames sealed and finished inside and out', 'Site cleaned, packaging removed', 'Client shown how to use and clean'];
let pdfLib = null;
const loadPdfLib = () => (pdfLib ||= new Promise((ok, fail) => {
  if (window.html2pdf) { ok(window.html2pdf); return; }
  const s = document.createElement('script'); s.src = new URL('../vendor/html2pdf.bundle.min.js', import.meta.url).href;
  s.onload = () => ok(window.html2pdf); s.onerror = () => { pdfLib = null; fail(new Error('pdf')); }; document.head.append(s);
}));

export async function handoverView(app, pid, user) {
  const d = await store.getProject(pid);
  const p = d.project, ops = d.openings || [], past = store.listHandovers ? await store.listHandovers(pid).catch(() => []) : [];
  document.title = `${tr('Handover record')} · ${p.ref} | CRM`;
  const opOpts = `<option value="">${tr('Whole job')}</option>${ops.map((o) => `<option value="${esc(o.ref)}">${esc(o.ref)}</option>`).join('')}`;
  const snagRow = () => `<li class="ho-snag"><select name="snag_op" aria-label="${esc(tr('Opening'))}">${opOpts}</select><input name="snag_t" maxlength="300" placeholder="${esc(tr('e.g. Scratch on the outer pane'))}" aria-label="${esc(tr('Snag'))}"><button type="button" class="q-icon" data-snag-del aria-label="${esc(tr('Remove'))}">×</button></li>`;
  app.innerHTML = `<div class="container-wide section-tight ho">
    <nav class="breadcrumb" aria-label="${tr('Breadcrumb')}"><ol><li><a href="#/site">${tr('On site')}</a></li><li><a href="#/p/${esc(p.id)}">${esc(p.ref)}</a></li><li aria-current="page">${tr('Handover record')}</li></ol></nav>
    <h1 class="app-h1">${tr('Handover record')}: ${esc(p.name)}</h1>
    ${past.length ? `<p class="note">${esc(tr('Signed before: {list}', { list: past.map((h) => `${h.signed_name || '—'} ${h.signed_on ? fmtDay(`${h.signed_on}T12:00:00`) : ''}`).join(', ') }))}</p>` : ''}
    <form class="ctl ho-form" data-ho novalidate>
      <fieldset><legend class="panel-h">${tr('Checked with the client')}</legend>
        <ul class="task-cl-list">${CHECKS.map((c, i) => `<li><label><input type="checkbox" name="chk" value="${i}"> <span>${esc(tr(c))}</span></label></li>`).join('')}</ul></fieldset>
      <fieldset><legend class="panel-h">${tr('Snags left to put right')}</legend>
        <p class="hint">${tr('Each snag becomes a task on the project.')}</p>
        <ul class="ho-snags" data-snags></ul><button type="button" class="btn btn-sm btn-ghost" data-snag-add>${tr('+ Snag')}</button></fieldset>
      <div class="field"><label for="ho-notes">${tr('Notes')}</label><textarea id="ho-notes" name="notes" rows="2" maxlength="4000"></textarea></div>
      <div class="field-row">
        <div class="field"><label for="ho-name">${tr('Client’s name')}</label><input id="ho-name" name="name" maxlength="120" required autocomplete="off"></div>
        <div class="field"><label for="ho-date">${tr('Date')}</label><input id="ho-date" name="date" type="date" required max="${dayOf(0)}"></div>
      </div>
      <div class="field"><span class="label" id="ho-sig-l">${tr('Client’s signature')}</span>
        <canvas class="ho-sig" width="600" height="200" aria-labelledby="ho-sig-l" data-sig></canvas>
        <button type="button" class="btn btn-sm btn-ghost" data-sig-clear>${tr('Clear the signature')}</button></div>
      <label class="consent"><input type="checkbox" name="share"> <span>${tr('Share the PDF with the client in Documents')}</span></label>
      <p class="hint">${tr('The PDF is saved in Documents either way; nothing is emailed.')}</p>
      <div class="btn-row"><button class="btn" type="submit">${tr('Save the handover record')}</button><a class="btn btn-ghost" href="#/p/${esc(p.id)}">${tr('Cancel')}</a></div>
    </form>
    <div class="ho-pdf" data-ho-pdf hidden></div>
  </div>`;
  const f = $('[data-ho]', app), snags = $('[data-snags]', app);
  const addSnag = () => { snags.insertAdjacentHTML('beforeend', snagRow()); $('li:last-child [name="snag_t"]', snags).focus(); };
  $('[data-snag-add]', app).addEventListener('click', addSnag);
  snags.addEventListener('click', (e) => { if (e.target.closest('[data-snag-del]')) e.target.closest('li').remove(); });
  // The signature: drawn with a finger, a stylus or a mouse.
  const cv = $('[data-sig]', app), ctx = cv.getContext('2d'); let drawn = false, down = false;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pt(e)); });
  cv.addEventListener('pointermove', (e) => { if (!down) return; ctx.lineTo(...pt(e)); ctx.stroke(); drawn = true; });
  ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, () => { down = false; }));
  $('[data-sig-clear]', app).addEventListener('click', () => { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = f.name.value.trim(), date = f.date.value;
    if (!name) { f.name.focus(); toast(tr('Enter the client’s name.'), { tone: 'error' }); return; }
    if (!date) { f.date.focus(); toast(tr('Enter the date of the handover.'), { tone: 'error' }); return; }
    if (date > dayOf(0)) { f.date.focus(); toast(tr('The date cannot be in the future.'), { tone: 'error' }); return; }
    if (!drawn) { toast(tr('Ask the client to sign in the box.'), { tone: 'error' }); return; }
    const checks = CHECKS.map((t, i) => ({ t, ok: !!f.querySelector(`[name="chk"][value="${i}"]`).checked }));
    const snagList = $$('li', snags).map((li) => ({ op: $('[name="snag_op"]', li).value, t: $('[name="snag_t"]', li).value.trim() })).filter((x) => x.t);
    const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      const signature = cv.toDataURL('image/png');
      const rec = await store.saveHandover(pid, { checks, snags: snagList, notes: f.notes.value.trim(), signed_name: name, signature, signed_on: date });
      for (const s of snagList) await store.addTask({ title: `${tr('Snag')}: ${s.op ? `${s.op} · ` : ''}${s.t}`, kind: 'visit', project_id: pid, assignee_id: p.assignee_id || user.id });
      const file = await handoverPdf(app, p, rec, checks, snagList).catch(() => null);
      if (file) await store.uploadFiles(pid, [file], { kind: 'other', title: `${tr('Handover record')} ${p.ref}`, visible: f.share.checked });
      toast(tr(file ? 'Handover record saved, with its PDF in Documents.' : 'Handover record saved. The PDF could not be made; try again from this page.'), { tone: file ? 'ok' : 'error' });
      location.hash = `#/p/${p.id}`;
    } catch (err) { btn.disabled = false; toast(tr(err.message), { tone: 'error' }); }
  });
}

async function handoverPdf(app, p, rec, checks, snags) {
  const html2pdf = await loadPdfLib(), box = $('[data-ho-pdf]', app);
  box.hidden = false;
  box.innerHTML = `<div class="ho-doc"><h1>${esc(tr('Handover record'))}</h1><p><strong>${esc(p.ref)} · ${esc(p.name)}</strong><br>${esc(p.location || '')}</p>
    <h2>${esc(tr('Checked with the client'))}</h2><ul>${checks.map((c) => `<li>${c.ok ? '☑' : '☐'} ${esc(tr(c.t))}</li>`).join('')}</ul>
    <h2>${esc(tr('Snags left to put right'))}</h2>${snags.length ? `<ul>${snags.map((s) => `<li>${s.op ? `${esc(s.op)}: ` : ''}${esc(s.t)}</li>`).join('')}</ul>` : `<p>${esc(tr('None'))}</p>`}
    ${rec.notes ? `<h2>${esc(tr('Notes'))}</h2><p>${esc(rec.notes)}</p>` : ''}
    <p>${esc(tr('Client’s name'))}: <strong>${esc(rec.signed_name)}</strong> · ${esc(tr('Date'))}: <strong>${esc(fmtDay(`${rec.signed_on}T12:00:00`))}</strong></p>
    <img src="${esc(rec.signature)}" alt="${esc(tr('Client’s signature'))}" width="300" height="100"><p class="ho-foot">Brick &amp; Pane</p></div>`;
  try {
    const blob = await html2pdf().set({ margin: [14, 14, 14, 14], image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(box.firstElementChild).outputPdf('blob');
    return new File([blob], `Handover-${p.ref}-${rec.signed_on}.pdf`.replace(/[^\w.-]+/g, '-'), { type: 'application/pdf' });
  } finally { box.hidden = true; box.innerHTML = ''; }
}
