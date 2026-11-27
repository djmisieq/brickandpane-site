// Automations (UX audit 27.11.2026, stage U2): the rules the server runs every 15 minutes (migration 0051),
// written as sentences with their number of days, a switch, and how many tasks each made lately.
// A rule only ever makes a TASK for a person: nothing goes to a client by itself.
import { store } from './store.js';
import { esc, fmtDate, ago, $, $$, toast } from './core.js';
import { tr } from './i18n.js';
import { fieldsManager, bindFieldsManager } from './u3.js';

// {n} is where the number of days goes; rules without it have no number.
const RULES = {
  enquiry_unanswered: ['A website enquiry has had no reply for {n} day(s)', 'a task to answer it, for the whole team'],
  client_silent: ['The client has had the ball for {n} days and nobody set “Waiting on”', 'a task to chase, for the account manager'],
  chase_date: ['The chase date set under “Waiting on” arrives', 'a task to chase, for the account manager'],
  booking_confirm: ['A survey, delivery or fitting is {n} day(s) away', 'a task to confirm it with the client and the crew'],
  payment_late: ['A payment is {n} days past its due date', 'a task to remind the client (a person writes the email)'],
};

export async function automationsView(app) {
  document.title = `${tr('Automations')} | CRM`;
  const [rules, runs] = await Promise.all([store.listRules ? store.listRules().catch(() => null) : null, store.ruleRuns ? store.ruleRuns().catch(() => []) : []]);
  const since = Date.now() - 30 * 864e5;
  const count = (id) => runs.filter((x) => x.rule_id === id && new Date(x.created_at).getTime() > since).length;
  const last = (id) => runs.filter((x) => x.rule_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const sentence = (r) => {
    const [when, then] = RULES[r.id] || [r.id, ''];
    const num = `<label class="visually-hidden" for="rule-${esc(r.id)}">${tr('Days')}</label><input class="rule-n" id="rule-${esc(r.id)}" type="number" min="${r.id === 'client_silent' ? 1 : 0}" max="365" step="1" inputmode="numeric" value="${esc(String(r.days))}" data-rule-days="${esc(r.id)}">`;
    const parts = tr(when).split('{n}');
    return `${esc(parts[0])}${parts.length > 1 ? `${num}${esc(parts[1])}` : ''} <span class="rule-arrow" aria-hidden="true">→</span> <strong>${esc(tr(then))}</strong>`;
  };
  app.innerHTML = `<div class="container-wide section-tight" id="automations">
    <div class="dash-head"><div><span class="eyebrow">${tr('Runs every 15 minutes')}</span><h1 class="app-h1">${tr('Automations')}</h1></div>
      ${rules ? `<button type="button" class="btn btn-sm btn-ghost" data-rules-run>${tr('Run now')}</button>` : ''}</div>
    <p class="note mb-m">${tr('Each rule makes a task for a person, once per enquiry, project, booking or payment. Nothing is ever sent to a client by itself.')}</p>
    ${rules === null ? `<p class="callout">${tr('Automations start after the database update (migration 0051).')}</p>` : `
    <ul class="rules">${rules.filter((r) => RULES[r.id]).map((r) => `<li class="rule${r.active ? '' : ' is-off'}" data-rule="${esc(r.id)}">
      <label class="rule-sw"><input type="checkbox" data-rule-on="${esc(r.id)}" ${r.active ? 'checked' : ''}><span class="visually-hidden">${tr('Rule on')}</span></label>
      <p class="rule-t">${sentence(r)}</p>
      <p class="rule-s note">${count(r.id) ? esc(tr('{n} task(s) in the last 30 days', { n: count(r.id) })) : esc(tr('No tasks in the last 30 days'))}${last(r.id) ? ` · <span title="${esc(fmtDate(last(r.id).created_at, true))}">${esc(tr('last {when}', { when: ago(last(r.id).created_at) }))}</span>` : ''}</p>
    </li>`).join('')}</ul>`}
    <section class="ctl mt-l"><h2 class="panel-h">${tr('When a stage starts')}</h2><p class="note">${tr('The tasks each stage gives the account manager are set in the stage playbook.')} <a href="#/playbook">${tr('Open the stage playbook')}</a></p></section>
    ${await fieldsManager()}
  </div>`;
  bindFieldsManager(app, () => automationsView(app));
  $$('[data-rule-on]', app).forEach((c) => c.addEventListener('change', async () => {
    try { await store.saveRule(c.dataset.ruleOn, { active: c.checked }); c.closest('.rule').classList.toggle('is-off', !c.checked); toast(tr(c.checked ? 'Rule switched on.' : 'Rule switched off.'), { tone: 'ok' }); } catch (err) { c.checked = !c.checked; toast(tr(err.message), { tone: 'error' }); }
  }));
  $$('[data-rule-days]', app).forEach((i) => i.addEventListener('change', async () => {
    const d = Number(i.value);
    if (!Number.isInteger(d) || d < Number(i.min) || d > 365) { i.setAttribute('aria-invalid', 'true'); toast(tr('Days must be a whole number from 0 to 365.'), { tone: 'error' }); return; }
    i.removeAttribute('aria-invalid');
    try { await store.saveRule(i.dataset.ruleDays, { days: d }); toast(tr('Saved.'), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  }));
  $('[data-rules-run]', app)?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const n = await store.runRules(); toast(n ? tr('{n} new task(s) made.', { n }) : tr('Nothing new: every rule is up to date.'), { tone: 'ok' }); await automationsView(app); } catch (err) { b.disabled = false; toast(tr(err.message), { tone: 'error' }); }
  });
}
