// The owner's dashboard (CRM audit, phase 4; migration 0043). STAFF ONLY: imported by admin.js alone.
// One call (owner_dashboard) gives every figure: where work comes from, how fast we answer and quote, what is in
// play, what we won and lost and why, the margin, the money in and due, and who carries what.
import { store } from './store.js';
import { esc, fmtMoney, $$, STAGES } from './core.js';
import { tr, locale } from './i18n.js';
import { workloadSection } from './u3.js';

export const SOURCES = { website: 'Website', email: 'Email', phone: 'Phone', referral: 'Referral', repeat: 'Repeat client', cold: 'Cold campaign', other: 'Other', unknown: 'Not set' };
let period = 90;
const DAY = 86400000;
const num = (v) => (v == null ? '—' : String(v));

// Colour audit 26.11.2026: a tile is coloured only when it says something (true = late, a string = that tone).
// A tile with a link opens the list behind its number (UX audit U3: every number can be checked).
const tile = (label, value, sub = '', tone = false, href = '') => `<${href ? `a href="${href}"` : 'div'} class="dash-tile${href ? ' is-link' : ''}${tone ? ` tone-${tone === true ? 'danger' : tone}` : ''}"><span class="stat-dt">${esc(tr(label))}</span><span class="dash-v">${value}</span>${sub ? `<span class="note">${sub}</span>` : ''}</${href ? 'a' : 'div'}>`;
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
  // UX audit 27.11.2026 (B1): the bars counted different things (form enquiries vs all projects), so the funnel grew
  // downwards and showed "200%". Now one line of projects; form enquiries keep their own tile above.
  const funnel = [[tr('New projects'), d.projects_new], [tr('Quoted'), d.quoted], [tr('Won'), d.won]];
  const fMax = Math.max(1, ...funnel.map((x) => x[1]));
  const src = (d.enquiries_by_source || []).map((x) => [tr(SOURCES[x.source] || x.source), x.n]);
  const months = (d.paid_by_month || []).map((x) => [x.month, Number(x.gbp), fmtMoney(x.gbp)]);
  const age = (iso) => Math.floor((Date.now() - new Date(iso)) / DAY);
  app.innerHTML = `<div class="container-wide section-tight" id="dashboard">
    ${head}
    <div class="dash-tiles">
      ${tile('New enquiries', num(d.enquiries), d.unanswered ? esc(tr('{n} without a reply now', { n: d.unanswered })) : esc(tr('all answered')), d.unanswered > 0 && 'warn', '#/enquiries')}
      ${tile('First reply, median', d.reply_hours_median == null ? '—' : esc(tr('{n} h', { n: d.reply_hours_median })), d.replied_known ? esc(tr('from {n} enquiries', { n: d.replied_known })) : esc(tr('measured from 25.11.2026')), Number(d.reply_hours_median) > 24 && 'warn')}
      ${tile('To the quote, median', d.quote_days_median == null ? '—' : esc(tr('{n} d', { n: d.quote_days_median })))}
      ${tile('Quotes in play', num((d.in_play || []).length), esc(fmtMoney(d.in_play_value)), (d.in_play || []).length > 0 && 'info', '#/quotes')}
      ${tile('Won', num(d.won), esc(fmtMoney(d.won_value)), d.won > 0 && 'ok', '#/list?group=stage')}
      ${tile('Margin', mPct == null ? '—' : `${esc(String(mPct))}%`, m.projects ? esc(tr('{n} projects with costs', { n: m.projects })) : esc(tr('no accepted costs yet')), mPct != null && (mPct < 0 ? 'danger' : mPct < 20 ? 'warn' : 'ok'))}
      ${tile('Paid in', esc(fmtMoney(d.paid)), '', Number(d.paid) > 0 && 'ok')}
      ${tile('Due in 30 days', esc(fmtMoney(d.due_30)))}
      ${tile('Overdue', esc(fmtMoney(d.overdue)), '', Number(d.overdue) > 0)}
    </div>
    <div class="dash-grid">
      <section class="ctl"><h2 class="panel-h">${tr('From enquiry to order')}</h2>${bars(funnel, fMax)}
        <p class="note">${d.projects_new ? esc(tr('{pct}% of new projects were won', { pct: Math.min(100, Math.round((d.won / d.projects_new) * 100)) })) : ''}</p></section>
      <section class="ctl"><h2 class="panel-h">${tr('Where new projects came from')}</h2>${src.length ? bars(src, Math.max(...src.map((x) => x[1]))) : `<p class="hint">${tr('No new projects in this period.')}</p>`}
        <p class="note">${tr('Set the source on each project, in Commercial.')}</p></section>
      <section class="ctl"><h2 class="panel-h">${tr('Quotes in play')}</h2>${(d.in_play || []).length ? `<ul class="today-list">${d.in_play.map((x) => `<li><a class="today-row${age(x.sent_at) >= 14 ? ' is-late' : ''}" href="#/quotes/${esc(x.id)}"><span class="today-t">${esc(x.reference)}</span><span class="today-s">${esc(fmtMoney(x.net))}</span><span class="today-age">${esc(tr('{n} d', { n: age(x.sent_at) }))}</span></a></li>`).join('')}</ul>` : `<p class="hint">${tr('No quote waiting for an answer.')}</p>`}</section>
      <section class="ctl"><h2 class="panel-h">${tr('Margin below 20%')}</h2>${(m.low || []).length ? `<ul class="today-list">${m.low.map((x) => `<li><a class="today-row ${x.pct < 0 ? 'is-late' : 'is-warn'}" href="#/p/${esc(x.id)}"><span class="today-t">${esc(x.ref)} · ${esc(x.name)}</span><span class="today-age">${esc(String(x.pct))}%</span></a></li>`).join('')}</ul>` : `<p class="hint">${tr('No project below 20%.')}</p>`}</section>
      <section class="ctl bars-ok"><h2 class="panel-h">${tr('Paid in by month')}</h2>${months.length ? bars(months, Math.max(...months.map((x) => x[1]))) : `<p class="hint">${tr('No payments recorded in the last six months.')}</p>`}</section>
      <section class="ctl bars-neutral"><h2 class="panel-h">${tr('Lost, and why')}</h2>${(d.lost_reasons || []).length ? bars(d.lost_reasons.map((x) => [x.reason, x.n]), Math.max(...d.lost_reasons.map((x) => x.n))) : `<p class="hint">${tr('Nothing lost in this period.')}</p>`}</section>
      <section class="ctl"><h2 class="panel-h">${tr('Who carries what')}</h2><table class="dash-table"><thead><tr><th scope="col">${tr('Person')}</th><th scope="col">${tr('Open projects')}</th><th scope="col">${tr('Open tasks')}</th></tr></thead><tbody>${(d.workload || []).map((w) => `<tr><th scope="row">${esc(w.name || '—')}</th><td>${w.projects}</td><td>${w.tasks}</td></tr>`).join('')}</tbody></table></section>
    </div>
    ${await pipelineSection()}
    ${await workloadSection()}
  </div>`;
  bind(app, nav);
}
// The pipeline report (top-CRM audit 28.11.2026, "like Pipedrive"): of the projects that came in during the period,
// how many reached each stage and went on to the next; how long a stage takes (median); what is open in each stage
// now, its value and its value weighted by probability; and the money the instalments bring in, month by month.
async function pipelineSection() {
  if (!store.stageHistory) return '';
  let projects, events, pays;
  try { [projects, events, pays] = await Promise.all([store.listProjects(), store.stageHistory(), store.allPayments()]); } catch { return ''; }
  const since = Date.now() - period * DAY, idx = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
  const byP = new Map(); events.forEach((e) => { if (!byP.has(e.project_id)) byP.set(e.project_id, []); byP.get(e.project_id).push(e); });
  const cohort = projects.filter((p) => new Date(p.created_at) >= since);
  const top = (p) => Math.max(idx[p.stage] ?? -1, ...(byP.get(p.id) || []).map((e) => idx[e.to_stage] ?? -1));
  const reached = STAGES.map((_, i) => cohort.filter((p) => top(p) >= i).length);
  const spans = STAGES.map(() => []);
  byP.forEach((list) => list.forEach((e, k) => {
    const end = list[k + 1] ? new Date(list[k + 1].created_at) : Date.now(), start = new Date(e.created_at);
    if (idx[e.to_stage] != null && end >= since) spans[idx[e.to_stage]].push((end - start) / DAY);
  }));
  const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return Math.round((b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) * 10) / 10; };
  const open = STAGES.map((s) => projects.filter((p) => p.stage === s.id));
  const val = (list) => list.reduce((n, p) => n + Number(p.internal?.value_gbp || 0), 0);
  const wtd = (list) => list.reduce((n, p) => n + (p.internal?.value_gbp != null && p.internal?.probability != null ? Number(p.internal.value_gbp) * p.internal.probability / 100 : 0), 0);
  const rows = STAGES.map((s, i) => {
    const conv = i < STAGES.length - 1 && reached[i] ? Math.round((reached[i + 1] / reached[i]) * 100) : null, med = median(spans[i]);
    return `<tr><th scope="row"><a href="#/board">${esc(tr(s.staffLabel || s.label || s.id))}</a></th><td class="num">${reached[i]}</td>
      <td class="num${conv != null && conv < 50 && i < idx.accepted ? ' cf-warn' : ''}">${conv == null ? '—' : `${conv}%`}</td><td class="num">${med == null ? '—' : esc(tr('{n} d', { n: med }))}</td>
      <td class="num">${open[i].length || '—'}</td><td class="num">${open[i].length ? esc(fmtMoney(val(open[i]))) : '—'}</td><td class="num">${open[i].length && wtd(open[i]) ? esc(fmtMoney(Math.round(wtd(open[i])))) : '—'}</td></tr>`;
  }).join('');
  const openSales = STAGES.slice(0, idx.accepted).flatMap((_, i) => open[i]);
  // Money expected: unpaid instalments by the month they fall due (overdue and undated apart).
  const now = new Date(), mk = (d) => d.toISOString().slice(0, 7), months = [];
  for (let k = 0; k < 6; k += 1) months.push(mk(new Date(Date.UTC(now.getFullYear(), now.getMonth() + k, 1))));
  const unpaid = pays.filter((x) => !x.paid_at), due = Object.fromEntries(months.map((m) => [m, 0])); let overdue = 0, undated = 0, later = 0;
  unpaid.forEach((x) => { const a = Number(x.amount || 0); if (!x.due_date) undated += a; else if (new Date(x.due_date) < new Date(now.toDateString())) overdue += a; else { const m = String(x.due_date).slice(0, 7); if (m in due) due[m] += a; else later += a; } });
  const cash = [...(overdue ? [[tr('Overdue'), overdue]] : []), ...months.map((m) => [new Date(`${m}-01T12:00:00`).toLocaleDateString(locale, { month: 'short', year: 'numeric' }), due[m]]), ...(later ? [[tr('Later'), later]] : []), ...(undated ? [[tr('No due date'), undated]] : [])];
  const cMax = Math.max(1, ...cash.map((x) => x[1]));
  return `<div class="dash-grid dash-pipe">
    <section class="ctl dash-wide"><h2 class="panel-h">${tr('Pipeline, stage by stage')}</h2>
      <p class="hint">${esc(tr('Of the {n} projects that came in during the period: how many reached each stage and went on to the next. Days in a stage are the median. Open now is every project in that stage today.', { n: cohort.length }))}</p>
      <div class="table-scroll"><table class="dash-table dash-pipe-t"><thead><tr><th scope="col">${tr('Stage')}</th><th scope="col" class="num">${tr('Reached')}</th><th scope="col" class="num">${tr('Went on')}</th><th scope="col" class="num">${tr('Days in stage')}</th><th scope="col" class="num">${tr('Open now')}</th><th scope="col" class="num">${tr('Value')}</th><th scope="col" class="num">${tr('Weighted')}</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><th scope="row">${tr('Open sales, weighted')}</th><td colspan="5"></td><td class="num">${esc(fmtMoney(Math.round(wtd(openSales))))}</td></tr></tfoot></table></div></section>
    <section class="ctl bars-ok"><h2 class="panel-h">${tr('Money expected from instalments')}</h2>${unpaid.length ? bars(cash.map(([l, n]) => [l, n, fmtMoney(n)]), cMax) : `<p class="hint">${tr('No unpaid instalments.')}</p>`}
      <p class="note">${tr('Instalments without a due date count once a date is set.')}</p></section>
  </div>`;
}
function bind(app, nav) {
  $$('[data-days]', app).forEach((b) => b.addEventListener('click', () => { period = Number(b.dataset.days); dashboardView(app, nav); }));
}
