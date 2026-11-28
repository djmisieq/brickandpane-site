// The CRM opens without a connection (top-CRM audit 28.11.2026). Network first, always: a page or script is taken
// from the network when it answers (so a deploy is seen at once) and kept; the kept copy is used only when the
// network does not answer. Only the CRM's own files: never the database, never the public pages' forms.
const CACHE = 'bp-crm-v1';
const OWN = /^\/(pl\/)?admin\.html$|^\/js\/|^\/css\/|^\/fonts\/|^\/img\/|^\/crm\.webmanifest$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || !OWN.test(u.pathname)) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || Response.error())));
});
