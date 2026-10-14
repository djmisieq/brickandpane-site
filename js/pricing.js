// Budget estimator — one rate table for the public tools, the client portal and the CRM.
//
// ⚠ The rates below are EXAMPLE figures for building and testing the feature, not Brick & Pane prices.
// Public pages only show estimates when `enabled` is true. Until the real price list is entered:
//   - the client portal shows estimates in demo mode, labelled "example rates";
//   - any public page shows them with ?preview=pricing in the URL, also labelled.
// All figures are £, excluding VAT, supplied and installed in London.
export const PRICING = {
  enabled: false,
  label: 'Example rates — not Brick & Pane prices',
  vat: 0.2,
  spread: 0.15,          // estimate shown as total ±15%
  systems: {
    'lift-slide': { perM2: 1100, perPanel: 350, minimum: 6500 },
    sliding: { perM2: 820, perPanel: 250, minimum: 4500 },
    bifold: { perM2: 760, perPanel: 290, minimum: 4200 },
    hinged: { perM2: 900, perPanel: 400, minimum: 2800 },
    windows: { perM2: 650, perPanel: 180, minimum: 900 },
  },
  glazing: { d: 1, dl: 1.08, t: 1.12 },   // multiplier on the area rate
  extras: {
    flushThresholdPerM: 180,             // recessed track / flush threshold, per metre of width
    heavyLiftKg: 250, heavyLift: 950,    // mechanical handling / crane allowance per project
    survey: 0,                           // survey included
  },
  panels: { '2A': 2, '2B': 2, '3T': 3, '4C': 4, '6C': 6 },
};

const isPreview = () => {
  try { return new URLSearchParams(location.search).get('preview') === 'pricing'; } catch { return false; }
};
export const pricingVisible = ({ demo = false } = {}) => PRICING.enabled || demo || isPreview();
export const pricingIsExample = () => !PRICING.enabled;

const panelsFor = (o) => {
  if (o.system === 'bifold' && o.config && o.config.includes('+')) return o.config.split('+').reduce((a, b) => a + Number(b), 0);
  return PRICING.panels[o.config] || Math.max(1, Math.round((o.width_mm || 0) / 1000));
};

// One opening: { system, width_mm, height_mm, config, glazing, qty, flush, kg }
export function estimateOpening(o) {
  const r = PRICING.systems[o.system];
  if (!r || !o.width_mm || !o.height_mm) return null;
  const m2 = (o.width_mm * o.height_mm) / 1e6;
  const glazing = PRICING.glazing[o.glazing] || 1;
  let each = m2 * r.perM2 * glazing + panelsFor(o) * r.perPanel;
  if (o.flush) each += (o.width_mm / 1000) * PRICING.extras.flushThresholdPerM;
  each = Math.max(each, r.minimum);
  return { each, total: each * (o.qty || 1) };
}

export function estimateProject(openings, { heavy = false } = {}) {
  const lines = openings.map((o) => ({ o, e: estimateOpening(o) })).filter((x) => x.e);
  if (!lines.length) return null;
  let net = lines.reduce((t, x) => t + x.e.total, 0);
  if (heavy || openings.some((o) => o.kg > PRICING.extras.heavyLiftKg)) net += PRICING.extras.heavyLift;
  net += PRICING.extras.survey;
  const round = (n) => Math.round(n / 100) * 100;
  return { net, low: round(net * (1 - PRICING.spread)), high: round(net * (1 + PRICING.spread)), lines };
}

export const fmtGBP = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;
export const rangeText = (est) => `${fmtGBP(est.low)}–${fmtGBP(est.high)} + VAT`;
