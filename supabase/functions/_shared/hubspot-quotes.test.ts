// Quotes ↔ HubSpot, pure parts. Run: deno test supabase/functions/_shared/hubspot-quotes.test.ts
import { deepStrictEqual as eq, ok } from 'node:assert/strict';
import { contactCard, dealSource, isTestDeal, noteTitle, pdfName, quoteNote, sortDeals, stageAfterSend, statusesFromStage, stripHtml, type Send } from './hubspot-quotes.ts';
import { STAGE_OF_DEAL } from './hubspot.ts';
import { ACCEPTED_STAGES, DEAL_STAGE_LABEL } from './hubspot-quotes.ts';

const q = (id: string, status: string, status_source: string | null = 'crm') => ({ id, status, status_source });

Deno.test('the pipeline labels cover every stage the portal knows', () => {
  eq(Object.keys(DEAL_STAGE_LABEL).sort(), Object.keys(STAGE_OF_DEAL).sort());
  for (const s of ACCEPTED_STAGES) ok(s in STAGE_OF_DEAL);
});

Deno.test('sending moves only a deal still at Enquiry, and only to Quote sent', () => {
  eq(stageAfterSend('appointmentscheduled'), 'presentationscheduled');
  eq(stageAfterSend('presentationscheduled'), null);
  eq(stageAfterSend('decisionmakerboughtin'), null); // a revision during negotiation keeps the stage
  eq(stageAfterSend('6335558846'), null);
  eq(stageAfterSend(null), null);
});

Deno.test('one live quote on an accepted deal is the accepted one; a lost deal declines them all', () => {
  eq(statusesFromStage('6335558846', [q('a', 'sent'), q('d', 'draft')]), { updates: [{ id: 'a', status: 'accepted' }], choose: false });
  eq(statusesFromStage('closedwon', [q('a', 'sent')]).updates, [{ id: 'a', status: 'accepted' }]);
  eq(statusesFromStage('closedlost', [q('a', 'sent'), q('b', 'sent'), q('d', 'draft')]).updates, [{ id: 'a', status: 'declined' }, { id: 'b', status: 'declined' }]);
  eq(statusesFromStage('presentationscheduled', [q('a', 'sent')]).updates, []);
});

Deno.test('two independent quotes on an accepted deal: HubSpot cannot tell, staff choose', () => {
  eq(statusesFromStage('6334870758', [q('a', 'sent'), q('b', 'sent')]), { updates: [], choose: true });
  // Once staff mark the winner in the CRM, HubSpot leaves every quote on that deal alone.
  eq(statusesFromStage('6334870758', [q('a', 'accepted', 'crm'), q('b', 'sent')]), { updates: [], choose: false });
  // Staff declined one of the two: the other is the accepted one.
  eq(statusesFromStage('6335558846', [q('a', 'declined', 'crm'), q('b', 'sent')]).updates, [{ id: 'b', status: 'accepted' }]);
});

Deno.test('statuses from HubSpot follow the deal back; statuses set in the CRM stay', () => {
  eq(statusesFromStage('decisionmakerboughtin', [q('a', 'declined', 'hubspot'), q('b', 'accepted', 'hubspot')]).updates,
    [{ id: 'a', status: 'sent' }, { id: 'b', status: 'sent' }]);
  eq(statusesFromStage('decisionmakerboughtin', [q('a', 'declined', 'crm')]).updates, []);
  eq(statusesFromStage('closedlost', [q('a', 'accepted', 'crm')]).updates, []);
});

const send = (over: Partial<Send> = {}): Send => ({
  id: 's1', quote_id: '0b0c5a6e-0000-4000-8000-000000000001', hubspot_deal_id: '123', reference: 'BP-2026-004', revision: '01', kind: 'revision',
  total: '12345.5', vat_rate: '20', pdf_path: 'x/y.pdf', pdf_name: 'y.pdf', sent_on: '2026-11-09', created_at: '2026-11-09T10:00:00Z',
  snapshot: { installMode: 'included', validUntil: '2026-12-09', products: [{ qty: 2 }, { qty: 1 }] }, sent_by: null, hubspot_file_id: null, hubspot_note_id: null, ...over,
});

Deno.test('the note starts with the fixed prefix and carries reference, revision and total', () => {
  eq(noteTitle(send()), 'Portal quote sent · BP-2026-004 rev 01');
  eq(noteTitle(send({ revision: '' })), 'Portal quote sent · BP-2026-004 rev 00');
  const html = quoteNote(send(), { previous: { revision: '00', sent_on: '2026-11-03' }, who: 'Daniel <x>', pdf: 'Brick-and-Pane-BP-2026-004-rev01.pdf', others: ['BP-2026-003 (sent)'] });
  ok(html.startsWith('<p><strong>Portal quote sent · BP-2026-004 rev 01</strong></p>'));
  ok(html.includes('replacing revision 00 sent on 3 November 2026'));
  ok(html.includes('£12,345.50</strong> including VAT 20%'));
  ok(html.includes('Supply and installation · 3 units · valid until 9 December 2026'));
  ok(html.includes('by Daniel &lt;x&gt;'));
  ok(html.includes('Other quotes on this deal: BP-2026-003 (sent).'));
  ok(html.includes('#/quotes/0b0c5a6e-0000-4000-8000-000000000001'));
});

Deno.test('new, resend, no VAT and no PDF read plainly', () => {
  const n = quoteNote(send({ kind: 'new', revision: '00', vat_rate: 0, snapshot: { products: [{ qty: 1 }] } }));
  ok(n.includes('New quote BP-2026-004.'));
  ok(n.includes('(no VAT charged)'));
  ok(n.includes('Supply only · 1 unit'));
  ok(n.includes('could not be attached'));
  ok(quoteNote(send({ kind: 'resend' }), { pdf: 'a.pdf' }).includes('sent again (no changes)'));
});

Deno.test('the PDF name is safe for HubSpot', () => {
  eq(pdfName(send()), 'Brick-and-Pane-BP-2026-004-rev01.pdf');
  eq(pdfName(send({ reference: 'BP 2026/7', revision: 'A' })), 'Brick-and-Pane-BP-2026-7-revA.pdf');
});

Deno.test('deal cards: where the deal came from, and test deals', () => {
  eq(['website_form', 'cold_email', 'email', 'referral', '', null, undefined].map(dealSource), ['website', 'cold', 'email', 'other', null, null, null]);
  eq(['Okna (TEST) – test ofert portalu', 'TEST Jo', 'BP-261111-E786 · Portal Notes (TEST) · Hackney E5', 'Testing Ltd – enquiry', 'Contest windows'].map(isTestDeal), [true, true, true, false, false]);
});

Deno.test('deal cards: contact details and order', () => {
  eq(contactCard({ firstname: 'Jo', lastname: 'Bennett', email: 'jo@x.com', phone: null, mobilephone: '07700', company: null, address: '12 Orford Road', city: 'London', zip: 'E17 9NJ' }),
    { name: 'Jo Bennett', email: 'jo@x.com', phone: '07700', company: '', address: '12 Orford Road\nLondon', postcode: 'E17 9NJ' });
  const d = sortDeals([{ id: 'old', closed: false, created: '2026-01-01' }, { id: 'won', closed: true, created: '2026-11-01' }, { id: 'new', closed: false, created: '2026-11-02' }]);
  eq(d.map((x) => x.id), ['new', 'old', 'won']);
  // A test deal goes below the real open ones, even when it is newer.
  eq(sortDeals([{ id: 'test', closed: false, created: '2026-11-11', test: true }, { id: 'real', closed: false, created: '2026-11-01' }]).map((x) => x.id), ['real', 'test']);
  eq(stripHtml('<p><strong>Quote</strong>&nbsp;sent &amp; signed</p>'), 'Quote sent & signed');
});
