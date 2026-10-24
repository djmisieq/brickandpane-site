// Files picked in the quote form stay in this browser (IndexedDB) until the form is sent,
// so a reload or a closed tab doesn't lose them. Nothing leaves the browser before "Send enquiry".
const DB = 'bp-quote-files', STORE = 'files', KEY = 'draft';

const open = () => new Promise((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const run = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
};

export const saveFiles = (files) => run('readwrite', (s) => (files.length ? s.put(files, KEY) : s.delete(KEY))).catch(() => {});
export const loadFiles = () => run('readonly', (s) => s.get(KEY)).then((v) => (Array.isArray(v) ? v.filter((f) => f instanceof File) : [])).catch(() => []);
export const clearFiles = () => saveFiles([]);
