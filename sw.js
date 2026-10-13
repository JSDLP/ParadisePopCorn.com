// Paradise Pop Corn — muestra offline.html cuando no hay internet
const CACHE = 'paradise-offline-v1';
const OFFLINE = './offline.html';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('paradise-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Páginas: siempre intenta internet primero; si falla, muestra la pantalla de Pops
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.open(CACHE).then((c) => c.match(OFFLINE)))
    );
    return;
  }

  // Tipografía Bricolage: se guarda para que también salga sin internet
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req).then((res) => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
  }
});
