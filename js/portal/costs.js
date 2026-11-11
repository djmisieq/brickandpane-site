// Costs & margin on a project in the CRM (migration 0031, plan: brickandpane-docs/docs/PLAN-KOSZTY.md).
// STAFF ONLY: imported by admin.js alone, never by the client portal. Supplier and subcontractor quotes in GBP, PLN or
// EUR with the rate to £ the team types in; the margin is the client's sale ex VAT minus the accepted costs.
import { store } from './store.js';
import { esc, fmtMoney, $, $$, toast } from './core.js';
import { tr } from './i18n.js';

const CATEGORIES = { production: 'Production', transport: 'Transport', installation: 'Installation', other: 'Other' };
const STATUS = { received: 'Received', accepted: 'Accepted', rejected: 'Rejected', superseded: 'Superseded' };
const money = (n, cur) => {
  const v = Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === 'PLN' ? `${v} zł` : cur === 'EUR' ? `€${v}` : `£${v}`;
};

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

export function costsPanel({ costs, margin }) {
  if (costs == null) return `<section class="ctl" data-costs><h2 class="panel-h">${tr('Costs & margin')} <span class="tag">${tr('staff only')}</span></h2><p class="hint">${tr('Costs are not available right now.')}</p></section>`;
  const rows = costs.length ? `<ul class="cost-list">${costs.map((c) => `<li data-cost="${esc(c.id)}">
      <div><strong>${esc(c.supplier)}</strong>${c.reference ? ` · ${esc(c.reference)}` : ''} <span class="tag${c.status === 'accepted' ? ' tag-accent' : ''}">${esc(tr(STATUS[c.status] || c.status))}</span>
        <span class="note">${esc(tr(CATEGORIES[c.category] || c.category))} · ${esc(money(c.amount, c.currency))}${c.currency === 'GBP' ? '' : ` ≈ ${esc(money(c.amount * c.fx_to_gbp, 'GBP'))}`}${c.pdf_name ? ` · ${c.pdf_path ? `<button type="button" class="q-link" data-cost-pdf="${esc(c.pdf_path)}">${esc(c.pdf_name)}</button>` : esc(c.pdf_name)}` : ''}</span>
        ${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</div>
      <div class="cost-acts">${c.status !== 'accepted' ? `<button type="button" class="btn btn-sm btn-ghost" data-cost-set="accepted">${tr('Accept')}</button>` : ''}${c.status !== 'rejected' ? `<button type="button" class="btn btn-sm btn-ghost" data-cost-set="rejected">${tr('Reject')}</button>` : ''}</div>
    </li>`).join('')}</ul>` : `<p class="hint">${tr('No supplier quotes yet.')}</p>`;
  return `<section class="ctl" data-costs>
    <h2 class="panel-h">${tr('Costs & margin')} <span class="tag">${tr('staff only')}</span></h2>
    ${saleLine(margin)}
    ${rows}
    <form data-cost-add novalidate>
      <h3 class="panel-h">${tr('Add supplier quote')}</h3>
      <div class="field"><label for="cost-sup">${tr('Supplier')}</label><input id="cost-sup" name="supplier" maxlength="120" required></div>
      <div class="field-row">
        <div class="field"><label for="cost-ref">${tr('Their quote no.')}</label><input id="cost-ref" name="reference" maxlength="60"></div>
        <div class="field"><label for="cost-cat">${tr('Category')}</label><select id="cost-cat" name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(tr(v))}</option>`).join('')}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="cost-amt">${tr('Amount (net)')}</label><input id="cost-amt" name="amount" type="number" min="0" step="0.01" required></div>
        <div class="field"><label for="cost-cur">${tr('Currency')}</label><select id="cost-cur" name="currency"><option>GBP</option><option>PLN</option><option>EUR</option></select></div>
        <div class="field" data-cost-fx hidden><label for="cost-fx">${tr('Rate to £')}</label><input id="cost-fx" name="fx" type="number" min="0" step="0.000001" placeholder="0.195"></div>
      </div>
      <div class="field"><label for="cost-pdf">${tr('Quote PDF')}</label><input id="cost-pdf" name="file" type="file" accept="application/pdf"></div>
      <div class="field"><label for="cost-note">${tr('Note')}</label><input id="cost-note" name="note" maxlength="2000"></div>
      <button class="btn btn-sm" type="submit">${tr('Add supplier quote')}</button>
    </form>
  </section>`;
}

export function bindCosts(root, pid) {
  const box = $('[data-costs]', root); if (!box) return;
  const form = $('[data-cost-add]', box);
  const fx = $('[data-cost-fx]', box);
  form?.currency.addEventListener('change', () => { fx.hidden = form.currency.value === 'GBP'; });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const supplier = form.supplier.value.trim(), amount = form.amount.value, currency = form.currency.value;
    if (!supplier) { form.supplier.focus(); toast(tr('Enter the supplier.')); return; }
    if (amount === '' || Number(amount) < 0) { form.amount.focus(); toast(tr('Enter the amount.')); return; }
    if (currency !== 'GBP' && !(Number(form.fx.value) > 0)) { form.fx.focus(); toast(tr('Enter the rate to £ for PLN or EUR.')); return; }
    const file = form.file.files[0] || null;
    if (file && file.type !== 'application/pdf') { toast(tr('The quote file must be a PDF.')); return; }
    try {
      await store.addCost(pid, { supplier, reference: form.reference.value.trim(), category: form.category.value, amount, currency, fx: form.fx.value, note: form.note.value.trim(), file });
      toast(tr('Supplier quote added.'));
    } catch (err) { toast(tr(err.message)); }
  });
  $$('[data-cost-set]', box).forEach((b) => b.addEventListener('click', async () => {
    try { await store.setCostStatus(b.closest('[data-cost]').dataset.cost, b.dataset.costSet); toast(tr('Saved.')); } catch (err) { toast(tr(err.message)); }
  }));
  $$('[data-cost-pdf]', box).forEach((b) => b.addEventListener('click', async () => {
    try { const url = await store.costPdfUrl(b.dataset.costPdf); if (url) open(url, '_blank', 'noopener'); } catch (err) { toast(tr(err.message)); }
  }));
}
