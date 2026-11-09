// Quote builder for staff (admin.html#/quotes, 06.11.2026): a copy of the team's offer desk built in Grok
// (wind-jolly-fern-cobalt.grok.me). Five steps — client, products, installation, terms — and the printable estimate.
// Quotes and the firm details shared by all quotes live in Supabase (migration 0025, staff only); in demo mode they
// stay in this browser. Nothing is sent anywhere: the team prints the estimate (or saves it as PDF) and sends it.
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
  interim: { en: 'Before delivery', pl: 'Przed dostawą', triggerEn: 'When the order is manufactured, before delivery', triggerPl: 'Gdy zamówienie jest wyprodukowane, przed dostawą' },
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
  const [list, settings] = await Promise.all([store.listQuotes(), store.getQuoteSettings()]);
  firm = normFirm(settings);
  quotes = list.flatMap((r) => { const q = normQuote(r, firm); return q ? [q] : []; });
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

// ---------- the five steps ----------
function stepClient(q) {
  const pl = q.docLang === 'pl';
  return `${head(t('01 / client', '01 / klient'), t('Who this quote is for', 'Dla kogo jest ta oferta'), t('Home, designer or site — the same as on the website. Then the address and the date. The language at the top is the language of the document.', 'Dom, projektant albo budowa — tak samo jak na stronie. Potem adres i termin. Język u góry jest językiem dokumentu.'))}
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
      <span class="q-item-meta">${esc(q.reference)} · ${esc(longDate(q.date, LANG))} · ${esc(scopeShort(q))} · ${q.docLang === 'pl' ? 'PL' : 'EN'}</span></a>
      <div class="btn-row q-gap"><button type="button" class="btn btn-sm btn-ghost" data-act="dup">${t('Duplicate', 'Duplikuj')}</button>${pendingDelete === q.id
        ? `<button type="button" class="btn btn-sm" data-act="del-yes">${t('Delete for good', 'Usuń na pewno')}</button><button type="button" class="btn btn-sm btn-ghost" data-act="del-no">${t('Keep it', 'Zostaw')}</button>`
        : `<button type="button" class="btn btn-sm btn-ghost" data-act="del-ask">${t('Delete', 'Usuń')}</button>`}</div>
    </li>`; }).join('')}</ul>` : `<p class="callout">${t('Nothing yet. A new quote, or the example of an extension in London.', 'Jeszcze nic. Nowa oferta albo przykład rozbudowy w Londynie.')}</p>`}
  </div>`;
}

function editorPage(q) {
  const i = STEPS.findIndex((s) => s.id === step);
  const tot = totals(q);
  const body = { client: stepClient, products: stepProducts, install: stepInstall, terms: stepTerms, offer: estimate }[step](q);
  return `<div class="container-wide section-tight q-desk">
    <div class="q-top no-print">
      <nav class="breadcrumb" aria-label="${t('Breadcrumb', 'Ścieżka')}"><ol><li><a href="#/">${t('Pipeline', 'Lejek')}</a></li><li><a href="#/quotes">${t('Quotes', 'Oferty')}</a></li><li aria-current="page" id="q-crumb">${esc(q.customerName.trim() || t('New quote', 'Nowa oferta'))}</li></ol></nav>
      <div class="btn-row">
        <div class="seg q-lang" role="group" aria-label="${t('Language of the quote for the client', 'Język oferty dla klienta')}">${['en', 'pl'].map((l) => `<button type="button" data-act="lang" data-v="${l}" aria-pressed="${q.docLang === l}" class="${q.docLang === l ? 'is-on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>
        <button type="button" class="btn btn-sm btn-ghost" data-act="print">${ICON.print}${t('Print', 'Drukuj')}</button>
      </div>
    </div>
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
  const pid = btn.closest('[data-pid]')?.dataset.pid, sid = btn.closest('[data-sid]')?.dataset.sid;
  const i = STEPS.findIndex((s) => s.id === step);
  switch (a) {
    case 'step': step = v; break;
    case 'prev': step = STEPS[i - 1]?.id || 'client'; break;
    case 'next': step = STEPS[i + 1]?.id || 'offer'; break;
    case 'print': step = 'offer'; draw(); await flush(); setTimeout(() => print(), 60); return;
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
      Object.assign(copy, { id: uid(), reference: nextRef(quotes), updatedAt: Date.now() });
      copy.products.forEach((p) => { p.id = uid(); }); copy.payments.forEach((s) => { s.id = uid(); });
      await store.saveQuote(copy); quotes.unshift(copy);
      toast(t(`Copied as ${copy.reference}.`, `Skopiowano jako ${copy.reference}.`));
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
  app.addEventListener('change', (e) => {
    const el = e.target; if (!inDesk(el)) return;
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
  if (openId !== id) { openId = id; step = q.customerName.trim() && q.products.length ? 'offer' : 'client'; }
  draw();
}
