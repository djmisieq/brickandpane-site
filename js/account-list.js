// A signed-in client's list of openings follows them between devices: a copy is kept on the account (migration 0012).
// The browser keeps the working copy (js/openings-list.js). supabase-js loads only for someone with a portal session
// in this browser, so other visitors fetch nothing.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './portal/config.js';
import { readList, writeList, nextRef } from './openings-list.js';

// supabase-js keeps the session under this key. No project configured (demo mode, tests): no account copy.
const SESSION = SUPABASE_URL && `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
// What this browser last saw on the account: tells an opening removed on another device from one not sent yet.
const SYNCED = 'bp-openings-synced';

export const hasSession = () => { try { return !!SESSION && !!localStorage.getItem(SESSION); } catch { return false; } };

let client = null;
// The portal passes its own client; public pages load the vendored build on first use.
export const useClient = (sb) => { client = Promise.resolve(sb); };
const getClient = () => client ||= new Promise((resolve, reject) => {
  if (self.supabase) { resolve(self.supabase); return; }
  const s = document.createElement('script');
  s.src = new URL('./vendor/supabase-js-2.45.4.js', import.meta.url).href;
  s.onload = () => resolve(self.supabase); s.onerror = reject;
  document.head.append(s);
}).then((lib) => lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { detectSessionInUrl: false } }));

const key = (o) => [o.system, o.width_mm, o.height_mm, o.config || ''].join('|');
const readSynced = (uid) => {
  try { const v = JSON.parse(localStorage.getItem(SYNCED) || 'null'); return v && v.uid === uid ? new Set(v.keys) : new Set(); } catch { return new Set(); }
};
const writeSynced = (uid, list) => { try { localStorage.setItem(SYNCED, JSON.stringify({ uid, keys: list.map(key) })); } catch { /* storage unavailable */ } };

const userId = async (sb) => (await sb.auth.getSession()).data.session?.user.id || null;

async function save(sb, uid) {
  const items = readList();
  const { error } = await sb.from('saved_lists').upsert({ user_id: uid, items, updated_at: new Date().toISOString() });
  if (!error) writeSynced(uid, items);
}

let timer = null;
let watching = false;
// Every change made in this browser goes to the account a moment later (several quick edits, one write).
const watch = () => {
  if (watching) return;
  watching = true;
  addEventListener('bp-list', (e) => {
    if (['account', 'storage'].includes(e.detail.source)) return;
    clearTimeout(timer);
    timer = setTimeout(() => getClient().then(async (sb) => { const uid = await userId(sb); if (uid) await save(sb, uid); }).catch(() => {}), 600);
  });
};

// Brings the account copy into this browser, then saves the result back. Returns how many openings came from the account.
// Openings on both stay; one added elsewhere is added here; one removed elsewhere (seen here before) is removed here.
export async function syncList() {
  const sb = await getClient();
  const uid = await userId(sb);
  if (!uid) return 0;
  watch();
  const { data, error } = await sb.from('saved_lists').select('items').eq('user_id', uid).maybeSingle();
  if (error) return 0;
  const remote = Array.isArray(data?.items) ? data.items : [];
  const seen = readSynced(uid);
  const there = new Set(remote.map(key));
  const local = readList();
  const here = new Set(local.map(key));
  const list = local.filter((o) => there.has(key(o)) || !seen.has(key(o)));
  let added = 0;
  remote.filter((o) => !here.has(key(o)) && !seen.has(key(o))).forEach((o) => {
    const copy = { ...o };
    if (!copy.ref || list.some((x) => x.ref === copy.ref)) copy.ref = nextRef(list, copy.system);
    list.push(copy); added += 1;
  });
  if (list.length !== local.length || added) writeList(list, 'account');
  await save(sb, uid).catch(() => {});
  return added;
}

// Public pages: only for a visitor with a portal session in this browser, once per tab.
export function startAccountList() {
  if (!hasSession()) return Promise.resolve(0);
  try { if (sessionStorage.getItem('bp-list-pulled')) { watch(); return Promise.resolve(0); } sessionStorage.setItem('bp-list-pulled', '1'); } catch { /* ignore */ }
  return syncList().catch(() => 0);
}

// Signing out leaves no account data behind on a shared computer: the list is on the account, so it can go.
export async function leaveAccountList() {
  clearTimeout(timer);
  try {
    const sb = await getClient(); const uid = await userId(sb);
    if (uid) await save(sb, uid);
  } catch { /* the account copy keeps what it had */ }
  try { localStorage.removeItem(SYNCED); sessionStorage.removeItem('bp-list-pulled'); } catch { /* ignore */ }
  writeList([], 'account');
}
