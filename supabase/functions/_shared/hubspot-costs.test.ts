// Costs ↔ HubSpot, pure parts. Run: deno test supabase/functions/_shared/hubspot-costs.test.ts
import { deepStrictEqual as eq } from 'node:assert/strict';
import { costDealName, costFromDeal, costNote, costProperties, PIPELINE, STAGE, stageOf, stageStep, statusOf, type Cost } from './hubspot-costs.ts';

Deno.test('statuses and stages map both ways; Ordered and Delivered read as accepted', () => {
  eq(['received', 'accepted', 'rejected', 'superseded'].map(stageOf), [STAGE.received, STAGE.accepted, STAGE.rejected, STAGE.rejected]);
  eq([STAGE.requested, STAGE.received, STAGE.accepted, STAGE.ordered, STAGE.delivered, STAGE.rejected, 'other', null].map(statusOf),
    ['received', 'received', 'accepted', 'accepted', 'accepted', 'rejected', null, null]);
});

Deno.test('who moved last decides the stage', () => {
  const c = (status: string, hubspot_status: string | null, hubspot_stage: string | null) => ({ status, hubspot_status, hubspot_stage }) as Pick<Cost, 'status' | 'hubspot_status' | 'hubspot_stage'>;
  // The team accepted it in the CRM: push Accepted.
  eq(stageStep(c('accepted', 'received', STAGE.received), STAGE.received), { push: STAGE.accepted });
  // Accepted in the CRM, already Ordered in HubSpot: never pushed back down to Accepted.
  eq(stageStep(c('accepted', 'received', STAGE.received), STAGE.ordered), { seen: STAGE.ordered });
  // Moved to Rejected in HubSpot: pull it.
  eq(stageStep(c('received', 'received', STAGE.received), STAGE.rejected), { pull: 'rejected' });
  // Moved on from Accepted to Delivered in HubSpot: same CRM status, just remember the stage.
  eq(stageStep(c('accepted', 'accepted', STAGE.accepted), STAGE.delivered), { seen: STAGE.delivered });
  // Both moved: the CRM wins.
  eq(stageStep(c('rejected', 'received', STAGE.received), STAGE.accepted), { push: STAGE.rejected });
  // Superseded in the CRM sits on Rejected in HubSpot and is not pulled back to rejected.
  eq(stageStep(c('superseded', 'superseded', STAGE.received), STAGE.rejected), { seen: STAGE.rejected });
  // Nothing moved.
  eq(stageStep(c('received', 'received', STAGE.received), STAGE.received), null);
});

Deno.test('the purchase deal carries the supplier net in its own currency', () => {
  const cost = { id: 'c1', supplier: 'Okna Polska', reference: 'OP/114', category: 'production', amount: '40000.00', currency: 'PLN', fx_to_gbp: '0.195000', note: '' } as unknown as Cost;
  eq(costDealName(cost, 'BP-2026-0004'), 'Okna Polska · OP/114 · BP-2026-0004');
  eq(costProperties(cost, 'BP-2026-0004'), {
    dealname: 'Okna Polska · OP/114 · BP-2026-0004', pipeline: PIPELINE, amount: '40000.00', bp_cost_currency: 'PLN',
    bp_cost_fx_to_gbp: '0.195', bp_cost_category: 'production', bp_supplier_quote_ref: 'OP/114', bp_portal_supplier_quote_id: 'c1',
  });
  const note = costNote(cost, 'BP-2026-0004', null);
  eq(note.startsWith('<p><strong>Portal supplier quote · BP-2026-0004 · Okna Polska · OP/114</strong></p>'), true);
  eq(note.includes('Net 40000.00 PLN (rate to GBP 0.195)'), true);
  eq(note.includes('never shown to the client'), true);
});

Deno.test('a Purchasing deal made in HubSpot becomes a supplier quote; a missing rate is flagged', () => {
  eq(costFromDeal({ dealname: 'Glass for E5', amount: '1200', bp_cost_currency: 'GBP', bp_cost_fx_to_gbp: null, bp_cost_category: 'production', bp_supplier_quote_ref: 'W-9' }, 'Whitesales'),
    { supplier: 'Whitesales', reference: 'W-9', category: 'production', amount: 1200, currency: 'GBP', fx_to_gbp: 1, note: 'From HubSpot deal “Glass for E5”.' });
  const eur = costFromDeal({ dealname: 'Frames', amount: '', bp_cost_currency: 'EUR', bp_cost_fx_to_gbp: '', bp_cost_category: 'weird', bp_supplier_quote_ref: null }, null);
  eq([eur.supplier, eur.amount, eur.currency, eur.fx_to_gbp, eur.category], ['Frames', 0, 'EUR', 1, 'other']);
  eq(eur.note.includes('Rate to £ missing'), true);
});
