// The visitor's list of openings, built on product pages and in the quote form before any account exists.
// It lives in this browser only: the quote form sends it with the enquiry, the portal picks it up after sign-in.
const KEY = 'bp-openings-list';

export const readList = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
// Every change is announced, so the header counter and the list panel stay in step with the page that changed it.
// `source` lets the page that made the change skip redrawing itself.
export const writeList = (list, source = '') => {
  try { if (list.length) localStorage.setItem(KEY, JSON.stringify(list)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  dispatchEvent(new CustomEvent('bp-list', { detail: { source } }));
};
export const clearList = () => writeList([]);
// Another tab changed the list.
addEventListener('storage', (e) => { if (e.key === KEY) dispatchEvent(new CustomEvent('bp-list', { detail: { source: 'storage' } })); });

// D01, D02 for doors, W01 for windows, G01 for glazed roofs and facades, as on a window schedule.
const prefix = (system) => (system === 'windows' ? 'W' : system === 'facades' || system === 'rooflights' ? 'G' : 'D');
export const nextRef = (list, system) => {
  const p = prefix(system);
  const used = new Set(list.map((o) => o.ref));
  let n = 1;
  while (used.has(`${p}${String(n).padStart(2, '0')}`)) n += 1;
  return `${p}${String(n).padStart(2, '0')}`;
};
export const addToList = (opening) => {
  const list = readList();
  const o = { qty: 1, material: '', note: '', ...opening };
  o.ref = o.ref || nextRef(list, o.system);
  list.push(o);
  writeList(list);
  return o;
};

/* A list travels in a link (?list=…), so an architect can pass it to the client without an account. */
const FIELDS = ['ref', 'system', 'material', 'width_mm', 'height_mm', 'qty', 'config', 'glazing', 'note'];
const SYSTEMS = ['lift-slide', 'sliding', 'bifold', 'hinged', 'windows', 'facades', 'rooflights'];
export const encodeList = (list) => {
  const json = JSON.stringify(list.map((o) => FIELDS.map((k) => o[k] ?? '')));
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
// Only known fields, known products and sane numbers get through: the link comes from outside the site.
export const decodeList = (code) => {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const rows = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!Array.isArray(rows)) return [];
    const num = (v, lo, hi) => (Number.isFinite(+v) && +v >= lo && +v <= hi ? Math.round(+v) : null);
    const str = (v, n) => String(v ?? '').slice(0, n);
    return rows.slice(0, 100).filter(Array.isArray).map((r) => Object.fromEntries(FIELDS.map((k, i) => [k, r[i]])))
      .filter((o) => SYSTEMS.includes(o.system))
      .map((o) => ({ ref: str(o.ref, 8), system: o.system, material: str(o.material, 12), width_mm: num(o.width_mm, 300, 30000), height_mm: num(o.height_mm, 300, 6000),
        qty: num(o.qty, 1, 999) || 1, config: str(o.config, 12), glazing: str(o.glazing, 4), note: str(o.note, 200) }));
  } catch { return []; }
};
// Adds the openings that aren't on the list yet; a clashing reference gets the next free one.
export const mergeIntoList = (incoming) => {
  const list = readList();
  const same = (a, b) => a.system === b.system && a.width_mm === b.width_mm && a.height_mm === b.height_mm && (a.config || '') === (b.config || '');
  let added = 0;
  incoming.forEach((o) => {
    if (list.some((x) => same(x, o))) return;
    if (!o.ref || list.some((x) => x.ref === o.ref)) o.ref = nextRef(list, o.system);
    list.push(o); added += 1;
  });
  if (added) writeList(list);
  return added;
};
