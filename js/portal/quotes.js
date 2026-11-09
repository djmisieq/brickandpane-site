// Quote builder for staff (admin.html#/quotes, 06.11.2026): a copy of the team's offer desk built in Grok
// (wind-jolly-fern-cobalt.grok.me). Five steps — client, products, installation, terms — and the printable estimate.
// Quotes and the firm details shared by all quotes live in Supabase (migration 0025, staff only); in demo mode they
// stay in this browser. The team prints the estimate (or saves it as PDF) and emails it; then "Send to the client"
// records that send with the PDF and copies it to the quote's HubSpot deal (migration 0026, function hubspot-quotes):
// a note with the total and the PDF, and Enquiry → Quote sent. The deal is picked in the Client step; its stage sets
// the quote's status (accepted / declined). One deal may carry several quotes; each quote keeps its revisions.
// The estimate is a priced document whose amounts, discount and lead time the team types in itself, so
// tests/audit.spec.js lets this file (and only this file) use those words.
import { store } from './store.js';
import { esc, $$, toast } from './core.js';
import { LANG } from './i18n.js';

const t = (en, pl) => (LANG === 'pl' ? pl : en);

// ---------- fixed data (same as the Grok desk) ----------
const FIRM = { name: 'Brick & Pane', email: 'contact@brickandpane.co.uk', phone: '+44 7575 626 775', web: 'brickandpane.co.uk' };
const FIRM_DEFAULT = { preparedBy: '', replyEmail: FIRM.email, phone: FIRM.phone, accountName: '', bankName: '', sortCode: '', accountNumber: '', legalEntity: '', companyNo: '', vatNo: '', vatRegistered: false };
const FRAMES = [
  { id: 'aluminium', en: 'Aluminium', pl: 'Aluminium' },
  { id: 'timber', en: 'Timber', pl: 'Drewno' },
  { id: 'pvc', en: 'PVC', pl: 'PVC' },
  { id: 'timber-alu', en: 'Timber-aluminium', pl: 'Drewno z aluminium na zewnątrz' },
];
const GROUPS = [
  { id: 'windows', en: 'Windows', pl: 'Okna' },
  { id: 'doors', en: 'Doors', pl: 'Drzwi' },
  { id: 'sliding', en: 'Sliding and folding', pl: 'Przesuwne i składane' },
  { id: 'facades', en: 'Facades and roof glazing', pl: 'Fasady i dach' },
];
const KINDS = [
  { id: 'casement', group: 'windows', en: 'Casement', pl: 'Rozwierne' },
  { id: 'tilt', group: 'windows', en: 'Tilt and turn', pl: 'Uchylno-rozwierne' },
  { id: 'sash', group: 'windows', en: 'Sliding sash', pl: 'Skrzynkowe' },
  { id: 'steellook', group: 'windows', en: 'Steel-look', pl: 'W stylu stali' },
  { id: 'fixed', group: 'windows', en: 'Fixed', pl: 'Stałe' },
  { id: 'loft', group: 'windows', en: 'Loft screen', pl: 'Przegroda loftowa' },
  { id: 'entrance', group: 'doors', en: 'Entrance door', pl: 'Drzwi wejściowe' },
  { id: 'french', group: 'doors', en: 'French doors', pl: 'Drzwi francuskie' },
  { id: 'garden', group: 'doors', en: 'Garden door', pl: 'Drzwi ogrodowe' },
  { id: 'side', group: 'doors', en: 'Side door', pl: 'Drzwi boczne' },
  { id: 'liftslide', group: 'sliding', en: 'Lift and slide', pl: 'Unoszono-przesuwne' },
  { id: 'slimslide', group: 'sliding', en: 'Slim sliding', pl: 'Wąskie przesuwne' },
  { id: 'bifold', group: 'sliding', en: 'Bi-fold', pl: 'Harmonijkowe' },
  { id: 'lantern', group: 'facades', en: 'Roof lantern', pl: 'Świetlik dachowy' },
  { id: 'rooflight', group: 'facades', en: 'Flat rooflight', pl: 'Płaskie okno dachowe' },
  { id: 'curtain', group: 'facades', en: 'Curtain wall', pl: 'Ściana kurtynowa' },
  { id: 'gable', group: 'facades', en: 'Glazed gable', pl: 'Przeszklony szczyt' },
  { id: 'shopfront', group: 'facades', en: 'Shopfront', pl: 'Witryna' },
];
const SPEC = [
  { key: 'material', en: 'Species or note', pl: 'Gatunek lub dopisek' },
  { key: 'opening', en: 'Opening', pl: 'Otwieranie' },
  { key: 'finish', en: 'Finish', pl: 'Wykończenie' },
  { key: 'glazing', en: 'Glazing', pl: 'Szklenie' },
  { key: 'bars', en: 'Bars and panels', pl: 'Szprosy i panele' },
  { key: 'hardware', en: 'Hardware', pl: 'Okucia' },
  { key: 'vents', en: 'Vents', pl: 'Nawiewniki' },
  { key: 'cill', en: 'Cill and trims', pl: 'Parapet i listwy' },
  { key: 'performance', en: 'Performance', pl: 'Parametry' },
  { key: 'security', en: 'Security', pl: 'Bezpieczeństwo' },
];
const INSTALL_KEYS = ['windows', 'rooflights', 'screens', 'protection', 'removal', 'boards', 'access', 'other'];
const INSTALL = {
  windows: { en: 'Install windows, doors and glazing', pl: 'Montaż okien, drzwi i przeszkleń', hintEn: 'Including sliders and facade elements. Fixings and perimeter sealing.', hintPl: 'Także przesuwne i elementy fasady. Mocowania i uszczelnienie obwodu.' },
  rooflights: { en: 'Roof lanterns and rooflights', pl: 'Świetliki i okna dachowe', hintEn: 'Fitted to upstands prepared by others.', hintPl: 'Na podstawach przygotowanych przez innych.' },
  screens: { en: 'Internal screens and doors', pl: 'Przegrody i drzwi wewnętrzne', hintEn: 'Fixed with suitable brackets and screws.', hintPl: 'Mocowanie na kotwach i wkrętach.' },
  protection: { en: 'Property protection', pl: 'Zabezpieczenie wnętrza', hintEn: 'Floors and the immediate work area.', hintPl: 'Podłogi i bezpośrednie miejsce pracy.' },
  removal: { en: 'Removal and disposal', pl: 'Demontaż i utylizacja', hintEn: 'Existing windows, doors and trims on this visit.', hintPl: 'Istniejące okna, drzwi i opaski z tej wizyty.' },
  boards: { en: 'Boards, architraves and making good', pl: 'Parapety, opaski i uzupełnienia', hintEn: 'Only the agreed extent.', hintPl: 'Tylko uzgodniony zakres.' },
  access: { en: 'Access, lifting and parking', pl: 'Wniesienie i parking', hintEn: 'Allowances stated for this site.', hintPl: 'Koszty dostępu uzgodnione dla tej budowy.' },
  other: { en: 'Other works or certification', pl: 'Inne prace lub certyfikat', hintEn: 'Only what is described on this line.', hintPl: 'Tylko to, co opisano przy tej pozycji.' },
};
const PAY = {
  deposit: { en: 'Deposit', pl: 'Zaliczka', triggerEn: 'On acceptance of this quote', triggerPl: 'Po akceptacji tej oferty' },
  interim: { en: 'On delivery', pl: 'Przy dostawie', triggerEn: 'When the order is delivered to site', triggerPl: 'Gdy zamówienie jest na budowie' },
  balance: { en: 'Balance', pl: 'Reszta', triggerEn: 'After installation, or with delivery if supply only', triggerPl: 'Po montażu, a przy samej dostawie razem z dostawą' },
};
const STEPS = [
  { id: 'client', en: 'Client', pl: 'Klient' },
  { id: 'products', en: 'Products', pl: 'Produkty' },
  { id: 'install', en: 'Installation', pl: 'Montaż' },
  { id: 'terms', en: 'Terms', pl: 'Warunki' },
  { id: 'offer', en: 'Quote', pl: 'Oferta' },
];

// ---------- calculations (same rules as the Grok desk) ----------
const uid = () => crypto.randomUUID();
const r2 = (n) => (Number.isFinite(n) ? Math.round((n + 2 ** -52) * 100) / 100 : 0);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y || 2026, (m || 1) - 1, d || 1); x.setDate(x.getDate() + n); return ymd(x); };
const longDate = (s, lang) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return !y || !m || !d ? s : new Date(y, m - 1, d).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};
const money = (n, lang) => new Intl.NumberFormat(lang === 'pl' ? 'pl-PL' : 'en-GB', { style: 'currency', currency: 'GBP' }).format(r2(n));
const size = (w, h, lang) => {
  const f = (v) => { const s = String(v ?? '').trim(); if (!s) return ''; const n = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? new Intl.NumberFormat(lang === 'pl' ? 'pl-PL' : 'en-GB', { maximumFractionDigits: 1 }).format(n) : s; };
  const a = f(w), b = f(h);
  return a && b ? `${a} × ${b} mm` : a ? `${a} mm` : b ? `${b} mm` : '';
};
const named = (list, id, lang) => { const x = list.find((i) => i.id === id); return x ? x[lang === 'pl' ? 'pl' : 'en'] : id; };
const audienceName = (a, lang) => ({ home: { en: 'For the home', pl: 'Dom' }, architect: { en: 'Specifier quote', pl: 'Dla projektanta' }, developer: { en: 'Package quote', pl: 'Dla budowy' } }[a] || { en: '', pl: '' })[lang === 'pl' ? 'pl' : 'en'];
const specRows = (p, lang) => SPEC.flatMap((s) => { const v = String(p[s.key] ?? '').trim(); return v ? [{ label: lang === 'pl' ? s.pl : s.en, value: v }] : []; });
const itemTitle = (p, lang) => p.system.trim() || named(KINDS, p.kind, lang);
const stageName = (s, lang) => (s.label.trim() ? s.label.trim() : s.key === 'custom' ? (lang === 'pl' ? 'Etap' : 'Stage') : PAY[s.key][lang === 'pl' ? 'pl' : 'en']);
const stageWhen = (s, lang) => (s.trigger.trim() ? s.trigger.trim() : s.key === 'custom' ? '' : lang === 'pl' ? PAY[s.key].triggerPl : PAY[s.key].triggerEn);

const newProduct = () => ({ id: uid(), kind: 'casement', frame: 'aluminium', location: '', system: '', material: '', opening: '', finish: '', glazing: '', bars: '', hardware: '', vents: '', cill: '', performance: '', security: '', widthMm: '', heightMm: '', drawingRef: '', qty: 1, unitPrice: 0, notes: '', showSpec: false });
const newInstallLines = () => INSTALL_KEYS.map((key) => ({ key, included: key === 'windows', detail: '', amount: 0 }));
const newPayments = () => [
  { id: uid(), key: 'deposit', percent: 40, label: '', trigger: '' },
  { id: uid(), key: 'interim', percent: 50, label: '', trigger: '' },
  { id: uid(), key: 'balance', percent: 10, label: '', trigger: '' },
];
function nextRef(all) {
  const y = new Date().getFullYear(); const re = new RegExp(`^BP-${y}-(\\d+)$`); let n = 0;
  for (const q of all) { const m = String(q.reference || '').match(re); if (m) n = Math.max(n, Number(m[1])); }
  return `BP-${y}-${String(n + 1).padStart(3, '0')}`;
}
function newQuote(all, f) {
  const d = today();
  return {
    id: uid(), reference: nextRef(all), revision: '00', date: d, validUntil: addDays(d, 30),
    customerName: '', billingAddress: '', email: '', phone: '', siteAddress: '', postcode: '', sameAddress: true,
    audience: 'home', preparedBy: f.preparedBy, leadTime: '', guarantee: '', projectNotes: '', internalNote: '',
    discount: 0, surveyDelivery: 0, vatRate: f.vatRegistered ? 20 : 0, products: [], installMode: 'none',
    installLines: newInstallLines(), siteNotes: '', exclusions: '', programme: '', certification: '',
    payments: newPayments(), paymentOnGross: true, docLang: 'en', termsNote: '', updatedAt: Date.now(),
  };
}
function sampleQuote(all, f) {
  const q = newQuote(all, f);
  const a = { ...newProduct(), kind: 'liftslide', location: 'Rear extension', system: 'Lift and slide', glazing: 'Double glazed, warm-edge spacer', widthMm: '4200', heightMm: '2400', unitPrice: 8900, showSpec: true };
  const b = { ...newProduct(), kind: 'lantern', location: 'Kitchen roof', system: 'Roof lantern', widthMm: '2000', heightMm: '1500', unitPrice: 2400 };
  const c = { ...newProduct(), kind: 'sash', frame: 'timber', location: 'Front elevation', system: 'Sliding sash', material: 'Accoya', finish: 'Paint, off-white, both faces', widthMm: '920', heightMm: '1450', qty: 2, unitPrice: 1860, showSpec: true };
  return {
    ...q, customerName: 'Hannah Clarke', billingAddress: '42 Lantern Mews\nLondon', siteAddress: '42 Lantern Mews\nLondon', postcode: 'E8 3AA',
    email: 'hannah@example.com', phone: '07700 900123', leadTime: '10–12 weeks from the drawings you sign',
    guarantee: 'As stated for each system, with the care notes',
    projectNotes: 'The system named on each line is the system we make. Colours are confirmed on the survey drawings.',
    installMode: 'included',
    installLines: newInstallLines().map((l) => (l.key === 'windows' ? { ...l, included: true, amount: 1600 } : l.key === 'rooflights' ? { ...l, included: true, amount: 480 } : { ...l, included: false })),
    siteNotes: 'Please move furniture away from the openings before we arrive.', programme: 'One visit, two days, after the frames are on site',
    products: [a, b, c],
  };
}
function totals(q) {
  const productNet = r2(q.products.reduce((s, p) => s + r2(p.qty * p.unitPrice), 0));
  const discount = r2(q.discount), survey = r2(q.surveyDelivery);
  const installNet = q.installMode === 'none' ? 0 : r2(q.installLines.filter((l) => l.included).reduce((s, l) => s + r2(l.amount), 0));
  const net = r2(productNet - discount + survey + (q.installMode === 'included' ? installNet : 0));
  const vat = r2((net * q.vatRate) / 100), installVat = r2((installNet * q.vatRate) / 100);
  return { productNet, discount, survey, installNet, net, vat, gross: r2(net + vat), installVat, installGross: r2(installNet + installVat), units: q.products.reduce((s, p) => s + (Number(p.qty) || 0), 0) };
}
const paySum = (q) => r2(q.payments.reduce((s, p) => s + (Number(p.percent) || 0), 0));
const payOk = (q) => Math.abs(paySum(q) - 100) < 0.05;
function payAmounts(stages, base, exact) {
  const out = stages.map((s) => r2((base * (Number(s.percent) || 0)) / 100));
  if (!exact || !out.length) return out;
  out[out.length - 1] = r2(out[out.length - 1] + r2(base - out.reduce((a, b) => a + b, 0))); // pennies go to the last stage
  return out;
}
const units = (n, lang) => {
  if (lang === 'pl') { if (n === 1) return '1 element'; const a = n % 10, b = n % 100; return a >= 2 && a <= 4 && (b < 12 || b > 14) ? `${n} elementy` : `${n} elementów`; }
  return n === 1 ? '1 unit' : `${n} units`;
};
const scopeName = (q, lang) => (lang === 'pl'
  ? { included: 'Dostawa i montaż', separate: 'Dostawa, montaż osobno' }[q.installMode] || 'Tylko dostawa'
  : { included: 'Supply and installation', separate: 'Supply, installation separate' }[q.installMode] || 'Supply only');
const scopeShort = (q) => ({ included: t('With installation', 'Z montażem'), separate: t('Installation separate', 'Montaż osobno') }[q.installMode] || t('Supply only', 'Tylko dostawa'));
function intro(q, tot) {
  const pl = q.docLang === 'pl';
  const place = (q.sameAddress ? q.billingAddress : q.siteAddress).split('\n').map((s) => s.trim()).find(Boolean) || (pl ? 'wskazaną nieruchomość' : 'the property below');
  if (tot.units === 0) return pl ? `Okna, drzwi i przeszklenia na zamówienie — ${place}.` : `Made-to-order windows, doors and glazing for ${place}.`;
  const u = units(tot.units, q.docLang);
  if (pl) return q.installMode === 'included' ? `Dostawa i montaż ${u} na zamówienie — ${place}.` : q.installMode === 'separate' ? `Dostawa ${u} na zamówienie — ${place}. Montaż jest wyceniony osobno, pod spodem.` : `Dostawa ${u} na zamówienie — ${place}.`;
  return q.installMode === 'included' ? `Supply and installation of ${u}, made to order, for ${place}.` : q.installMode === 'separate' ? `Supply of ${u}, made to order, for ${place}. Installation is quoted separately below.` : `Supply only of ${u}, made to order, for ${place}.`;
}
const addrLines = (addr, postcode) => {
  const lines = String(addr || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const pc = String(postcode || '').trim();
  if (pc && !lines.some((l) => l.toLowerCase().includes(pc.toLowerCase()))) lines.push(pc);
  return lines;
};

// ---------- loading old or partial records ----------
function normProduct(p) {
  const k = String(p.kind ?? '');
  const kind = KINDS.some((x) => x.id === k) ? k : { stable: 'side', aluclad: 'casement', screen: 'loft', other: 'fixed' }[k] ?? 'casement';
  let frame = FRAMES.some((f) => f.id === p.frame) ? p.frame : undefined;
  if (!frame) { const m = String(p.material ?? ''); frame = k === 'aluclad' ? 'timber-alu' : /pvc|upvc/i.test(m) ? 'pvc' : /aluminium|aluminum/i.test(m) ? 'aluminium' : 'timber'; }
  return { ...newProduct(), ...p, id: p.id || uid(), kind, frame };
}
function normQuote(raw, f) {
  if (!raw || typeof raw.id !== 'string') return null;
  const base = newQuote([], f);
  const lines = new Map((raw.installLines ?? []).map((l) => [l.key, l]));
  return {
    ...base, ...raw, id: raw.id, reference: raw.reference || base.reference,
    audience: ['home', 'architect', 'developer'].includes(raw.audience) ? raw.audience : 'home',
    products: Array.isArray(raw.products) ? raw.products.map(normProduct) : [],
    installLines: INSTALL_KEYS.map((key) => { const l = lines.get(key); return { key, included: !!l?.included, detail: l?.detail ?? '', amount: r2(l?.amount ?? 0) }; }),
    payments: Array.isArray(raw.payments) && raw.payments.length ? raw.payments.map((s) => ({ id: s.id || uid(), key: s.key || 'custom', percent: Number(s.percent) || 0, label: s.label || '', trigger: s.trigger || '' })) : base.payments,
    docLang: raw.docLang === 'pl' ? 'pl' : 'en',
    vatRate: (f.vatRegistered && Number(raw.vatRate)) || 0,
    installMode: ['included', 'separate'].includes(raw.installMode) ? raw.installMode : 'none',
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}
const normFirm = (raw) => ({ ...FIRM_DEFAULT, ...(raw || {}), vatRegistered: raw?.vatRegistered === true });

// ---------- HubSpot: deal, sends, status (migration 0026) ----------
// Same ids as ACCEPTED_STAGES in supabase/functions/_shared/hubspot-quotes.ts.
const ACCEPTED_STAGES = ['6335558846', '6334870758', 'contractsent', '6342532306', '6342584520', '6334870754', 'closedwon'];
const STAGE_LABEL = { appointmentscheduled: 'Enquiry', presentationscheduled: 'Quote sent', decisionmakerboughtin: 'Negotiation', '6335558846': 'Quote accepted', '6334870758': 'Survey', contractsent: 'Order placed', '6342532306': 'Production', '6342584520': 'Delivery', '6334870754': 'Installation', closedwon: 'Closed won', closedlost: 'Closed lost' };
const STATUS = {
  draft: { en: 'Draft', pl: 'Szkic' }, sent: { en: 'Sent', pl: 'Wysłana' },
  accepted: { en: 'Accepted', pl: 'Zaakceptowana' }, declined: { en: 'Declined', pl: 'Odrzucona' },
};
const KIND = { new: { en: 'new quote', pl: 'nowa oferta' }, revision: { en: 'revision', pl: 'rewizja' }, resend: { en: 'sent again, no changes', pl: 'ponownie, bez zmian' } };
const MAX_PDF = 10 * 1024 * 1024;
let hub = { on: false, demo: false, meta: new Map(), sends: [] };
let search = { q: '', results: null, busy: false, error: '' };
const deals = new Map(); // deal id → { deal, files, missing, error }
let sendForm = null; // { quoteId, file, error, busy }

const metaOf = (q) => hub.meta.get(q.id) || { id: q.id, status: 'draft', status_source: null, hubspot_deal_id: null, hubspot_deal_name: null, hubspot_dealstage: null };
const sendsOf = (q) => hub.sends.filter((s) => s.quote_id === q.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
const setMeta = (id, patch) => hub.meta.set(id, { ...metaOf({ id }), ...patch });
const statusName = (s) => t(STATUS[s]?.en ?? s, STATUS[s]?.pl ?? s);
const statusTag = (q) => { const m = metaOf(q), last = sendsOf(q)[0]; return `<span class="tag q-st q-st-${esc(m.status)}">${esc(statusName(m.status))}${m.status !== 'draft' && last ? ` · rev ${esc(last.revision)}` : ''}</span>`; };
// What the client sees, so the CRM can tell a changed quote from the one sent: no timestamps, private note or UI flags.
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
const content = (q) => { const { updatedAt, revision, internalNote, ...rest } = q; void updatedAt; void revision; void internalNote; return stable({ ...rest, products: (rest.products || []).map(({ showSpec, ...p }) => { void showSpec; return p; }) }); };
export const nextRevision = (r) => {
  const s = String(r ?? '').trim();
  if (/^\d+$/.test(s)) return String(Number(s) + 1).padStart(Math.max(2, s.length), '0');
  if (/^[A-Ya-y]$/.test(s)) return String.fromCharCode(s.charCodeAt(0) + 1);
  return s ? `${s}.1` : '01';
};
// new: never sent. revision: the content (or the number) changed since the last send. resend: the same thing again.
// bump: the content changed but the number did not, so it must change before the PDF is saved.
function sendPlan(q) {
  const last = sendsOf(q)[0];
  if (!last) return { kind: 'new', last: null, bump: false };
  const changed = content(q) !== content(last.snapshot || {});
  if (changed) return { kind: 'revision', last, bump: q.revision.trim() === last.revision };
  return { kind: q.revision.trim() === last.revision ? 'resend' : 'revision', last, bump: false };
}
const pdfBase = (q) => `Brick-and-Pane-${q.reference}-rev${q.revision.trim() || '00'}`.replace(/[^\w.-]+/g, '-');
const onDeal = (dealId) => (quotes || []).filter((x) => metaOf(x).hubspot_deal_id === dealId);
// HubSpot says the client accepted, but two or more quotes on the deal are live: staff say which.
function needsChoice(q) {
  const m = metaOf(q);
  if (!m.hubspot_deal_id || !ACCEPTED_STAGES.includes(m.hubspot_dealstage) || m.status !== 'sent') return false;
  const live = onDeal(m.hubspot_deal_id).map(metaOf).filter((x) => x.status !== 'draft');
  return !live.some((x) => x.status === 'accepted' && x.status_source === 'crm') && live.filter((x) => x.status === 'sent' || x.status_source === 'hubspot').length > 1;
}
const stageText = (s) => STAGE_LABEL[s] || s || '';

// ---------- state and saving ----------
let quotes = null; // loaded once, refreshed whenever the list is shown
let firm = { ...FIRM_DEFAULT };
let openId = null;
let step = 'client';
let pendingDelete = null;
let root = null;
const dirty = new Set();
let firmDirty = false;
let saveTimer = null;
let chain = Promise.resolve();

const current = () => quotes?.find((q) => q.id === openId) || null;
async function load() {
  const [list, settings, h] = await Promise.all([store.listQuotes(), store.getQuoteSettings(), store.quoteHub ? store.quoteHub().catch(() => null) : null]);
  firm = normFirm(settings);
  quotes = list.flatMap((r) => { const q = normQuote(r, firm); return q ? [q] : []; });
  hub = { on: !!h?.hubspot, demo: !!h?.demo, meta: new Map((h?.meta || []).map((m) => [m.id, m])), sends: h?.sends || [] };
}
function flush() {
  clearTimeout(saveTimer);
  const ids = [...dirty]; dirty.clear();
  const doFirm = firmDirty; firmDirty = false;
  for (const id of ids) {
    const q = quotes?.find((x) => x.id === id);
    if (q) chain = chain.then(() => store.saveQuote(JSON.parse(JSON.stringify(q)))).catch((e) => { dirty.add(id); toast(e.message); });
  }
  if (doFirm) chain = chain.then(() => store.saveQuoteSettings({ ...firm })).catch((e) => { firmDirty = true; toast(e.message); });
  return chain;
}
const later = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600); };
function touch(q) { q.updatedAt = Date.now(); dirty.add(q.id); later(); }
addEventListener('pagehide', () => { flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

// ---------- small building blocks ----------
const field = (label, control, hint = '', cls = '') => `<label class="field q-field ${cls}"><span class="q-lab">${esc(label)}</span>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;
const text = (b, value, ph = '', type = 'text') => `<input type="${type}" data-b="${esc(b)}" value="${esc(value)}"${ph ? ` placeholder="${esc(ph)}"` : ''}>`;
const area = (b, value, ph = '', rows = 3) => `<textarea data-b="${esc(b)}" rows="${rows}"${ph ? ` placeholder="${esc(ph)}"` : ''}>${esc(value)}</textarea>`;
const num = (b, value, ph = '0') => `<input type="text" inputmode="decimal" class="q-numin" data-b="${esc(b)}" data-t="num" value="${value ? esc(String(value)) : ''}" placeholder="${esc(ph)}">`;
const qty = (b, value) => `<input type="text" inputmode="numeric" class="q-numin" data-b="${esc(b)}" data-t="int" value="${value ? esc(String(value)) : ''}" placeholder="1">`;
const check = (b, on, label, hint = '') => `<label class="q-check"><input type="checkbox" data-b="${esc(b)}" data-re ${on ? 'checked' : ''}><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
const head = (kicker, title, textLine) => `<header class="q-head"><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(textLine)}</p></header>`;
const cards = (act, value, items) => `<div class="q-cards">${items.map(([id, title, line]) => `<button type="button" class="q-card" data-act="${act}" data-v="${id}" aria-pressed="${value === id}"><strong>${esc(title)}</strong><span>${esc(line)}</span></button>`).join('')}</div>`;
const ICON = {
  up: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  bin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  print: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
};
const MARK = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="28" height="28"/><rect x="8" y="8" width="16" height="18" stroke-width="1.6"/><path d="M15.2 8v18M17.8 8v18" stroke-width="1.6"/></svg>';

// ---------- the estimate the client gets (EN or PL, whatever the quote's language is) ----------
function words(lang) {
  const p = lang === 'pl';
  return {
    estimate: p ? 'Oferta' : 'Estimate',
    tagline: p ? 'Okna, drzwi i przeszklone fasady' : 'Windows, doors and glazed facades',
    line: p ? 'Na zamówienie i z montażem. Londyn.' : 'Made to order and fitted. London.',
    products: p ? 'Produkty' : 'Products', discount: p ? 'Rabat' : 'Discount', survey: p ? 'Pomiar i dostawa' : 'Survey and delivery',
    installation: p ? 'Montaż' : 'Installation', included: p ? 'w cenie' : 'included', net: p ? 'Netto' : 'Net total',
    vat: (r) => `VAT ${r}%`, gross: p ? 'Razem z VAT' : 'Total including VAT', total: p ? 'Razem' : 'Total',
    sterling: p ? 'Kwoty w funtach brytyjskich.' : 'Amounts in pounds sterling.',
    separateTitle: p ? 'Montaż — osobna wycena' : 'Installation, quoted separately',
    separateNote: p ? 'Ta kwota nie wchodzi w sumę powyżej i jest fakturowana osobno.' : 'This amount is not part of the total above. It is invoiced on its own.',
    each: p ? 'szt.' : 'each', site: p ? 'Adres realizacji' : 'Site', preparedBy: p ? 'Przygotował' : 'Prepared by',
    valid: p ? 'Ważna do' : 'Valid until', revision: p ? 'Rewizja' : 'Revision', next: p ? 'Jak to idzie dalej' : 'What happens next',
    lead: p ? 'Czas realizacji' : 'Lead time', guarantee: p ? 'Gwarancja' : 'Guarantee',
    terms: p
      ? 'Ta oferta jest specyfikacją. Robimy system i materiał wpisane przy pozycji. Zmiany uzgadniamy przed produkcją. Czas liczy się od podpisanych rysunków. Przed produkcją mierzymy istniejące otwory.'
      : 'This quote is the specification. We make the system and material named on each line. Changes are agreed before production. Lead time runs from the drawings you sign. We survey the openings before we manufacture.',
    promise: {
      home: p ? 'Najpierw pomiar otworów, potem produkcja tego, co jest w tej ofercie.' : 'We survey the openings, then manufacture what this quote names.',
      architect: p ? 'Przegląd rysunków przed produkcją. Parametry tylko tam, gdzie są wpisane.' : 'Drawing review before manufacture. Performance figures only where this quote states them.',
      developer: p ? 'Program liczy się od podpisanych rysunków. Ta oferta jest specyfikacją pakietu.' : 'The programme runs from the drawings you sign. This quote is the specification.',
    },
    payment: p ? 'Płatność' : 'Payment',
    basisGross: p ? 'Etapy liczone od kwoty z VAT.' : 'Stages are shares of the total including VAT.',
    basisNet: p ? 'Etapy liczone od kwoty netto.' : 'Stages are shares of the net total.',
    basisPlain: p ? 'Etapy liczone od tej kwoty.' : 'Stages are shares of this total.',
    mismatch: p ? 'Procenty etapów nie sumują się do 100% — proszę to uzgodnić przed akceptacją.' : 'These percentages do not add up to 100%. Please agree the split before acceptance.',
    bank: p ? 'Przelew' : 'Bank transfer', sort: 'Sort code', accountNo: p ? 'Numer konta' : 'Account number', payRef: p ? 'Tytuł' : 'Reference',
    acceptance: p ? 'Akceptacja' : 'Acceptance',
    acceptLine: p ? 'Potwierdzam systemy, wymiary i kwotę tej oferty.' : 'I confirm the systems, the sizes and the total in this quote.',
    signature: p ? 'Podpis i data' : 'Signature and date', customer: p ? 'Klient' : 'Customer',
    emptyInstall: p ? 'Montaż jest w zakresie. Szczegóły potwierdzimy na pomiarze.' : 'Installation is included. The detailed scope is confirmed at survey.',
    sitePrep: p ? 'Po stronie klienta' : 'Before we arrive', exclusions: p ? 'Poza zakresem' : 'Not included',
    standardExclusion: p
      ? 'O ile nie wpisano wyżej: malowanie, prace konstrukcyjne i uzupełnienia poza uzgodnionym zakresem nie wchodzą w cenę.'
      : 'Unless it is listed above, decoration, structural work and making good beyond the agreed items are not included.',
    programme: p ? 'Program' : 'Programme', certification: p ? 'Certyfikat' : 'Certification', notes: p ? 'Uwagi' : 'Notes',
    drawing: p ? 'Rysunek' : 'Drawing', supplier: p ? 'Sprzedawca' : 'Supplier', legal: p ? 'Podmiot' : 'Legal entity',
    companyNo: p ? 'Nr spółki' : 'Company no.', vatNo: p ? 'Nr VAT' : 'VAT no.', missingName: p ? 'Imię klienta' : 'Customer name',
    noItems: p ? 'Brak pozycji.' : 'No items yet.',
  };
}
const row = (label, value, strong = false) => `<div class="of-row${strong ? ' is-strong' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
const labelled = (label, value) => (value ? `<p><span class="of-label">${esc(label)}</span>${esc(value)}</p>` : '');

function estimate(q) {
  const L = q.docLang, w = words(L), tot = totals(q), ok = payOk(q), vatOn = q.vatRate > 0;
  const base = q.paymentOnGross ? tot.gross : tot.net;
  const amounts = payAmounts(q.payments, base, ok);
  const stages = q.payments.map((s, i) => ({ s, amount: amounts[i] ?? 0 })).filter(({ s }) => (Number(s.percent) || 0) > 0 || s.label.trim());
  const billing = addrLines(q.billingAddress, q.sameAddress ? q.postcode : '');
  const site = q.sameAddress ? [] : addrLines(q.siteAddress, q.postcode);
  const contact = [q.email.trim(), q.phone.trim()].filter(Boolean);
  const lines = q.installLines.filter((l) => l.included);
  const showRev = q.revision.trim() !== '' && q.revision.trim() !== '00';
  const legal = [firm.legalEntity.trim() && `${w.legal}: ${firm.legalEntity.trim()}`, firm.companyNo.trim() && `${w.companyNo}: ${firm.companyNo.trim()}`, firm.vatNo.trim() && `${w.vatNo}: ${firm.vatNo.trim()}`].filter(Boolean);
  const bank = !!(firm.accountName.trim() || firm.sortCode.trim() || firm.accountNumber.trim());
  const item = (p, i) => {
    const spec = specRows(p, L);
    const meta = [named(FRAMES, p.frame, L), p.system.trim() ? named(KINDS, p.kind, L) : '', size(p.widthMm, p.heightMm, L), p.drawingRef.trim() ? `${w.drawing} ${p.drawingRef.trim()}` : ''].filter(Boolean);
    return `<div class="of-item of-keep">
      <p class="of-no">${String(i + 1).padStart(2, '0')}</p>
      <div>
        ${p.location.trim() ? `<p class="of-muted of-small">${esc(p.location.trim())}</p>` : ''}
        <h3>${esc(itemTitle(p, L))}</h3>
        ${meta.length ? `<p class="of-muted of-small">${esc(meta.join('  ·  '))}</p>` : ''}
        ${spec.length ? `<dl class="of-spec">${spec.map((s) => `<div><dt class="of-label">${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>` : ''}
        ${p.notes.trim() ? `<p class="of-muted of-small of-gap">${esc(p.notes.trim())}</p>` : ''}
      </div>
      <div class="of-price"><p class="of-amount">${esc(money(p.qty * p.unitPrice, L))}</p><p class="of-muted of-small">${p.qty === 1 ? esc(w.each) : `${p.qty} × ${esc(money(p.unitPrice, L))}`}</p></div>
    </div>`;
  };
  return `<article class="offer" id="offer" lang="${L}">
    <header class="of-head">
      <div><span class="of-brand">${MARK}<span>Brick &amp; Pane</span></span><p class="of-muted of-small of-gap">${esc(w.tagline)}</p><p class="of-muted of-small">${esc(w.line)}</p></div>
      <div class="of-right"><p class="of-title">${esc(w.estimate)}</p><p class="of-small of-gap">${esc(q.reference)}</p><p class="of-muted of-small">${esc(longDate(q.date, L))}</p>${q.validUntil ? `<p class="of-muted of-small">${esc(w.valid)} ${esc(longDate(q.validUntil, L))}</p>` : ''}</div>
    </header>
    <div class="of-rule"></div>
    <div class="of-client">
      <div>
        <h2>${q.customerName.trim() ? esc(q.customerName.trim()) : `<span class="of-muted no-print">${esc(w.missingName)}</span>`}</h2>
        ${billing.length ? `<p class="of-muted of-gap">${billing.map((l) => `<span class="of-block">${esc(l)}</span>`).join('')}</p>` : ''}
        ${contact.length ? `<p class="of-muted of-small">${esc(contact.join('  ·  '))}</p>` : ''}
      </div>
      <p class="of-tag">${esc(audienceName(q.audience, L))} · ${esc(scopeName(q, L))}</p>
    </div>
    ${site.length ? `<p class="of-small of-gap"><span class="of-muted">${esc(w.site)}. </span>${esc(site.join(', '))}</p>` : ''}
    <p class="of-lead">${esc(intro(q, tot))}</p>
    <p class="of-muted of-small of-gap">${esc(w.promise[q.audience])}</p>
    <section class="of-items">${q.products.length ? q.products.map(item).join('') : `<p class="of-empty of-muted no-print">${esc(w.noItems)}</p>`}</section>
    <section class="of-totals of-keep">
      ${row(w.products, money(tot.productNet, L))}
      ${tot.discount ? row(w.discount, `− ${money(Math.abs(tot.discount), L)}`) : ''}
      ${tot.survey ? row(w.survey, money(tot.survey, L)) : ''}
      ${q.installMode === 'included' ? row(w.installation, tot.installNet === 0 ? w.included : money(tot.installNet, L)) : ''}
      ${vatOn ? row(w.net, money(tot.net, L)) + row(w.vat(q.vatRate), money(tot.vat, L)) : ''}
      ${row(vatOn ? w.gross : w.total, money(vatOn ? tot.gross : tot.net, L), true)}
      <p class="of-muted of-tiny">${esc(w.sterling)}</p>
    </section>
    ${q.projectNotes.trim() ? `<p class="of-small of-notes"><span class="of-muted">${esc(w.notes)}. </span>${esc(q.projectNotes.trim())}</p>` : ''}
    ${q.installMode === 'none' ? '' : `<section class="of-sec of-keep">
      <h3>${esc(q.installMode === 'separate' ? w.separateTitle : w.installation)}</h3>
      ${q.installMode === 'separate' ? `<p class="of-muted of-small of-gap">${esc(w.separateNote)}</p>` : ''}
      ${lines.length ? `<ul class="of-lines">${lines.map((l) => { const d = INSTALL[l.key]; return `<li><div><p>${esc(L === 'pl' ? d.pl : d.en)}</p><p class="of-muted of-small">${esc(l.detail.trim() || (L === 'pl' ? d.hintPl : d.hintEn))}</p></div><p class="of-mono">${l.amount ? esc(money(l.amount, L)) : '—'}</p></li>`; }).join('')}</ul>` : `<p class="of-small of-gap">${esc(w.emptyInstall)}</p>`}
      ${q.installMode === 'separate' ? `<div class="of-totals of-plain">${row(vatOn ? w.net : w.total, money(tot.installNet, L), !vatOn)}${vatOn ? row(w.vat(q.vatRate), money(tot.installVat, L)) + row(w.gross, money(tot.installGross, L), true) : ''}</div>` : ''}
      <div class="of-cols">
        ${labelled(w.sitePrep, q.siteNotes.trim())}
        <p><span class="of-label">${esc(w.exclusions)}</span>${q.exclusions.trim() ? `${esc(q.exclusions.trim())} ` : ''}${esc(w.standardExclusion)}</p>
        ${labelled(w.programme, q.programme.trim())}
        ${labelled(w.certification, q.certification.trim())}
      </div>
    </section>`}
    <section class="of-sec of-keep">
      <h3>${esc(w.next)}</h3>
      <div class="of-cols">${labelled(w.lead, q.leadTime.trim())}${labelled(w.guarantee, q.guarantee.trim())}</div>
      <p class="of-muted of-small of-gap">${esc(q.termsNote.trim() || w.terms)}</p>
      ${showRev ? `<p class="of-muted of-small">${esc(w.revision)} ${esc(q.revision)}</p>` : ''}
    </section>
    ${stages.length ? `<section class="of-keep of-pay">
      <h3>${esc(w.payment)}</h3>
      <p class="of-muted of-small">${esc(vatOn ? (q.paymentOnGross ? w.basisGross : w.basisNet) : w.basisPlain)}</p>
      ${ok ? '' : `<p class="of-warn of-small">${esc(w.mismatch)}</p>`}
      <ul class="of-lines">${stages.map(({ s, amount }) => `<li><div><p>${esc(stageName(s, L))}</p>${stageWhen(s, L) ? `<p class="of-muted of-small">${esc(stageWhen(s, L))}</p>` : ''}</div><p class="of-mono"><span class="of-muted of-pct">${esc(s.percent)}%</span>${esc(money(amount, L))}</p></li>`).join('')}</ul>
    </section>` : ''}
    ${bank || legal.length ? `<section class="of-cols of-keep of-bank">
      ${bank ? `<div><p class="of-label">${esc(w.bank)}</p>${firm.accountName.trim() ? `<p>${esc(firm.accountName.trim())}</p>` : ''}${firm.bankName.trim() ? `<p>${esc(firm.bankName.trim())}</p>` : ''}<p class="of-muted">${esc([firm.sortCode.trim() && `${w.sort} ${firm.sortCode.trim()}`, firm.accountNumber.trim() && `${w.accountNo} ${firm.accountNumber.trim()}`].filter(Boolean).join('  ·  '))}</p><p class="of-muted">${esc(w.payRef)}: ${esc(q.reference)}</p></div>` : ''}
      ${legal.length ? `<div><p class="of-label">${esc(w.supplier)}</p><p>Brick &amp; Pane</p>${legal.map((l) => `<p class="of-muted">${esc(l)}</p>`).join('')}</div>` : ''}
    </section>` : ''}
    <section class="of-sec of-keep">
      <h3>${esc(w.acceptance)}</h3>
      <p class="of-small of-gap">${esc(w.acceptLine)}</p>
      <div class="of-sign">
        <div><p class="of-label">${esc(w.customer)}</p><p class="of-gap">${esc(q.customerName.trim()) || '&nbsp;'}</p><div class="of-sign-line"></div><p class="of-muted of-small of-gap">${esc(w.signature)}</p></div>
        <div><p class="of-label">Brick &amp; Pane</p><p class="of-gap">${esc(q.preparedBy.trim() || FIRM.name)}</p><div class="of-sign-line"></div><p class="of-muted of-small of-gap">${esc(w.signature)}</p></div>
      </div>
    </section>
    <footer class="of-foot"><span>${esc(firm.replyEmail.trim() || FIRM.email)}</span><span>${esc(firm.phone.trim() || FIRM.phone)}</span><span>${FIRM.web}</span>${q.preparedBy.trim() ? `<span>${esc(w.preparedBy)}: ${esc(q.preparedBy.trim())}</span>` : ''}</footer>
  </article>`;
}

// ---------- HubSpot panels ----------
const fmtDay = (s) => longDate(String(s || '').slice(0, 10), LANG);
function dealResults() {
  if (search.busy) return `<p class="hint q-gap">${t('Searching HubSpot…', 'Szukam w HubSpocie…')}</p>`;
  if (search.error) return `<p class="q-warn q-gap">${esc(search.error)}</p>`;
  if (!search.results) return '';
  if (!search.results.length) return `<p class="hint q-gap">${t('No deal found. Check the spelling, or create the deal in HubSpot first.', 'Nie ma takiego deala. Sprawdź pisownię albo najpierw załóż deal w HubSpocie.')}</p>`;
  return `<ul class="q-deals">${search.results.map((d) => `<li>
    <div><strong>${esc(d.name || t('(no name)', '(bez nazwy)'))}</strong>
      <span class="q-item-meta">${esc([stageText(d.stage), d.contact?.name, d.contact?.email].filter(Boolean).join(' · '))}${d.closed ? ` · ${t('closed', 'zamknięty')}` : ''}</span></div>
    <button type="button" class="btn btn-sm" data-act="deal-pick" data-v="${esc(d.id)}">${t('Use this deal', 'Przypisz')}</button></li>`).join('')}</ul>`;
}
function dealFilesBlock(m) {
  const info = deals.get(m.hubspot_deal_id);
  if (!info?.files) return `<button type="button" class="btn btn-sm btn-ghost q-gap" data-act="deal-files">${t('Show quotes already in HubSpot (PDF, Word)', 'Pokaż oferty, które są już w HubSpocie (PDF, Word)')}</button>${info?.error ? `<p class="q-warn">${esc(info.error)}</p>` : ''}`;
  const miss = info.missing?.length ? `<p class="hint">${t('HubSpot did not allow reading', 'HubSpot nie pozwolił odczytać')}: ${esc(info.missing.join(', '))} ${t('(the private app needs that scope).', '(aplikacja prywatna potrzebuje tego uprawnienia).')}</p>` : '';
  if (!info.files.length) return `<p class="hint q-gap">${t('No PDF or Word files on this deal in HubSpot apart from the CRM’s own.', 'Na tym dealu w HubSpocie nie ma plików PDF ani Word poza wysłanymi z CRM.')}</p>${miss}`;
  return `<h4 class="q-h4">${t('Files on the deal in HubSpot', 'Pliki na dealu w HubSpocie')}</h4>
    <ul class="q-files">${info.files.map((f) => `<li><button type="button" class="q-link" data-act="deal-file" data-v="${esc(f.id)}">${esc(f.name)}</button>
      <span class="q-item-meta">${esc([fmtDay(f.at), f.source === 'email' ? t('email', 'mail') : t('note', 'notatka'), f.title].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>${miss}`;
}
function dealPanel(q) {
  const m = metaOf(q), sent = sendsOf(q).length > 0;
  const top = `<div class="q-subrow"><h3 class="q-sub">${t('HubSpot deal', 'Deal w HubSpocie')}</h3>${statusTag(q)}</div>`;
  if (!hub.on) return `<section class="q-box q-deal" id="q-deal">${top}<p class="hint">${t('The HubSpot link is not switched on yet (migration 0026). You can still prepare and print the quote.', 'Połączenie z HubSpotem nie jest jeszcze włączone (migracja 0026). Ofertę dalej można przygotować i wydrukować.')}</p></section>`;
  if (m.hubspot_deal_id) {
    const info = deals.get(m.hubspot_deal_id), deal = info?.deal;
    const others = onDeal(m.hubspot_deal_id).filter((x) => x.id !== q.id);
    return `<section class="q-box q-deal" id="q-deal">${top}
      <p class="q-deal-name"><strong>${esc(deal?.name || m.hubspot_deal_name || `#${m.hubspot_deal_id}`)}</strong>${m.hubspot_dealstage ? ` · ${esc(stageText(m.hubspot_dealstage))}` : ''}</p>
      ${deal?.contact ? `<p class="q-item-meta">${esc([deal.contact.name, deal.contact.email, deal.contact.phone].filter(Boolean).join(' · '))}</p>` : ''}
      <div class="btn-row q-gap">
        <button type="button" class="btn btn-sm btn-ghost" data-act="deal-fill">${t('Fill client details from HubSpot', 'Wpisz dane klienta z HubSpota')}</button>
        ${deal?.url ? `<a class="btn btn-sm btn-ghost" href="${esc(deal.url)}" target="_blank" rel="noopener">${t('Open in HubSpot', 'Otwórz w HubSpocie')}</a>` : ''}
        ${sent ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-act="deal-unlink">${t('Change deal', 'Zmień deal')}</button>`}
      </div>
      ${sent ? `<p class="hint">${t('This quote has been sent to this deal, so the deal stays. For another deal, duplicate the quote.', 'Ta oferta poszła już na ten deal, więc deal zostaje. Na inny deal zduplikuj ofertę.')}</p>` : ''}
      ${others.length ? `<h4 class="q-h4">${t('Other quotes on this deal', 'Inne oferty na tym dealu')}</h4><ul class="q-files">${others.map((o) => `<li><a href="#/quotes/${esc(o.id)}">${esc(o.reference)}</a> <span class="q-item-meta">${esc([statusName(metaOf(o).status), money(o.vatRate > 0 ? totals(o).gross : totals(o).net, o.docLang), scopeShort(o)].join(' · '))}</span></li>`).join('')}</ul>` : ''}
      ${dealFilesBlock(m)}
    </section>`;
  }
  return `<section class="q-box q-deal" id="q-deal">${top}
    <p class="hint">${t('Pin the quote to the client’s deal: it fills the client details, and sending the quote writes it to that deal.', 'Przypnij ofertę do deala klienta: dane klienta wpiszą się same, a wysłana oferta trafi na ten deal.')}</p>
    <div class="q-deal-search q-gap"><input type="search" id="q-deal-q" value="${esc(search.q)}" placeholder="${esc(t('Name, email, phone or deal name', 'Nazwisko, e-mail, telefon albo nazwa deala'))}" aria-label="${esc(t('Search HubSpot deals', 'Szukaj deala w HubSpocie'))}">
      <button type="button" class="btn btn-sm" data-act="deal-search">${t('Search', 'Szukaj')}</button></div>
    ${dealResults()}
  </section>`;
}

function sendPanel(q) {
  const m = metaOf(q), sends = sendsOf(q), plan = sendPlan(q);
  const hist = sends.length ? `<ol class="q-sends">${sends.map((s, i) => {
    const hubLine = s.hubspot_note_id
      ? (s.hubspot_error ? `<span class="q-warn">${t('In HubSpot, with a problem', 'W HubSpocie, z problemem')}: ${esc(s.hubspot_error)}</span>` : `<span class="q-ok">${t('In HubSpot', 'W HubSpocie')}${s.hubspot_stage_moved ? ` · ${t('deal moved to Quote sent', 'deal przeszedł na Quote sent')}` : ''}</span>`)
      : `<span class="q-warn">${t('Not in HubSpot yet', 'Jeszcze nie w HubSpocie')}${s.hubspot_error ? `: ${esc(s.hubspot_error)}` : ''}</span> <button type="button" class="btn btn-sm btn-ghost" data-act="send-retry" data-v="${esc(s.id)}">${t('Retry', 'Ponów')}</button>`;
    return `<li${i ? ' class="is-old"' : ''}><div><strong>rev ${esc(s.revision)}</strong> · ${esc(fmtDay(s.sent_on))} · ${esc(money(Number(s.total) || 0, q.docLang))} · ${esc(t(KIND[s.kind]?.en ?? s.kind, KIND[s.kind]?.pl ?? s.kind))}${i ? ` · ${t('replaced', 'zastąpiona')}` : ''}</div>
      <div class="q-item-meta">${hubLine}${s.pdf_path ? ` · <button type="button" class="q-link" data-act="send-pdf" data-v="${esc(s.id)}">PDF</button>` : ''}</div></li>`;
  }).join('')}</ol>` : '';
  const choice = needsChoice(q) ? `<div class="callout q-gap"><p>${t(`In HubSpot the deal is at “${stageText(m.hubspot_dealstage)}”, and it has more than one quote sent. Did the client accept this one?`, `W HubSpocie deal jest na etapie „${stageText(m.hubspot_dealstage)}”, a ma kilka wysłanych ofert. Czy klient przyjął tę?`)}</p>
    <div class="btn-row q-gap"><button type="button" class="btn btn-sm" data-act="st-accepted">${t('Yes, this one', 'Tak, tę')}</button><button type="button" class="btn btn-sm btn-ghost" data-act="st-declined">${t('No, another one', 'Nie, inną')}</button></div></div>` : '';
  const statusBtns = m.status === 'draft' ? '' : `<div class="btn-row q-gap">${m.status !== 'accepted' ? `<button type="button" class="btn btn-sm btn-ghost" data-act="st-accepted">${t('Mark accepted', 'Oznacz: przyjęta')}</button>` : ''}${m.status !== 'declined' ? `<button type="button" class="btn btn-sm btn-ghost" data-act="st-declined">${t('Mark declined', 'Oznacz: odrzucona')}</button>` : ''}${m.status !== 'sent' ? `<button type="button" class="btn btn-sm btn-ghost" data-act="st-sent">${t('Back to sent', 'Wróć do: wysłana')}</button>` : ''}</div>
    <p class="hint">${m.status_source === 'hubspot' ? t('Status taken from the deal stage in HubSpot.', 'Status wzięty z etapu deala w HubSpocie.') : t('The status follows the HubSpot deal (every 15 min) unless you set it here.', 'Status idzie za dealem w HubSpocie (co 15 min), chyba że ustawisz go tutaj.')}</p>`;
  const what = plan.kind === 'new' ? t('New quote', 'Nowa oferta')
    : plan.kind === 'resend' ? t(`The same revision ${q.revision} again, with no changes`, `Ta sama rewizja ${q.revision} jeszcze raz, bez zmian`)
    : t(`Revision ${q.revision}, replacing revision ${plan.last.revision} of ${fmtDay(plan.last.sent_on)}`, `Rewizja ${q.revision} w miejsce rewizji ${plan.last.revision} z ${fmtDay(plan.last.sent_on)}`);
  let form = '';
  if (sendForm?.quoteId === q.id) {
    const f = sendForm.file, nameOk = !f || f.name.toLowerCase().includes(q.reference.toLowerCase());
    form = `<div class="q-sendform q-gap">
      <p><strong>${esc(what)}</strong> · ${esc(money(q.vatRate > 0 ? totals(q).gross : totals(q).net, q.docLang))}</p>
      <ol class="q-steps-list">
        <li>${t('Save the PDF the client gets:', 'Zapisz PDF, który dostaje klient:')} <button type="button" class="btn btn-sm btn-ghost" data-act="print">${ICON.print}${t('Print → Save as PDF', 'Drukuj → Zapisz jako PDF')}</button><span class="hint">${t('File name', 'Nazwa pliku')}: ${esc(pdfBase(q))}.pdf</span></li>
        <li><label class="field q-field"><span class="q-lab">${t('The PDF sent to the client', 'PDF wysłany do klienta')}</span><input type="file" id="q-send-file" accept="application/pdf,.pdf"></label>
          ${f ? `<span class="hint">${t('Chosen', 'Wybrany')}: ${esc(f.name)} (${Math.round(f.size / 1024)} KB)</span>` : ''}
          ${nameOk ? '' : `<label class="q-check"><input type="checkbox" id="q-send-sure"><span>${t(`The file name has no ${q.reference}. It is the PDF of this quote.`, `W nazwie pliku nie ma ${q.reference}. To jest PDF tej oferty.`)}</span></label>`}</li>
        <li><label class="field q-field"><span class="q-lab">${t('Sent to the client on', 'Wysłana do klienta dnia')}</span><input type="date" id="q-send-date" value="${today()}" max="${today()}"></label></li>
      </ol>
      ${sendForm.error ? `<p class="q-warn">${esc(sendForm.error)}</p>` : ''}
      <div class="btn-row q-gap"><button type="button" class="btn btn-sm" data-act="send-go" ${sendForm.busy ? 'disabled' : ''}>${sendForm.busy ? t('Sending…', 'Wysyłam…') : t('Save and add to HubSpot', 'Zapisz i dodaj do HubSpota')}</button><button type="button" class="btn btn-sm btn-ghost" data-act="send-cancel">${t('Cancel', 'Anuluj')}</button></div>
    </div>`;
  }
  const canSend = hub.on && m.hubspot_deal_id;
  const openBtn = sendForm?.quoteId === q.id ? '' : `<div class="btn-row q-gap"><button type="button" class="btn btn-sm" data-act="send-open" ${canSend ? '' : 'disabled'}>${sends.length ? t('Send again or send a revision…', 'Wyślij ponownie albo rewizję…') : t('Send to the client…', 'Wyślij do klienta…')}</button></div>
    ${canSend ? '' : `<p class="hint">${hub.on ? t('Pin the quote to a HubSpot deal first (step 01, Client).', 'Najpierw przypnij ofertę do deala w HubSpocie (krok 01, Klient).') : t('The HubSpot link is not switched on yet.', 'Połączenie z HubSpotem nie jest jeszcze włączone.')}</p>`}`;
  return `<section class="q-box q-send no-print" id="q-send">
    <div class="q-subrow"><h3 class="q-sub">${t('Sending and HubSpot', 'Wysyłka i HubSpot')}</h3>${statusTag(q)}</div>
    <p class="q-item-meta">${m.hubspot_deal_id ? `${t('Deal', 'Deal')}: ${esc(m.hubspot_deal_name || `#${m.hubspot_deal_id}`)}${m.hubspot_dealstage ? ` · ${esc(stageText(m.hubspot_dealstage))}` : ''}` : t('No HubSpot deal yet.', 'Bez deala w HubSpocie.')}</p>
    ${choice}${hist}${statusBtns}${openBtn}${form}
  </section>`;
}
// Above the steps: a sent quote that has changed since must go out as a new revision.
function changedNote(q) {
  const last = sendsOf(q)[0];
  if (!last || content(q) === content(last.snapshot || {})) return '';
  return `<p class="callout q-changed no-print">${t(`You are changing a quote sent as revision ${last.revision} on ${fmtDay(last.sent_on)}. When you send it, it goes as a new revision.`, `Zmieniasz ofertę wysłaną jako rewizja ${last.revision} dnia ${fmtDay(last.sent_on)}. Przy wysłaniu pójdzie jako nowa rewizja.`)}</p>`;
}

// ---------- the five steps ----------
function stepClient(q) {
  const pl = q.docLang === 'pl';
  return `${head(t('01 / client', '01 / klient'), t('Who this quote is for', 'Dla kogo jest ta oferta'), t('Home, designer or site — the same as on the website. Then the address and the date. The language at the top is the language of the document.', 'Dom, projektant albo budowa — tak samo jak na stronie. Potem adres i termin. Język u góry jest językiem dokumentu.'))}
    ${dealPanel(q)}
    ${cards('audience', q.audience, [
      ['home', t('Home', 'Dom'), t('The owner. Survey of the openings, and installation if they want it.', 'Właściciel. Pomiar otworów i montaż, jeśli go chce.')],
      ['architect', t('Design', 'Projekt'), t('Drawings, performance figures and a review before production.', 'Rysunki, parametry i przegląd przed produkcją.')],
      ['developer', t('Site', 'Budowa'), t('A package, and a programme from the signed drawings.', 'Pakiet i program od podpisanych rysunków.')],
    ])}
    <div class="q-grid">
      ${field(t('Client', 'Klient'), text('q:customerName', q.customerName, pl ? 'Imię i nazwisko' : 'Customer name'), '', 'wide')}
      ${field(t('Phone', 'Telefon'), text('q:phone', q.phone, '07700 900000', 'tel'))}
      ${field('E-mail', text('q:email', q.email, 'name@email.com', 'email'))}
      ${field(t('Correspondence address', 'Adres do korespondencji'), area('q:billingAddress', q.billingAddress, pl ? 'Ulica\nMiasto' : 'Street\nTown'), '', 'wide')}
      <div class="wide">${check('q:sameAddress', q.sameAddress, t('The site address is the same', 'Adres realizacji jest taki sam'))}</div>
      ${q.sameAddress ? '' : field(t('Site address', 'Adres budowy'), area('q:siteAddress', q.siteAddress), '', 'wide')}
      ${field(t('Postcode', 'Kod pocztowy'), text('q:postcode', q.postcode, 'BA1 5BG'))}
      ${field(t('Prepared by', 'Przygotował'), text('q:preparedBy', q.preparedBy, t('Name', 'Imię')))}
    </div>
    <h3 class="q-sub">${t('Reference', 'Oznaczenie')}</h3>
    <div class="q-grid">
      ${field(t('Quote number', 'Numer oferty'), text('q:reference', q.reference))}
      ${field(t('Revision', 'Rewizja'), text('q:revision', q.revision), t('00 is not printed on the quote.', '00 nie drukuje się na ofercie.'))}
      ${field(t('Date', 'Data'), text('q:date', q.date, '', 'date'))}
      ${field(t('Valid until', 'Ważna do'), text('q:validUntil', q.validUntil, '', 'date'))}
      <div class="wide"><button type="button" class="btn btn-sm btn-ghost" data-act="valid30">${t('Set validity to 30 days', 'Ustaw ważność na 30 dni')}</button></div>
      ${field(t('Note just for you', 'Notatka tylko dla Ciebie'), area('q:internalNote', q.internalNote, t('For example: call after 5 pm', 'Na przykład: dzwonić po 17')), t('It never goes into the quote or the printout.', 'Nie trafia do oferty ani na wydruk.'), 'wide')}
    </div>`;
}

function stepProducts(q) {
  const pl = q.docLang === 'pl', L = q.docLang;
  const opts = (list, value) => list.map((x) => `<option value="${x.id}" ${x.id === value ? 'selected' : ''}>${esc(pl ? x.pl : x.en)}</option>`).join('');
  return `${head(t('02 / products', '02 / produkty'), t('What you are pricing', 'Co wyceniasz'), t('Material first, as on the website: aluminium, timber, PVC or timber-aluminium. Then a window, door, slider or facade.', 'Najpierw materiał, jak na stronie: aluminium, drewno, PVC albo drewno z aluminium. Potem okno, drzwi, przesuw albo fasada.'))}
    <div class="q-stack">${q.products.map((p, i) => {
      const filled = specRows(p, L).length;
      return `<article class="q-box" data-pid="${esc(p.id)}">
        <div class="q-box-head"><span class="q-num">${String(i + 1).padStart(2, '0')}</span>
          <div class="q-icons">
            <button type="button" class="q-icon" data-act="up" aria-label="${t('Move up', 'Wyżej')}" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
            <button type="button" class="q-icon" data-act="down" aria-label="${t('Move down', 'Niżej')}" ${i === q.products.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
            <button type="button" class="q-icon" data-act="del-item" aria-label="${t('Remove item', 'Usuń pozycję')}">${ICON.bin}</button>
          </div></div>
        <div class="q-grid">
          ${field(t('Where', 'Gdzie'), text(`p:${p.id}:location`, p.location, pl ? 'Elewacja frontowa' : 'Front elevation'))}
          ${field(t('Material', 'Materiał'), `<select data-b="p:${esc(p.id)}:frame">${opts(FRAMES, p.frame)}</select>`)}
          ${field(t('Type', 'Rodzaj'), `<select data-b="p:${esc(p.id)}:kind">${GROUPS.map((g) => `<optgroup label="${esc(pl ? g.pl : g.en)}">${opts(KINDS.filter((k) => k.group === g.id), p.kind)}</optgroup>`).join('')}</select>`)}
          ${field(t('Name on the quote', 'Nazwa w ofercie'), text(`p:${p.id}:system`, p.system, pl ? 'Zostaw puste, jeśli wystarczy rodzaj' : 'Leave blank to use the product type'), t('Leave blank if the type is enough.', 'Zostaw puste, jeśli wystarczy rodzaj.'), 'wide')}
          ${field(t('Width, mm', 'Szerokość, mm'), text(`p:${p.id}:widthMm`, p.widthMm, '920'))}
          ${field(t('Height, mm', 'Wysokość, mm'), text(`p:${p.id}:heightMm`, p.heightMm, '1450'))}
          ${field(t('Quantity', 'Ilość'), qty(`p:${p.id}:qty`, p.qty))}
          ${field(t('Price each, net', 'Cena za sztukę, netto'), num(`p:${p.id}:unitPrice`, p.unitPrice, '0.00'))}
        </div>
        <button type="button" class="btn btn-sm btn-ghost q-gap" data-act="spec" aria-expanded="${p.showSpec}">${p.showSpec ? t('Hide the details', 'Zwiń szczegóły') : t('Add technical details', 'Dodaj szczegóły techniczne')}${filled && !p.showSpec ? ` · ${filled}` : ''}</button>
        ${p.showSpec ? `<div class="q-grid q-gap">
          ${SPEC.map((s) => field(pl ? s.pl : s.en, text(`p:${p.id}:${s.key}`, p[s.key]))).join('')}
          ${field(pl ? 'Rysunek' : 'Drawing', text(`p:${p.id}:drawingRef`, p.drawingRef, 'A-01'))}
          ${field(pl ? 'Uwaga przy pozycji' : 'Note on this item', area(`p:${p.id}:notes`, p.notes, '', 2), '', 'wide')}
        </div>` : ''}
      </article>`;
    }).join('')}</div>
    <button type="button" class="btn q-gap" data-act="add-item">+ ${t('Add a window or door', 'Dodaj okno lub drzwi')}</button>`;
}

function stepInstall(q) {
  return `${head(t('03 / installation', '03 / montaż'), t('Is installation in the scope', 'Czy montaż jest w zakresie'), t('One question. If yes, tick only the windows, doors, facade and roof work that really goes into the price.', 'Jedno pytanie. Jeśli tak, zaznacz tylko okna, drzwi, fasadę i dach, które naprawdę wchodzą w cenę.'))}
    ${cards('mode', q.installMode, [
      ['none', t('Supply only', 'Tylko dostawa'), t('Installation does not appear on the quote.', 'Montaż nie pojawia się w ofercie.')],
      ['included', t('In this amount', 'W tej kwocie'), t('One total: products and installation.', 'Jedna suma: produkty i montaż.')],
      ['separate', t('Separately', 'Osobno'), t('Installation priced, but not added to the main total.', 'Montaż policzony, ale nie doliczony do głównej ceny.')],
    ])}
    ${q.installMode === 'none' ? '' : `<div class="q-stack">
      ${q.installLines.map((l) => { const d = INSTALL[l.key]; return `<div class="q-box">
        ${check(`il:${l.key}:included`, l.included, t(d.en, d.pl), t(d.hintEn, d.hintPl))}
        ${l.included ? `<div class="q-grid q-grid-install q-gap">
          ${field(t('Net, £', 'Netto, £'), num(`il:${l.key}:amount`, l.amount))}
          ${field(t('Detail', 'Doprecyzowanie'), text(`il:${l.key}:detail`, l.detail), t('If blank, the quote keeps the short sentence beside it.', 'Jeśli puste, w ofercie zostaje krótkie zdanie obok.'))}
        </div>` : ''}
      </div>`; }).join('')}
      ${field(t('What the client needs to prepare', 'Co klient ma przygotować'), area('q:siteNotes', q.siteNotes, '', 2))}
      ${field(t('Further exclusions', 'Dodatkowe wyłączenia'), area('q:exclusions', q.exclusions, '', 2), t('The standard exclusion — decoration and structural work — is added on its own.', 'Standardowe wyłączenie — malowanie i konstrukcja — dopisze się samo.'))}
      <div class="q-grid">
        ${field(t('Programme', 'Program'), text('q:programme', q.programme, t('One visit, two days', 'Jedna wizyta, dwa dni')))}
        ${field(t('Certificate', 'Certyfikat'), text('q:certification', q.certification, t('FENSA, if it applies', 'FENSA, jeśli dotyczy')))}
      </div>
    </div>`}`;
}

function paySumLine(q) {
  return payOk(q) ? `<p class="hint" id="q-paysum">${t('Stages add up to 100%.', 'Suma etapów: 100%.')}</p>` : `<p class="q-warn" id="q-paysum">${t(`The stages add up to ${paySum(q)}%. It should be 100%.`, `Suma etapów to ${paySum(q)}%. Powinno być 100%.`)}</p>`;
}
function stepTerms(q) {
  const pl = q.docLang === 'pl', L = q.docLang;
  const tot = totals(q), amounts = payAmounts(q.payments, q.paymentOnGross ? tot.gross : tot.net, payOk(q));
  return `${head(t('04 / terms', '04 / warunki'), t('Payment and timing', 'Płatność i terminy'), t('Three stages on delivery: deposit, delivery, balance. Write the sentences in the language of the quote.', 'Trzy etapy przy dostawie: zaliczka, dostawa, reszta. Zdania wpisujesz w języku oferty.'))}
    <div class="q-grid">
      ${field(t('Discount, net £', 'Rabat, netto £'), num('q:discount', q.discount))}
      ${field(t('Survey and delivery, net £', 'Pomiar i dostawa, netto £'), num('q:surveyDelivery', q.surveyDelivery))}
      <div class="wide q-box">${`<label class="q-check"><input type="checkbox" data-act="vat" ${firm.vatRegistered ? 'checked' : ''}><span><strong>${t('VAT registered', 'Płatnik VAT')}</strong><small>${t('Off: the quote shows no VAT and never says “including VAT”. The amount is the amount to pay.', 'Wyłączone: w ofercie nie ma VAT i nie pisze „razem z VAT”. Kwota jest kwotą do zapłaty.')}</small></span></label>`}</div>
      ${firm.vatRegistered ? field(t('VAT, %', 'VAT, %'), num('q:vatRate', q.vatRate)) : ''}
      ${field(pl ? 'Czas realizacji' : 'Lead time', text('q:leadTime', q.leadTime, pl ? '10–12 tygodni od podpisanych rysunków' : '10–12 weeks from the drawings you sign'))}
      ${field(pl ? 'Gwarancja' : 'Guarantee', text('q:guarantee', q.guarantee, pl ? 'Według systemu, z instrukcją pielęgnacji' : 'As stated for the system, with the care notes'), '', 'wide')}
      ${field(pl ? 'Uwaga widoczna w ofercie' : 'Note on the estimate', area('q:projectNotes', q.projectNotes, '', 2), '', 'wide')}
      ${field(pl ? 'Zdanie o warunkach' : 'Terms sentence', area('q:termsNote', q.termsNote, '', 2), t('Blank: the quote keeps the sentence that we make the system in this quote and that time runs from the signed drawings.', 'Puste: w ofercie zostaje zdanie, że robimy system z tej wyceny, a czas liczy się od podpisanych rysunków.'), 'wide')}
    </div>
    <div class="q-subrow"><h3 class="q-sub">${t('Payment stages', 'Etapy płatności')}</h3>${q.vatRate > 0 ? check('q:paymentOnGross', q.paymentOnGross, t('Of the gross', 'Od brutto')) : ''}</div>
    ${paySumLine(q)}
    <div class="q-stack q-gap">${q.payments.map((s, i) => `<div class="q-box q-pay" data-sid="${esc(s.id)}">
      ${field(t('Name', 'Nazwa'), text(`pay:${s.id}:label`, s.label, stageName({ ...s, label: '' }, L)))}
      ${field('%', num(`pay:${s.id}:percent`, s.percent))}
      ${field(t('When', 'Kiedy'), text(`pay:${s.id}:trigger`, s.trigger, stageWhen({ ...s, trigger: '' }, L)))}
      <div class="q-pay-end"><span class="q-pay-amt" data-pay-amt="${i}">${esc(money(amounts[i] ?? 0, L))}</span><button type="button" class="q-icon" data-act="del-stage" aria-label="${t('Remove stage', 'Usuń etap')}" ${q.payments.length <= 1 ? 'disabled' : ''}>${ICON.bin}</button></div>
    </div>`).join('')}</div>
    <button type="button" class="btn btn-sm btn-ghost q-gap" data-act="add-stage">+ ${t('Add a stage', 'Dodaj etap')}</button>
    <details class="q-firm q-box">
      <summary>${t('Company and bank details — shared by all quotes', 'Dane firmy i przelew — wspólne dla wszystkich ofert')}</summary>
      <div class="q-grid q-gap">
        ${field(t('Account name', 'Odbiorca przelewu'), text('firm:accountName', firm.accountName))}
        ${field('Bank', text('firm:bankName', firm.bankName))}
        ${field('Sort code', text('firm:sortCode', firm.sortCode, '00-00-00'))}
        ${field(t('Account number', 'Numer konta'), text('firm:accountNumber', firm.accountNumber))}
        ${field(t('Legal entity', 'Podmiot prawny'), text('firm:legalEntity', firm.legalEntity))}
        ${field(t('Company no.', 'Nr spółki'), text('firm:companyNo', firm.companyNo))}
        ${field(t('VAT no.', 'Nr VAT'), text('firm:vatNo', firm.vatNo))}
        ${field(t('Email on the quote', 'E-mail na ofercie'), text('firm:replyEmail', firm.replyEmail))}
        ${field(t('Phone on the quote', 'Telefon na ofercie'), text('firm:phone', firm.phone))}
        ${field(t('Default “prepared by”', 'Domyślne „przygotował”'), text('firm:preparedBy', firm.preparedBy), t('New quotes take this name. This quote has its own field in the Client step.', 'Nowe oferty biorą to imię. Ta oferta ma własne pole w kroku Klient.'))}
      </div>
    </details>`;
}

function summary(q) {
  const tot = totals(q), L = q.docLang;
  const li = (label, value) => `<li><span>${esc(label)}</span><span>${esc(value)}</span></li>`;
  return `<p class="q-sum-k">${q.vatRate > 0 ? t('TOTAL INC. VAT', 'RAZEM Z VAT') : t('TOTAL', 'RAZEM')}</p>
    <p class="q-sum-v">${esc(money(q.vatRate > 0 ? tot.gross : tot.net, L))}</p>
    <ul class="q-sum-list">
      ${li(t('Products', 'Produkty'), money(tot.productNet, L))}
      ${tot.discount ? li(t('Discount', 'Rabat'), `− ${money(Math.abs(tot.discount), L)}`) : ''}
      ${q.installMode === 'included' ? li(t('Installation', 'Montaż'), money(tot.installNet, L)) : ''}
      ${q.installMode === 'separate' ? li(t('Installation separate', 'Montaż osobno'), money(tot.installGross, L)) : ''}
      ${q.vatRate > 0 ? li(t('Net', 'Netto'), money(tot.net, L)) : ''}
    </ul>
    ${payOk(q) ? '' : `<p class="q-warn">${t(`Payments: ${paySum(q)}%, not 100%.`, `Płatności: ${paySum(q)}%, a nie 100%.`)}</p>`}
    ${q.internalNote.trim() ? `<p class="q-sum-note">${esc(q.internalNote.trim())}</p>` : ''}`;
}

// ---------- pages ----------
function listPage(nav) {
  const sorted = [...quotes].sort((a, b) => b.updatedAt - a.updatedAt);
  return `<div class="container section-tight q-list-page">
    <div class="dash-head"><div><span class="eyebrow">${t('Internal', 'Wewnętrzne')}</span><h1 class="app-h1">${t('Quotes', 'Oferty')}</h1></div></div>
    <div class="board-tools">${nav}</div>
    <p class="q-intro">${t('The same offer as on the website. Aluminium, timber, PVC or timber-aluminium. The client sees the system on every line and one total. Empty fields are left out.', 'Ta sama oferta co na stronie. Aluminium, drewno, PVC albo drewno z aluminium na zewnątrz. Klient widzi system przy każdej pozycji i jedną sumę. Puste pola nie wchodzą.')}</p>
    <div class="btn-row"><button type="button" class="btn" data-act="new">+ ${t('New quote', 'Nowa oferta')}</button><button type="button" class="btn btn-ghost" data-act="sample">${t('See an example', 'Zobacz na przykładzie')}</button></div>
    <p class="note q-gap">${store.mode === 'demo' ? t('Demo mode: quotes stay in this browser.', 'Tryb demo: oferty zostają w tej przeglądarce.') : t('Saved for the whole team. Nothing is sent on its own: print the quote or save it as PDF.', 'Zapisuje się dla całego zespołu. Nic nie wysyła się samo: wydrukuj ofertę albo zapisz ją jako PDF.')}</p>
    <h2 class="q-sub">${t('Saved', 'Zapisane')}</h2>
    ${sorted.length ? `<ul class="q-list">${sorted.map((q) => { const tot = totals(q); return `<li class="q-item" data-qid="${esc(q.id)}">
      <a class="q-item-open" href="#/quotes/${esc(q.id)}"><span class="q-item-head"><span class="q-item-name">${esc(q.customerName.trim() || t('Untitled', 'Bez nazwy'))}</span><span class="q-item-total">${esc(money(q.vatRate > 0 ? tot.gross : tot.net, q.docLang))}</span></span>
      <span class="q-item-meta">${esc(q.reference)} · ${esc(longDate(q.date, LANG))} · ${esc(scopeShort(q))} · ${q.docLang === 'pl' ? 'PL' : 'EN'}</span>
      <span class="q-item-meta q-item-hub">${statusTag(q)}${metaOf(q).hubspot_deal_id ? ` ${esc(metaOf(q).hubspot_deal_name || `#${metaOf(q).hubspot_deal_id}`)}` : ''}${needsChoice(q) ? ` · <span class="q-warn">${t('HubSpot: accepted — which quote?', 'HubSpot: przyjęta — która oferta?')}</span>` : ''}</span></a>
      <div class="btn-row q-gap"><button type="button" class="btn btn-sm btn-ghost" data-act="dup">${t('Duplicate', 'Duplikuj')}</button>${sendsOf(q).length ? `<span class="hint">${t('Sent quotes are kept.', 'Wysłanych ofert się nie usuwa.')}</span>` : pendingDelete === q.id
        ? `<button type="button" class="btn btn-sm" data-act="del-yes">${t('Delete for good', 'Usuń na pewno')}</button><button type="button" class="btn btn-sm btn-ghost" data-act="del-no">${t('Keep it', 'Zostaw')}</button>`
        : `<button type="button" class="btn btn-sm btn-ghost" data-act="del-ask">${t('Delete', 'Usuń')}</button>`}</div>
    </li>`; }).join('')}</ul>` : `<p class="callout">${t('Nothing yet. A new quote, or the example of an extension in London.', 'Jeszcze nic. Nowa oferta albo przykład rozbudowy w Londynie.')}</p>`}
  </div>`;
}

function editorPage(q) {
  const i = STEPS.findIndex((s) => s.id === step);
  const tot = totals(q);
  const body = { client: stepClient, products: stepProducts, install: stepInstall, terms: stepTerms, offer: (x) => sendPanel(x) + estimate(x) }[step](q);
  return `<div class="container-wide section-tight q-desk">
    <div class="q-top no-print">
      <nav class="breadcrumb" aria-label="${t('Breadcrumb', 'Ścieżka')}"><ol><li><a href="#/">${t('Pipeline', 'Lejek')}</a></li><li><a href="#/quotes">${t('Quotes', 'Oferty')}</a></li><li aria-current="page" id="q-crumb">${esc(q.customerName.trim() || t('New quote', 'Nowa oferta'))}</li></ol></nav>
      <div class="btn-row">
        <div class="seg q-lang" role="group" aria-label="${t('Language of the quote for the client', 'Język oferty dla klienta')}">${['en', 'pl'].map((l) => `<button type="button" data-act="lang" data-v="${l}" aria-pressed="${q.docLang === l}" class="${q.docLang === l ? 'is-on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>
        <button type="button" class="btn btn-sm btn-ghost" data-act="print">${ICON.print}${t('Print', 'Drukuj')}</button>
      </div>
    </div>
    ${changedNote(q)}
    <div class="q-frame${step === 'offer' ? ' is-offer' : ''}">
      <nav class="q-steps no-print" aria-label="${t('Quote steps', 'Kroki oferty')}">${STEPS.map((s, n) => `<button type="button" class="q-step" data-act="step" data-v="${s.id}" ${s.id === step ? 'aria-current="step"' : ''}><span>${String(n + 1).padStart(2, '0')}</span>${t(s.en, s.pl)}</button>`).join('')}</nav>
      <div class="q-main">${body}</div>
      ${step === 'offer' ? '' : `<aside class="q-aside no-print" id="q-sum">${summary(q)}</aside>`}
    </div>
    <div class="q-foot no-print">
      <button type="button" class="btn btn-sm btn-ghost" data-act="prev" ${i === 0 ? 'disabled' : ''}>← ${t('Back', 'Wstecz')}</button>
      <p class="q-foot-total"><small>${q.vatRate > 0 ? t('Gross', 'Brutto') : t('Total', 'Razem')}</small><strong id="q-total">${esc(money(tot.gross, q.docLang))}</strong></p>
      ${step === 'offer' ? `<button type="button" class="btn btn-sm" data-act="print">${ICON.print}${t('Print', 'Drukuj')}</button>` : `<button type="button" class="btn btn-sm" data-act="next">${t('Next', 'Dalej')} →</button>`}
    </div>
  </div>`;
}

// Redraws the parts that depend on amounts while someone types, without touching the fields.
function live() {
  const q = current(); if (!q || !root) return;
  const tot = totals(q);
  const sum = root.querySelector('#q-sum'); if (sum) sum.innerHTML = summary(q);
  const total = root.querySelector('#q-total'); if (total) total.textContent = money(tot.gross, q.docLang);
  const crumb = root.querySelector('#q-crumb'); if (crumb) crumb.textContent = q.customerName.trim() || t('New quote', 'Nowa oferta');
  const ps = root.querySelector('#q-paysum'); if (ps) ps.outerHTML = paySumLine(q);
  const amounts = payAmounts(q.payments, q.paymentOnGross ? tot.gross : tot.net, payOk(q));
  $$('[data-pay-amt]', root).forEach((el) => { el.textContent = money(amounts[+el.dataset.payAmt] ?? 0, q.docLang); });
}

function draw() {
  const q = current();
  if (!q) return;
  root.innerHTML = editorPage(q);
  document.title = `${q.reference} · ${t('Quote', 'Oferta')} | CRM`;
}

// ---------- events (bound once on the CRM's #app) ----------
function setValue(el) {
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.t === 'num') {
    let c = el.value.replace(/[^\d.,]/g, '').replace(',', '.');
    if (c.split('.').length > 2) c = el.dataset.last ?? '';
    if (c !== el.value) el.value = c;
    el.dataset.last = c;
    v = c === '' || c === '.' ? 0 : Number.isFinite(Number(c)) ? Number(c) : 0;
  } else if (el.dataset.t === 'int') {
    const c = el.value.replace(/\D/g, '');
    if (c !== el.value) el.value = c;
    v = c === '' ? 0 : Number(c);
  }
  const [scope, a, b] = el.dataset.b.split(':');
  if (scope === 'firm') { firm[a] = v; firmDirty = true; later(); return; }
  const q = current(); if (!q) return;
  if (scope === 'q') q[a] = v;
  else if (scope === 'p') { const p = q.products.find((x) => x.id === a); if (p) p[b] = v; }
  else if (scope === 'il') { const l = q.installLines.find((x) => x.key === a); if (l) l[b] = v; }
  else if (scope === 'pay') { const s = q.payments.find((x) => x.id === a); if (s) s[b] = v; }
  touch(q);
}

async function act(btn) {
  const a = btn.dataset.act, v = btn.dataset.v;
  if (['new', 'sample', 'dup', 'del-ask', 'del-yes', 'del-no'].includes(a)) return listAct(a, btn);
  const q = current(); if (!q) return;
  if (/^(deal|send|st)-/.test(a)) return hubAct(a, v, q);
  const pid = btn.closest('[data-pid]')?.dataset.pid, sid = btn.closest('[data-sid]')?.dataset.sid;
  const i = STEPS.findIndex((s) => s.id === step);
  switch (a) {
    case 'step': step = v; break;
    case 'prev': step = STEPS[i - 1]?.id || 'client'; break;
    case 'next': step = STEPS[i + 1]?.id || 'offer'; break;
    case 'print': {
      // The browser names the PDF after the page title: Brick-and-Pane-<reference>-rev<nn>.pdf
      step = 'offer'; draw(); await flush();
      const title = document.title; document.title = pdfBase(q);
      addEventListener('afterprint', () => { document.title = title; }, { once: true });
      setTimeout(() => print(), 60); return;
    }
    case 'lang': q.docLang = v; break;
    case 'audience': q.audience = v; break;
    case 'mode': q.installMode = v; break;
    case 'valid30': q.validUntil = addDays(q.date || today(), 30); break;
    case 'add-item': q.products.push(newProduct()); break;
    case 'del-item': q.products = q.products.filter((p) => p.id !== pid); break;
    case 'up': case 'down': {
      const from = q.products.findIndex((p) => p.id === pid), to = from + (a === 'up' ? -1 : 1);
      if (from < 0 || to < 0 || to >= q.products.length) return;
      const [p] = q.products.splice(from, 1); q.products.splice(to, 0, p); break;
    }
    case 'spec': { const p = q.products.find((x) => x.id === pid); if (p) p.showSpec = !p.showSpec; break; }
    case 'add-stage': q.payments.push({ id: uid(), key: 'custom', percent: 0, label: '', trigger: '' }); break;
    case 'del-stage': if (q.payments.length > 1) q.payments = q.payments.filter((s) => s.id !== sid); break;
    default: return;
  }
  touch(q);
  const y = scrollY; draw();
  if (['step', 'prev', 'next'].includes(a)) scrollTo(0, 0); else scrollTo(0, y);
}

// Fills only empty fields: what the team typed stays.
function fillFromContact(q, c) {
  if (!c) return [];
  const pairs = [['customerName', c.name], ['email', c.email], ['phone', c.phone], ['billingAddress', c.address], ['postcode', c.postcode]];
  const done = pairs.filter(([k, v]) => v && !String(q[k] ?? '').trim()).map(([k, v]) => { q[k] = v; return k; });
  if (done.length) touch(q);
  return done;
}
const filledMsg = (done) => (done.length ? t(`Filled from HubSpot: ${done.length} empty field(s).`, `Uzupełniono z HubSpota puste pola: ${done.length}.`) : t('The client details were already filled in.', 'Dane klienta były już wpisane.'));
const hubError = (e) => (e?.code === 'scope' ? t('HubSpot refused: the private app is missing a permission (scope).', 'HubSpot odmówił: aplikacji prywatnej brakuje uprawnienia (scope).')
  : e?.code === 'no token' ? t('HubSpot is not configured (no token).', 'HubSpot nie jest skonfigurowany (brak tokenu).')
  : e?.code === 'staff only' ? t('Sign in again as staff.', 'Zaloguj się ponownie jako zespół.')
  : t(`HubSpot: ${e?.message || 'error'}`, `HubSpot: ${e?.message || 'błąd'}`));

async function hubAct(a, v, q) {
  const m = metaOf(q), redraw = () => { const y = scrollY; draw(); scrollTo(0, y); };
  try {
    if (a === 'deal-search') {
      search = { q: root.querySelector('#q-deal-q')?.value ?? '', results: null, busy: true, error: '' }; redraw();
      try { search.results = (await store.hubspot('search', { q: search.q })).deals || []; } catch (e) { search.error = hubError(e); }
      search.busy = false; redraw(); root.querySelector('#q-deal-q')?.focus(); return;
    }
    if (a === 'deal-pick') {
      const deal = search.results?.find((d) => d.id === v); if (!deal) return;
      await store.linkQuoteDeal(q.id, deal);
      setMeta(q.id, { hubspot_deal_id: deal.id, hubspot_deal_name: deal.name, hubspot_dealstage: deal.stage });
      deals.set(deal.id, { ...(deals.get(deal.id) || {}), deal });
      search = { q: '', results: null, busy: false, error: '' };
      toast(`${t('Pinned to the deal.', 'Przypięto do deala.')} ${filledMsg(fillFromContact(q, deal.contact))}`); redraw(); return;
    }
    if (a === 'deal-unlink') {
      if (sendsOf(q).length) return;
      await store.linkQuoteDeal(q.id, null); setMeta(q.id, { hubspot_deal_id: null, hubspot_deal_name: null, hubspot_dealstage: null }); redraw(); return;
    }
    if (a === 'deal-fill' || a === 'deal-files') {
      let info = deals.get(m.hubspot_deal_id);
      if (!info?.files || (a === 'deal-fill' && !info.deal)) {
        try { const r = await store.hubspot('deal', { deal_id: m.hubspot_deal_id }); info = { deal: r.deal, files: r.files || [], missing: r.missing || [] }; }
        catch (e) { info = { ...(info || {}), error: hubError(e) }; }
        deals.set(m.hubspot_deal_id, info);
        if (info.deal) { setMeta(q.id, { hubspot_deal_name: info.deal.name, hubspot_dealstage: info.deal.stage }); await store.linkQuoteDeal(q.id, info.deal); }
      }
      if (a === 'deal-fill') toast(info.deal ? filledMsg(fillFromContact(q, info.deal.contact)) : info.error);
      redraw(); return;
    }
    if (a === 'deal-file') {
      const { url } = await store.hubspot('file', { file_id: v });
      if (url) open(url, '_blank', 'noopener'); else toast(t('No file in demo mode.', 'W trybie demo nie ma pliku.'));
      return;
    }
    if (a === 'send-pdf') {
      const s = hub.sends.find((x) => x.id === v);
      const url = s?.pdf_path ? await store.quotePdfUrl(s.pdf_path) : null;
      if (url) open(url, '_blank', 'noopener'); else toast(t('No file in demo mode.', 'W trybie demo nie ma pliku.'));
      return;
    }
    if (a === 'st-accepted' || a === 'st-declined' || a === 'st-sent') {
      const status = a.slice(3);
      await store.setQuoteStatus(q.id, status); setMeta(q.id, { status, status_source: 'crm' });
      toast(t(`Status: ${statusName(status)}.`, `Status: ${statusName(status)}.`)); redraw(); return;
    }
    if (a === 'send-open') {
      const plan = sendPlan(q);
      if (plan.bump) {
        q.revision = nextRevision(plan.last.revision); touch(q);
        toast(t(`The quote changed since it was sent, so it is now revision ${q.revision}. Save the PDF with this number.`, `Oferta zmieniła się od wysłania, więc teraz to rewizja ${q.revision}. Zapisz PDF z tym numerem.`));
      }
      sendForm = { quoteId: q.id, file: null, error: '', busy: false }; redraw(); return;
    }
    if (a === 'send-cancel') { sendForm = null; redraw(); return; }
    if (a === 'send-retry') {
      const r = await store.retryQuoteSend(v);
      const s = hub.sends.find((x) => x.id === v);
      if (s) Object.assign(s, { hubspot_note_id: r.hubspot_note_id ?? s.hubspot_note_id, hubspot_error: r.hubspot_error ?? null, hubspot_stage_moved: r.hubspot_stage_moved ?? s.hubspot_stage_moved });
      toast(r.hubspot_note_id ? t('Added to HubSpot.', 'Dodano do HubSpota.') : r.result === 'skipped' ? t('Already being sent. Check again in a minute.', 'Już się wysyła. Sprawdź za minutę.') : hubError({ message: r.hubspot_error }));
      redraw(); return;
    }
    if (a === 'send-go') return await sendGo(q, redraw);
  } catch (e) { toast(hubError(e)); }
}

async function sendGo(q, redraw) {
  const f = sendForm; if (!f || f.busy) return;
  const m = metaOf(q), plan = sendPlan(q);
  const fail = (msg) => { f.error = msg; redraw(); };
  if (!m.hubspot_deal_id) return fail(t('Pin the quote to a HubSpot deal first.', 'Najpierw przypnij ofertę do deala w HubSpocie.'));
  // Changed after the form opened: the number must move first, and the PDF be saved again with it.
  if (plan.bump) { q.revision = nextRevision(plan.last.revision); touch(q); return fail(t(`The quote changed, so it is now revision ${q.revision}. Save the PDF again with this number and choose it.`, `Oferta się zmieniła, więc teraz to rewizja ${q.revision}. Zapisz PDF jeszcze raz z tym numerem i wybierz go.`)); }
  if (!f.file) return fail(t('Choose the PDF you sent to the client.', 'Wybierz PDF wysłany do klienta.'));
  if (!/\.pdf$/i.test(f.file.name) && f.file.type !== 'application/pdf') return fail(t('This is not a PDF.', 'To nie jest PDF.'));
  if (f.file.size > MAX_PDF) return fail(t('The PDF is over 10 MB.', 'PDF ma ponad 10 MB.'));
  if (!f.file.name.toLowerCase().includes(q.reference.toLowerCase()) && !root.querySelector('#q-send-sure')?.checked) return fail(t(`Tick that this is the PDF of ${q.reference}.`, `Zaznacz, że to PDF oferty ${q.reference}.`));
  const sentOn = root.querySelector('#q-send-date')?.value || today();
  f.busy = true; f.error = ''; redraw();
  try {
    await flush();
    const tot = totals(q);
    const res = await store.sendQuote({ quoteId: q.id, dealId: m.hubspot_deal_id, reference: q.reference, revision: q.revision.trim() || '00', kind: plan.kind, total: q.vatRate > 0 ? tot.gross : tot.net, vatRate: q.vatRate, file: f.file, sentOn, snapshot: JSON.parse(JSON.stringify(q)) });
    hub.sends.unshift(res);
    const keep = ['accepted', 'declined'].includes(m.status);
    setMeta(q.id, { status: keep ? m.status : 'sent', status_source: keep ? m.status_source : 'crm', hubspot_dealstage: res.hubspot_stage_moved ? 'presentationscheduled' : m.hubspot_dealstage });
    sendForm = null;
    toast(res.hubspot_note_id
      ? (res.hubspot_error ? t(`Saved and in HubSpot, but: ${res.hubspot_error}`, `Zapisane i w HubSpocie, ale: ${res.hubspot_error}`) : t('Saved. The note with the PDF is on the HubSpot deal.', 'Zapisane. Notatka z PDF jest na dealu w HubSpocie.'))
      : t('Saved. HubSpot did not answer; it will be retried within 15 minutes.', 'Zapisane. HubSpot nie odpowiedział; ponowimy w ciągu 15 minut.'));
    redraw();
  } catch (e) { f.busy = false; fail(hubError(e)); }
}

async function listAct(a, btn) {
  const id = btn.closest('[data-qid]')?.dataset.qid;
  try {
    if (a === 'new' || a === 'sample') {
      const q = a === 'sample' ? sampleQuote(quotes, firm) : newQuote(quotes, firm);
      await store.saveQuote(q);
      quotes.unshift(q);
      location.hash = `#/quotes/${q.id}`;
      return;
    }
    if (a === 'dup') {
      const src = quotes.find((q) => q.id === id); if (!src) return;
      const copy = JSON.parse(JSON.stringify(src));
      Object.assign(copy, { id: uid(), reference: nextRef(quotes), revision: '00', updatedAt: Date.now() });
      copy.products.forEach((p) => { p.id = uid(); }); copy.payments.forEach((s) => { s.id = uid(); });
      await store.saveQuote(copy); quotes.unshift(copy);
      // A copy is a separate quote (say, timber beside aluminium): it stays on the same deal, with its own number.
      const m = metaOf(src);
      if (hub.on && m.hubspot_deal_id) {
        const deal = { id: m.hubspot_deal_id, name: m.hubspot_deal_name, stage: m.hubspot_dealstage };
        await store.linkQuoteDeal(copy.id, deal);
        setMeta(copy.id, { hubspot_deal_id: deal.id, hubspot_deal_name: deal.name, hubspot_dealstage: deal.stage });
      }
      toast(m.hubspot_deal_id && hub.on
        ? t(`Copied as ${copy.reference}, on the same HubSpot deal.`, `Skopiowano jako ${copy.reference}, na ten sam deal w HubSpocie.`)
        : t(`Copied as ${copy.reference}.`, `Skopiowano jako ${copy.reference}.`));
    }
    if (a === 'del-ask') pendingDelete = id;
    if (a === 'del-no') pendingDelete = null;
    if (a === 'del-yes') {
      dirty.delete(id);
      await store.deleteQuote(id);
      quotes = quotes.filter((q) => q.id !== id); pendingDelete = null;
      toast(t('Quote deleted.', 'Oferta usunięta.'));
    }
    root.innerHTML = listPage(root.dataset.nav || '');
  } catch (e) { toast(e.message); }
}

function bind(app) {
  if (app.dataset.quotesBound) return;
  app.dataset.quotesBound = '1';
  const inDesk = (el) => el.closest('.q-desk, .q-list-page');
  app.addEventListener('input', (e) => { const el = e.target; if (el.dataset?.b && inDesk(el) && el.type !== 'checkbox' && el.tagName !== 'SELECT') { setValue(el); live(); } });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'q-deal-q') { e.preventDefault(); const q = current(); if (q) hubAct('deal-search', '', q); }
  });
  app.addEventListener('change', (e) => {
    const el = e.target; if (!inDesk(el)) return;
    if (el.id === 'q-send-file') { if (sendForm) { sendForm.file = el.files?.[0] || null; sendForm.error = ''; const y = scrollY; draw(); scrollTo(0, y); } return; }
    if (el.dataset.act === 'vat') {
      const q = current(); firm.vatRegistered = el.checked; firmDirty = true;
      if (q) { q.vatRate = el.checked ? (q.vatRate > 0 ? q.vatRate : 20) : 0; touch(q); } else later();
      draw(); return;
    }
    if (!el.dataset.b) return;
    if (el.dataset.t === 'int' && !(Number(el.value) >= 1)) el.value = '1';
    if (el.type === 'checkbox' || el.tagName === 'SELECT' || el.dataset.t === 'int') { setValue(el); if (el.dataset.re !== undefined) { const y = scrollY; draw(); scrollTo(0, y); } else live(); }
  });
  app.addEventListener('click', (e) => { const btn = e.target.closest('[data-act]'); if (btn && btn.tagName === 'BUTTON' && inDesk(btn)) act(btn); });
}

// Entry point from admin.js: #/quotes (list) and #/quotes/<id> (editor). `nav` is the CRM's view switch.
export async function quotesView(app, id, nav = '') {
  root = app; bind(app);
  app.dataset.nav = nav;
  if (!id) {
    await flush();
    await load();
    openId = null;
    document.title = `${t('Quotes', 'Oferty')} | CRM`;
    app.innerHTML = listPage(nav);
    return;
  }
  if (!quotes || !quotes.some((q) => q.id === id)) { await flush(); await load(); }
  const q = quotes.find((x) => x.id === id);
  if (!q) { app.innerHTML = `<div class="container section-tight"><p class="callout">${t('This quote no longer exists.', 'Tej oferty już nie ma.')} <a href="#/quotes">${t('Back to quotes', 'Wróć do ofert')}</a></p></div>`; return; }
  // Opening a quote: a finished one shows the estimate, anything else starts at the client step (as in the Grok desk).
  if (openId !== id) { openId = id; step = q.customerName.trim() && q.products.length ? 'offer' : 'client'; search = { q: '', results: null, busy: false, error: '' }; sendForm = null; }
  draw();
}
