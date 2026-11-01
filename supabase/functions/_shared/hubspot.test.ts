// Mappings for the HubSpot sync. Run: deno test supabase/functions/_shared/hubspot.test.ts
import { deepStrictEqual as eq, ok } from 'node:assert/strict';
import { attributionOf, companyDomain, dealForProject, dealName, isTestEnquiry, materialsOf, mergeMulti, noteBody, pickOpenDeal, placeOf, productsOf, retryDue, splitName, type Enquiry } from './hubspot.ts';

Deno.test('systems and openings map to product interest and deal type, without duplicates', () => {
  eq(productsOf(['lift-slide', 'windows'], [{ system: 'bifold' }, { system: 'hinged' }]), {
    interest: ['sliding_bi_fold_doors', 'windows', 'doors'],
    type: ['Sliding & bi-fold', 'Windows', 'Doors'],
  });
  eq(productsOf(['rooflights', 'facades', 'unsure', 'junk'], null), {
    interest: ['roof_glazing_rooflights', 'facades_curtain_walling', 'other'],
    type: ['Roof glazing', 'Facades & curtain walling', 'Other'],
  });
  eq(productsOf(null, null), { interest: [], type: [] });
});

Deno.test('materials map to bp_material values', () => {
  eq(materialsOf(['alutimber', 'unsure'], [{ material: 'alu' }, { material: '' }]), ['Aluminium', 'Timber']);
  eq(materialsOf(['pvc'], []), ['PVC']);
  eq(materialsOf(['unsure'], []), []);
});

Deno.test('multi-select values merge as a union', () => {
  eq(mergeMulti('windows;doors', ['doors', 'other']), 'windows;doors;other');
  eq(mergeMulti(null, ['windows']), 'windows');
  eq(mergeMulti('', []), '');
});

Deno.test('name, location and company domain', () => {
  eq(splitName('  Anna  Maria Kowalska '), { firstname: 'Anna', lastname: 'Maria Kowalska' });
  eq(splitName('Cher'), { firstname: 'Cher', lastname: '' });
  eq(placeOf('N1 7GU'), { zip: 'N1 7GU' });
  eq(placeOf('sw1a1aa'), { zip: 'sw1a1aa' });
  eq(placeOf('E8'), { zip: 'E8' });
  eq(placeOf('Hackney, London'), { city: 'Hackney, London' });
  eq(placeOf(null), {});
  eq(companyDomain('a@Studio-Arch.co.uk'), 'studio-arch.co.uk');
  for (const free of ['gmail.com', 'hotmail.co.uk', 'yahoo.co.uk', 'me.com', 'proton.me', 'btinternet.com']) eq(companyDomain(`a@${free}`), null);
});

Deno.test('deal name and note body', () => {
  eq(dealName({ ref: 'BP-261030-AB12', company: '', name: 'Anna', location: null }), 'BP-261030-AB12 · Anna');
  eq(dealName({ ref: 'BP-1', company: 'Studio', name: 'Anna', location: 'E8' }), 'BP-1 · Studio · E8');
  const body = noteBody({
    ref: 'BP-1', role: 'architect', topic: 'quote', location: 'E8', riba_stage: '4', building: null, units: null, start: null,
    openings: [{ system: 'sliding', material: 'alu', width_mm: 4000, height_mm: 2400, qty: 2, note: '<b>rear</b>' }],
    message: 'Line 1\nLine "2"', files: ['x/secret-name.pdf'], files_link: 'https://example.com/f', consent_at: '2026-10-30T10:00:00Z',
  } as Enquiry);
  ok(body.includes('&lt;b&gt;rear&lt;/b&gt;') && !body.includes('<b>rear'));
  ok(body.includes('Line 1<br>Line &quot;2&quot;'));
  ok(body.includes('4000 × 2400') && body.includes('Files uploaded: 1'));
  ok(!body.includes('secret-name'), 'file names stay out of HubSpot');
  ok(body.includes('https://brickandpane.co.uk/admin.html'));
});

Deno.test('an open deal without a ref from the last 14 days is reused, newest first', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const deal = (id: string, createdate: string, extra: Record<string, string | null> = {}) => ({ id, properties: { createdate, hs_is_closed: 'false', bp_enquiry_ref: null, ...extra } });
  eq(pickOpenDeal([deal('1', '2026-10-25T00:00:00Z'), deal('2', '2026-10-30T00:00:00Z')], now)?.id, '2');
  eq(pickOpenDeal([deal('1', '2026-10-01T00:00:00Z')], now), null, 'older than 14 days');
  eq(pickOpenDeal([deal('1', '2026-10-30T00:00:00Z', { hs_is_closed: 'true' })], now), null, 'closed');
  eq(pickOpenDeal([deal('1', '2026-10-30T00:00:00Z', { bp_enquiry_ref: 'BP-261020-AAAA' })], now), null, 'another enquiry');
  eq(pickOpenDeal([], now), null);
});

Deno.test('retry backoff: 15, 30, 60, 120 min, at most 5 attempts', () => {
  const at = (min: number) => new Date(Date.parse('2026-11-01T12:00:00Z') - min * 60e3).toISOString();
  const now = Date.parse('2026-11-01T12:00:00Z');
  const row = (attempts: number, minutesAgo: number) => ({ created_at: at(600), hubspot_attempts: attempts, hubspot_attempted_at: attempts ? at(minutesAgo) : null });
  eq(retryDue(row(1, 14), now), false);
  eq(retryDue(row(1, 15), now), true);
  eq(retryDue(row(2, 29), now), false);
  eq(retryDue(row(3, 60), now), true);
  eq(retryDue(row(4, 119), now), false);
  eq(retryDue(row(4, 120), now), true);
  eq(retryDue(row(5, 9999), now), false);
  eq(retryDue({ created_at: at(5), hubspot_attempts: 0, hubspot_attempted_at: null }, now), false, 'fresh row: the form may still be syncing');
  eq(retryDue({ created_at: at(10), hubspot_attempts: 0, hubspot_attempted_at: null }, now), true);
});

Deno.test('test enquiries are recognised by name or company', () => {
  eq(isTestEnquiry({ name: 'TEST HubSpot sync' }), true);
  eq(isTestEnquiry({ name: 'Anna', company: 'TEST Studio' }), true);
  eq(isTestEnquiry({ name: 'Daniel Zadroga (TEST)' }), true);
  eq(isTestEnquiry({ name: 'Testa Rossa' }), false);
  eq(isTestEnquiry({ name: 'Anna', company: null }), false);
});

Deno.test('attribution goes to the deal under bp_ names', () => {
  eq(attributionOf({ utm_source: 'test', utm_medium: 'email', utm_campaign: 'x', landing_page: '/windows.html?utm_source=test' }),
    { bp_utm_source: 'test', bp_utm_medium: 'email', bp_utm_campaign: 'x', bp_landing_page: '/windows.html?utm_source=test' });
});

Deno.test('a project links to the newest open deal for its enquiry, never to another enquiry deal', () => {
  const d = (id: string, createdate: string, more: Record<string, string> = {}) => ({ id, properties: { createdate, hs_is_closed: 'false', ...more } });
  eq(dealForProject([d('1', '2026-10-01'), d('2', '2026-10-20'), d('3', '2026-10-25', { hs_is_closed: 'true' })], 'BP-1')?.id, '2');
  eq(dealForProject([d('1', '2026-10-01', { bp_enquiry_ref: 'BP-1' }), d('2', '2026-10-20', { bp_enquiry_ref: 'BP-2' })], 'BP-1')?.id, '1');
  eq(dealForProject([d('2', '2026-10-20', { bp_enquiry_ref: 'BP-2' })], 'BP-1'), null);
});
