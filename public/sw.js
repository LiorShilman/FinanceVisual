// A deliberately trivial service worker — it exists only to satisfy browsers' PWA
// "installability" checks (Chrome/Android in particular still gates the real standalone-mode
// "Install app" flow on having a registered worker with a fetch handler, not just a valid
// manifest). It does no caching and never intercepts a response, so every request behaves
// exactly as it would with no service worker at all.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // intentionally not calling event.respondWith — falls through to the network untouched.
});
