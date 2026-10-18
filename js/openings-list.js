// The visitor's list of openings, built on product pages and in the quote form before any account exists.
// It lives in this browser only: the quote form sends it with the enquiry, the portal picks it up after sign-in.
const KEY = 'bp-openings-list';

export const readList = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
export const writeList = (list) => {
  try { if (list.length) localStorage.setItem(KEY, JSON.stringify(list)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
};
export const clearList = () => writeList([]);

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
