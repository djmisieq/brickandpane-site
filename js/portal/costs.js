// Costs & margin on a project in the CRM (migration 0031, plan: brickandpane-docs/docs/PLAN-KOSZTY.md).
// STAFF ONLY: imported by admin.js alone, never by the client portal. Supplier and subcontractor quotes in £; the
// margin is the client's sale ex VAT minus the accepted costs.
// 0039 (supplier-mail review 25.11.2026): each supplier prices differently, so a quote is entered as they sent it
// (VAT in or not, a discount, delivery on top, lead time, variant) and compared at one net £ figure; suppliers asked
// and not answered yet sit in the list as "Requested" with the days we have waited.
import { store } from './store.js';
import { esc, fmtMoney, fmtDate, $, $$, toast } from './core.js';
import { tr, LANG } from './i18n.js';
import { netOf } from './cost-net.js';
import { linker, bindLinkers, picked } from './linker.js';

// What the supplier gave: a discount, a lead time. The team's own entries, kept out of i18n.js (audit.spec keeps those
// words off client-facing text; quotes.js does the same).
const t = (en, pl, vars) => (LANG === 'pl' ? pl : en).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');

const HUBSPOT_DEAL = 'https://app-eu1.hubspot.com/contacts/149668825/record/0-3/';
const CATEGORIES = { production: 'Production', transport: 'Transport', installation: 'Installation', other: 'Other' };
const STATUS = { requested: 'Requested', received: 'Received', accepted: 'Accepted', rejected: 'Rejected', superseded: 'Superseded' };
const DAY = 86400000;
const money = (n, cur) => {
  const v = Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === 'PLN' ? `${v} zł` : cur === 'EUR' ? `€${v}` : `£${v}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = (d) => Math.max(0, Math.floor((Date.now() - new Date(`${d}T00:00:00`)) / DAY));

// Reads both; a missing migration or a network hiccup shows the panel empty rather than breaking the project page.
export async function loadCosts(pid) {
  const [costs, margin] = await Promise.all([
    store.listCosts ? store.listCosts(pid).catch(() => null) : null,
    store.projectMargin ? store.projectMargin(pid).catch(() => null) : null,
  ]);
  return { costs, margin };
}

function saleLine(m) {
  if (m?.sale_gbp == null) return `<p class="hint">${tr('No sale yet: send a quote on the deal, or enter the value in Commercial.')}</p>`;
  const src = m.sale_source === 'accepted' ? tr('accepted quote {refs}', { refs: m.sale_refs || '' })
    : m.sale_source === 'sent' ? tr('latest quote sent {refs}', { refs: m.sale_refs || '' }) : tr('Commercial value');
  return `<dl class="cost-sum">
    <div><dt>${tr('Sale (ex VAT)')}</dt><dd>${fmtMoney(m.sale_gbp)} <span class="note">${esc(src)}</span></dd></div>
    <div><dt>${tr('Accepted costs')}</dt><dd>${fmtMoney(m.cost_gbp)}</dd></div>
    <div><dt>${tr('Margin')}</dt><dd><strong>${fmtMoney(m.margin_gbp)}</strong>${m.margin_pct == null ? '' : ` (${esc(String(m.margin_pct))}%)`}</dd></div>
  </dl>`;
}

// How the supplier priced it, when that differs from a plain net £ figure.
function asQuoted(c) {
  const bits = [];
  if (Number(c.vat_in_pct) > 0) bits.push(tr('incl. VAT {n}%', { n: Number(c.vat_in_pct) }));
  if (Number(c.discount_pct) > 0) bits.push(t('{n}% off', 'rabat {n}%', { n: Number(c.discount_pct) }));
  if (Number(c.delivery_gbp) > 0) bits.push(tr('+ delivery {v}', { v: money(c.delivery_gbp, 'GBP') }));
  return bits.length ? `${tr('quoted {v}', { v: money(c.amount, c.currency) })}, ${bits.join(', ')}` : '';
}

// Colour audit 26.11.2026: supplier quote statuses.
const COST_TONE = { requested: 'neutral', received: 'info', accepted: 'ok', rejected: 'neutral', superseded: 'neutral' };
function row(c, best) {
  const net = netOf(c), live = c.status === 'received' || c.status === 'accepted';
  const expired = c.valid_until && c.valid_until < today() && c.status === 'received';
  const vs = live && best != null && best.id !== c.id && best.net > 0 ? net - best.net : null;
  const facts = c.status === 'requested'
    ? [`<strong>${esc(tr('asked {d}, waiting {n} days', { d: fmtDate(c.requested_on || c.created_at), n: daysSince(c.requested_on || c.created_at.slice(0, 10)) }))}</strong>`]
    : [`<strong>${esc(money(net, 'GBP'))}</strong> ${esc(tr('net'))}`, esc(asQuoted(c)),
      c.currency === 'GBP' || Number(c.vat_in_pct) || Number(c.discount_pct) || Number(c.delivery_gbp) ? '' : `${esc(money(c.amount, c.currency))}`,
      c.lead_days != null ? esc(t('{n} days lead time', 'realizacja {n} dni', { n: c.lead_days })) : '',
      c.valid_until ? `<span class="${expired ? 'q-warn' : ''}">${esc(expired ? tr('expired {d}', { d: fmtDate(c.valid_until) }) : tr('valid until {d}', { d: fmtDate(c.valid_until) }))}</span>` : ''];
  const acts = c.status === 'requested'
    ? `<button type="button" class="btn btn-sm" data-cost-price>${tr('Price received')}</button><button type="button" class="btn btn-sm btn-ghost" data-cost-set="rejected">${tr('No reply')}</button>`
    : `${c.status !== 'accepted' ? `<button type="button" class="btn btn-sm btn-ghost" data-cost-set="accepted">${tr('Accept')}</button>` : ''}${c.status !== 'rejected' ? `<button type="button" class="btn btn-sm btn-ghost" data-cost-set="rejected">${tr('Reject')}</button>` : ''}`;
  // Projects audit 26.11.2026: a quote entered on the wrong project moves to the right one.
  const move = `<details class="cost-move"><summary class="btn btn-sm btn-ghost">${tr('Move')}</summary><form class="task-form" data-cost-move novalidate>${linker({ id: `cm-${c.id}`, label: tr('To project'), kinds: ['project'], name: 'project', exclude: [c.project_id] })}<button class="btn btn-sm" type="submit">${tr('Move here')}</button></form></details>`;
  return `<li data-cost="${esc(c.id)}" data-supplier="${esc(c.supplier)}" data-company="${esc(c.company_id || '')}" data-category="${esc(c.category)}"${c.status === 'rejected' || c.status === 'superseded' ? ' class="is-out"' : ''}>
      <div><strong>${c.company_id ? `<a href="#/company/${esc(c.company_id)}">${esc(c.supplier)}</a>` : esc(c.supplier)}</strong>${c.reference ? ` · ${esc(c.reference)}` : ''}${c.variant ? ` · ${esc(c.variant)}` : ''}
        <span class="tag tone-${expired ? 'warn' : COST_TONE[c.status] || 'neutral'}">${esc(tr(STATUS[c.status] || c.status))}</span>
        ${best?.id === c.id ? `<span class="tag tone-ok">↓ ${tr('Lowest')}</span>` : ''}
        ${vs != null ? `<span class="note">+${esc(money(vs, 'GBP'))} (+${esc(String(Math.round((vs / best.net) * 1000) / 10))}%) ${esc(tr('vs lowest'))}</span>` : ''}
        <span class="note">${facts.filter(Boolean).join(' · ')}${c.pdf_name ? ` · ${c.pdf_path ? `<button type="button" class="q-link" data-cost-pdf="${esc(c.pdf_path)}">${esc(c.pdf_name)}</button>` : esc(c.pdf_name)}` : ''}</span>
        ${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}
        ${c.hubspot_deal_id ? `<a class="note" href="${HUBSPOT_DEAL}${encodeURIComponent(c.hubspot_deal_id)}" target="_blank" rel="noopener">${tr('Purchase deal in HubSpot')}</a>` : c.hubspot_error ? `<span class="note q-warn">${tr('Not in HubSpot yet')}: ${esc(c.hubspot_error)}</span>` : ''}</div>
      <div class="cost-acts">${acts}${move}</div>
    </li>`;
}

// One group per category, the priced quotes cheapest first, then those still awaited, then the ones out of the running.
function groups(costs) {
  const order = { accepted: 0, received: 0, requested: 1, rejected: 2, superseded: 2 };
  return Object.keys(CATEGORIES).map((cat) => {
    const list = costs.filter((c) => (CATEGORIES[c.category] ? c.category : 'other') === cat)
      .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || netOf(a) - netOf(b));
    if (!list.length) return '';
    const priced = list.filter((c) => c.status === 'received' || c.status === 'accepted');
    const best = priced.length > 1 ? { id: priced[0].id, net: netOf(priced[0]) } : null;
    return `<h3 class="panel-h cost-cat">${esc(tr(CATEGORIES[cat]))} <span class="note">${esc(tr('{n} quotes', { n: list.length }))}</span></h3>
      <ul class="cost-list">${list.map((c) => row(c, best)).join('')}</ul>`;
  }).join('');
}

const catSelect = (id) => `<select id="${id}" name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select>`;

export function costsPanel({ costs, margin }) {
  if (costs == null) return `<section class="ctl" data-costs><h2 class="panel-h">${tr('Costs & margin')} <span class="tag">${tr('staff only')}</span></h2><p class="hint">${tr('Costs are not available right now.')}</p></section>`;
  return `<section class="ctl" data-costs>
    <h2 class="panel-h">${tr('Costs & margin')} <span class="tag">${tr('staff only')}</span></h2>
    ${saleLine(margin)}
    ${costs.length ? groups(costs) : `<p class="hint">${tr('No supplier quotes yet.')}</p>`}
    <form data-cost-ask class="cost-ask" novalidate>
      <h3 class="panel-h">${tr('Asked a supplier')}</h3>
      <p class="hint">${tr('Note who you asked, so the list shows who has not answered yet.')}</p>
      <div class="field-row">
        ${linker({ id: 'cost-ask-sup', label: tr('Supplier'), kinds: ['company'], textName: 'supplier', name: 'company_id', free: true, create: 'company:supplier', placeholder: tr('Type the supplier…') })}
        <div class="field"><label for="cost-ask-cat">${tr('Category')}</label>${catSelect('cost-ask-cat')}</div>
      </div>
      <button class="btn btn-sm btn-ghost" type="submit">${tr('Add to the list')}</button>
    </form>
    <form data-cost-add novalidate>
      <h3 class="panel-h">${tr('Add supplier quote')}</h3>
      <input type="hidden" name="from" value="">
      ${linker({ id: 'cost-sup', label: tr('Supplier'), kinds: ['company'], textName: 'supplier', name: 'company_id', free: true, create: 'company:supplier', placeholder: tr('Type the supplier…'), hint: tr('Pick the supplier’s company so its quotes show on the company card; a new one is added as a supplier.') })}
      <div class="field-row">
        <div class="field"><label for="cost-ref">${tr('Their quote no.')}</label><input id="cost-ref" name="reference" maxlength="60"></div>
        <div class="field"><label for="cost-cat">${tr('Category')}</label>${catSelect('cost-cat')}</div>
      </div>
      <div class="field"><label for="cost-var">${tr('Variant')}</label><input id="cost-var" name="variant" maxlength="120" placeholder="${esc(tr('e.g. Aluprof MB-86, triple glazed'))}"></div>
      <div class="field-row">
        <div class="field"><label for="cost-amt">${tr('Amount as quoted (£)')}</label><input id="cost-amt" name="amount" type="number" min="0" step="0.01" required></div>
        <div class="field"><label for="cost-vat">${tr('VAT in this amount')}</label><select id="cost-vat" name="vat_in_pct"><option value="0">${tr('No, net')}</option><option value="20">${tr('Yes, 20%')}</option><option value="23">${tr('Yes, 23%')}</option></select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="cost-disc">${t('Discount (%)', 'Rabat (%)')}</label><input id="cost-disc" name="discount_pct" type="number" min="0" max="100" step="0.1"></div>
        <div class="field"><label for="cost-del">${tr('Delivery on top (net, £)')}</label><input id="cost-del" name="delivery_gbp" type="number" min="0" step="0.01"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="cost-lead">${t('Lead time (days)', 'Czas realizacji (dni)')}</label><input id="cost-lead" name="lead_days" type="number" min="0" max="365" step="1"></div>
        <div class="field"><label for="cost-valid">${tr('Valid until')}</label><input id="cost-valid" name="valid_until" type="date"></div>
      </div>
      <p class="hint" data-cost-net></p>
      <div class="field"><label for="cost-pdf">${tr('Quote PDF')}</label><input id="cost-pdf" name="file" type="file" accept="application/pdf"></div>
      <div class="field"><label for="cost-note">${tr('Note')}</label><input id="cost-note" name="note" maxlength="2000"></div>
      <button class="btn btn-sm" type="submit">${tr('Add supplier quote')}</button>
    </form>
  </section>`;
}

const numOr = (v, d) => (v === '' || v == null ? d : Number(v));

export function bindCosts(root, pid) {
  const box = $('[data-costs]', root); if (!box) return;
  const form = $('[data-cost-add]', box), ask = $('[data-cost-ask]', box);
  bindLinkers(box);
  // The supplier's company goes on the quote and, as a supplier, on the project (once).
  const linkSupplier = async (co) => { if (co && store.linkCompany) await store.linkCompany(pid, co.id, 'supplier').catch(() => {}); };
  const fields = () => ({
    amount: numOr(form.amount.value, 0), vat_in_pct: numOr(form.vat_in_pct.value, 0), discount_pct: numOr(form.discount_pct.value, 0),
    delivery_gbp: numOr(form.delivery_gbp.value, 0), lead_days: numOr(form.lead_days.value, null),
  });
  // The comparable net while typing, so the team sees what the comparison will use.
  const preview = () => {
    const f = fields(), out = $('[data-cost-net]', form);
    out.textContent = form.amount.value === '' || (!f.vat_in_pct && !f.discount_pct && !f.delivery_gbp) ? '' : tr('Compared at {v} net.', { v: money(netOf({ ...f, fx_to_gbp: 1 }), 'GBP') });
  };
  form?.addEventListener('input', preview);
  ask?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const supplier = ask.supplier.value.trim();
    if (!supplier) { ask.supplier.focus(); toast(tr('Enter the supplier.')); return; }
    const co = picked(ask, 'company_id');
    try { await store.addCost(pid, { supplier, category: ask.category.value, amount: 0, status: 'requested', requested_on: today(), company_id: co?.id || null }); await linkSupplier(co); ask.reset(); toast(tr('Added. It shows as waiting until the price comes in.')); }
    catch (err) { toast(tr(err.message)); }
  });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const supplier = form.supplier.value.trim(), amount = form.amount.value;
    if (!supplier) { form.supplier.focus(); toast(tr('Enter the supplier.')); return; }
    if (amount === '' || Number(amount) < 0) { form.amount.focus(); toast(tr('Enter the amount.')); return; }
    const f = fields();
    if (f.discount_pct < 0 || f.discount_pct > 100) { form.discount_pct.focus(); toast(t('The discount is a percentage from 0 to 100.', 'Rabat to procent od 0 do 100.')); return; }
    if (f.lead_days != null && (f.lead_days < 0 || f.lead_days > 365 || !Number.isInteger(f.lead_days))) { form.lead_days.focus(); toast(t('The lead time is whole days, up to 365.', 'Czas realizacji to pełne dni, najwyżej 365.')); return; }
    const file = form.file.files[0] || null;
    if (file && file.type !== 'application/pdf') { toast(tr('The quote file must be a PDF.')); return; }
    const co = picked(form, 'company_id');
    const data = { supplier, reference: form.reference.value.trim(), category: form.category.value, variant: form.variant.value.trim(), note: form.note.value.trim(), valid_until: form.valid_until.value || null, ...f, file, company_id: co?.id || null };
    try {
      if (form.from.value) await store.updateCost(form.from.value, pid, { ...data, status: 'received' });
      else await store.addCost(pid, data);
      await linkSupplier(co);
      // Cleared, so the next supplier's quote never inherits this one's VAT, discount or delivery.
      form.reset(); form.from.value = ''; preview();
      toast(tr('Supplier quote added.'));
    } catch (err) { toast(tr(err.message)); }
  });
  // A price came in for a supplier we asked: the form takes over that row instead of adding a second one.
  $$('[data-cost-price]', box).forEach((b) => b.addEventListener('click', () => {
    const li = b.closest('[data-cost]');
    form.from.value = li.dataset.cost; form.supplier.value = li.dataset.supplier; form.category.value = li.dataset.category;
    const h = $('[data-linker-value]', form); if (h) h.value = li.dataset.company || '';
    form.scrollIntoView({ block: 'start', behavior: 'smooth' }); form.amount.focus({ preventScroll: true });
  }));
  $$('[data-cost-move]', box).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const to = picked(f, 'project');
    if (!to) { toast(tr('Choose the project from the list.')); return; }
    try { await store.moveCost(f.closest('[data-cost]').dataset.cost, to.id); toast(tr('Moved to the other project.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-cost-set]', box).forEach((b) => b.addEventListener('click', async () => {
    try { await store.setCostStatus(b.closest('[data-cost]').dataset.cost, b.dataset.costSet); toast(tr('Saved.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-cost-pdf]', box).forEach((b) => b.addEventListener('click', async () => {
    try { const url = await store.costPdfUrl(b.dataset.costPdf); if (url) open(url, '_blank', 'noopener'); } catch (err) { toast(tr(err.message)); }
  }));
}
