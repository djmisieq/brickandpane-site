// Mappings for the HubSpot sync. Run: deno test supabase/functions/_shared/hubspot.test.ts
import { deepStrictEqual as eq, ok } from 'node:assert/strict';
import { companyDomain, dealName, materialsOf, mergeMulti, noteBody, placeOf, productsOf, splitName, type Enquiry } from './hubspot.ts';

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
