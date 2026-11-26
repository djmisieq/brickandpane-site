// The owner's dashboard (CRM audit, phase 4; migration 0043). STAFF ONLY: imported by admin.js alone.
// One call (owner_dashboard) gives every figure: where work comes from, how fast we answer and quote, what is in
// play, what we won and lost and why, the margin, the money in and due, and who carries what.
import { store } from './store.js';
import { esc, fmtMoney, $$ } from './core.js';
import { tr } from './i18n.js';

export const SOURCES = { website: 'Website', email: 'Email', phone: 'Phone', referral: 'Referral', repeat: 'Repeat client', cold: 'Cold campaign', other: 'Other', unknown: 'Not set' };
let period = 90;
const DAY = 86400000;
const num = (v) => (v == null ? '—' : String(v));

// Colour audit 26.11.2026: a tile is coloured only when it says something (true = late, a string = that tone).
const tile = (label, value, sub = '', tone = false) => `<div class="dash-tile${tone ? ` tone-${tone === true ? 'danger' : tone}` : ''}"><span class="stat-dt">${esc(tr(label))}</span><span class="dash-v">${value}</span>${sub ? `<span class="note">${sub}</span>` : ''}</div>`;
const bars = (rows, max) => `<ul class="dash-bars">${rows.map(([label, n, text]) => `<li><span class="dash-bl">${esc(label)}</span><span class="dash-bar"><span style="width:${max ? Math.max(2, Math.round((n / max) * 100)) : 0}%"></span></span><span class="dash-bn">${esc(text ?? String(n))}</span></li>`).join('')}</ul>`;

export async function dashboardView(app, nav) {
  document.title = `${tr('Dashboard')} | CRM`;
  let d = null, err = '';
  try { d = store.ownerDashboard ? await store.ownerDashboard(period) : null; } catch (e) { err = e.message; }
  const head = `<div class="dash-head"><div><h1 class="app-h1">${tr('Dashboard')}</h1></div>
    <div class="board-tools">${nav}<div class="seg" role="group" aria-label="${tr('Period')}">${[30, 90, 365].map((n) => `<button type="button" data-days="${n}" class="${period === n ? 'is-on' : ''}" aria-pressed="${period === n}">${tr('{n} days', { n })}</button>`).join('')}</div></div></div>`;
  if (!d) { app.innerHTML = `<div class="container-wide section-tight">${head}<p class="callout">${esc(tr(err || 'The dashboard is not available right now.'))}</p></div>`; bind(app, nav); return; }
  const m = d.margin || { sale: 0, cost: 0, low: [], projects: 0 };
  const mPct = Number(m.sale) > 0 ? Math.round(((m.sale - m.cost) / m.sale) * 1000) / 10 : null;
  const funnel = [[tr('Enquiries'), d.enquiries], [tr('New projects'), d.projects_new], [tr('Quoted'), d.quoted], [tr('Won'), d.won]];
  const fMax = Math.max(1, ...funnel.map((x) => x[1]));
  const src = (d.enquiries_by_source || []).map((x) => [tr(SOURCES[x.source] || x.source), x.n]);
  const months = (d.paid_by_month || []).map((x) => [x.month, Number(x.gbp), fmtMoney(x.gbp)]);
  const age = (iso) => Math.floor((Date.now() - new Date(iso)) / DAY);
  app.innerHTML = `<div class="container-wide section-tight" id="dashboard">
    ${head}
    <div class="dash-tiles">
      ${tile('New enquiries', num(d.enquiries), d.unanswered ? esc(tr('{n} without a reply now', { n: d.unanswered })) : esc(tr('all answered')), d.unanswered > 0 && 'warn')}
      ${tile('First reply, median', d.reply_hours_median == null ? '—' : esc(tr('{n} h', { n: d.reply_hours_median })), d.replied_known ? esc(tr('from {n} enquiries', { n: d.replied_known })) : esc(tr('measured from 25.11.2026')), Number(d.reply_hours_median) > 24 && 'warn')}
      ${tile('To the quote, median', d.quote_days_median == null ? '—' : esc(tr('{n} d', { n: d.quote_days_median })))}
      ${tile('Quotes in play', num((d.in_play || []).length), esc(fmtMoney(d.in_play_value)), (d.in_play || []).length > 0 && 'info')}
      ${tile('Won', num(d.won), esc(fmtMoney(d.won_value)), d.won > 0 && 'ok')}
      ${tile('Margin', mPct == null ? '—' : `${esc(String(mPct))}%`, m.projects ? esc(tr('{n} projects with costs', { n: m.projects })) : esc(tr('no accepted costs yet')), mPct != null && (mPct < 0 ? 'danger' : mPct < 20 ? 'warn' : 'ok'))}
      ${tile('Paid in', esc(fmtMoney(d.paid)), '', Number(d.paid) > 0 && 'ok')}
      ${tile('Due in 30 days', esc(fmtMoney(d.due_30)))}
      ${tile('Overdue', esc(fmtMoney(d.overdue)), '', Number(d.overdue) > 0)}
    </div>
    <div class="dash-grid">
      <section class="ctl"><h2 class="panel-h">${tr('From enquiry to order')}</h2>${bars(funnel, fMax)}
        <p class="note">${d.enquiries ? esc(tr('{pct}% of enquiries became an order', { pct: Math.round((d.won / d.enquiries) * 100) })) : ''}</p></section>
      <section class="ctl"><h2 class="panel-h">${tr('Where new projects came from')}</h2>${src.length ? bars(src, Math.max(...src.map((x) => x[1]))) : `<p class="hint">${tr('No new projects in this period.')}</p>`}
        <p class="note">${tr('Set the source on each project, in Commercial.')}</p></section>
      <section class="ctl"><h2 class="panel-h">${tr('Quotes in play')}</h2>${(d.in_play || []).length ? `<ul class="today-list">${d.in_play.map((x) => `<li><a class="today-row${age(x.sent_at) >= 14 ? ' is-late' : ''}" href="#/quotes/${esc(x.id)}"><span class="today-t">${esc(x.reference)}</span><span class="today-s">${esc(fmtMoney(x.net))}</span><span class="today-age">${esc(tr('{n} d', { n: age(x.sent_at) }))}</span></a></li>`).join('')}</ul>` : `<p class="hint">${tr('No quote waiting for an answer.')}</p>`}</section>
      <section class="ctl"><h2 class="panel-h">${tr('Margin below 20%')}</h2>${(m.low || []).length ? `<ul class="today-list">${m.low.map((x) => `<li><a class="today-row ${x.pct < 0 ? 'is-late' : 'is-warn'}" href="#/p/${esc(x.id)}"><span class="today-t">${esc(x.ref)} · ${esc(x.name)}</span><span class="today-age">${esc(String(x.pct))}%</span></a></li>`).join('')}</ul>` : `<p class="hint">${tr('No project below 20%.')}</p>`}</section>
      <section class="ctl bars-ok"><h2 class="panel-h">${tr('Paid in by month')}</h2>${months.length ? bars(months, Math.max(...months.map((x) => x[1]))) : `<p class="hint">${tr('No payments recorded in the last six months.')}</p>`}</section>
      <section class="ctl bars-neutral"><h2 class="panel-h">${tr('Lost, and why')}</h2>${(d.lost_reasons || []).length ? bars(d.lost_reasons.map((x) => [x.reason, x.n]), Math.max(...d.lost_reasons.map((x) => x.n))) : `<p class="hint">${tr('Nothing lost in this period.')}</p>`}</section>
      <section class="ctl"><h2 class="panel-h">${tr('Who carries what')}</h2><table class="dash-table"><thead><tr><th scope="col">${tr('Person')}</th><th scope="col">${tr('Open projects')}</th><th scope="col">${tr('Open tasks')}</th></tr></thead><tbody>${(d.workload || []).map((w) => `<tr><th scope="row">${esc(w.name || '—')}</th><td>${w.projects}</td><td>${w.tasks}</td></tr>`).join('')}</tbody></table></section>
    </div>
  </div>`;
  bind(app, nav);
}
function bind(app, nav) {
  $$('[data-days]', app).forEach((b) => b.addEventListener('click', () => { period = Number(b.dataset.days); dashboardView(app, nav); }));
}
