// Paradise Pop Corn — pantalla sin internet + fotos guardadas para abrir más rápido
const CACHE = 'paradise-v3';
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

function cacheFirst(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      });
    })
  );
}

// Página: intenta internet; si falla, lo intenta otra vez de forma distinta antes de mostrar a Pops
function page(req) {
  return fetch(req)
    .catch(() => fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }))
    .catch(() => caches.open(CACHE).then((c) => c.match(OFFLINE)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(page(req));
    return;
  }

  if (url.origin === self.location.origin && /\/img-[0-9a-f]+\.(webp|png|jpg)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req).catch(() => fetch(req)));
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req).catch(() => caches.match(req)));
  }
});
