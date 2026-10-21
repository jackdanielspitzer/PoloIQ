// Minimal service worker — mainly here so Chrome/Edge treat PoloIQ as installable.
// Network-first for the app's own files only (this app changes often), falling back to the last
// cached copy when the network fails. Database requests (Supabase) and everything else on other
// sites are never touched or cached: shared data must always come live from the database.
const CACHE_NAME = 'poloiq-shell-v2';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // database, CDN, etc.: straight to the network
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
