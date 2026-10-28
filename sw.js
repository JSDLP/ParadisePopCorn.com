// Paradise Pop Corn — la página abre aunque no haya internet
// 1) Con internet: siempre muestra la versión más nueva y la guarda.
// 2) Sin internet: muestra la última versión guardada (con sus fotos).
const CACHE = 'paradise-v6';
const OFFLINE = './offline.html';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const CORE = [
  './', './index.html', './club.html', './pops.html', './ruleta.html', './historia-pops.html',
  OFFLINE, './manifest.json', './apple-touch-icon.png', './icon-192.png', './icon-512.png',
  './icon-maskable-192.png', './icon-maskable-512.png', './og-image.jpg', './fz-co-luces.webp'
];
const ASSET_RE = /(?:img-[0-9a-f]+|IMG_\d+|fz-[a-z-]+|icon-[a-z0-9-]+|apple-touch-icon)\.(?:webp|png|jpe?g)/g;
const NET_TIMEOUT = 4000;

function put(cache, url, res) {
  if (res && res.ok && !res.redirected) return cache.put(url, res.clone()).catch(() => {});
}

// Guarda una lista de archivos uno por uno (si alguno falla, los demás sí se guardan)
function saveAll(cache, urls) {
  return Promise.all(urls.map((u) =>
    fetch(new Request(u, { cache: 'reload' })).then((r) => put(cache, u, r)).catch(() => {})
  ));
}

// Lee las páginas y guarda todas las fotos que usan
function saveAssetsOf(cache, pages) {
  return Promise.all(pages.map((p) =>
    cache.match(p).then((r) => (r ? r.text() : '')).then((html) => {
      const found = [...new Set((html.match(ASSET_RE) || []))].map((f) => './' + f);
      return saveAll(cache, found);
    }).catch(() => {})
  ));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => saveAll(cache, CORE).then(() => saveAssetsOf(cache, ['./index.html', './club.html'])))
      .then(() => self.skipWaiting())
  );
});

// La página le pasa la lista de sus fotos para guardarlas todas
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.t !== 'save' || !Array.isArray(d.u)) return;
  const urls = [...new Set(d.u)].filter((u) => u.startsWith(self.location.origin)).slice(0, 300);
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((u) =>
    cache.match(u, { ignoreSearch: true }).then((hit) => hit || fetch(u).then((r) => put(cache, u, r)).catch(() => {}))
  ))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('paradise-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
}

// Página: intenta internet (versión más nueva). Si no hay o tarda mucho, usa la guardada.
function page(event) {
  const req = event.request;
  const key = cacheKey(req.url);
  const net = fetch(req, { cache: 'no-cache' }).catch(() => fetch(req));
  const saved = net.then((res) => {
    if (res && res.ok && !res.redirected) {
      return caches.open(CACHE).then((c) => c.put(key, res.clone()).then(() => {
        if (/\/(index|club)\.html$/.test(key)) return saveAssetsOf(c, [key]);
      })).catch(() => {});
    }
  }).catch(() => {});
  event.waitUntil(saved);

  const fromCache = () => caches.open(CACHE).then((c) => c.match(key)).then((hit) => hit || caches.match(OFFLINE));
  const timeout = new Promise((resolve) => setTimeout(resolve, NET_TIMEOUT));

  return Promise.race([net.then((r) => r || Promise.reject()), timeout.then(() => Promise.reject())])
    .catch(() => fromCache().then((hit) => hit || net))
    .catch(() => caches.match(OFFLINE));
}

// Fotos y archivos: muestra la copia guardada al instante y la actualiza por detrás
function staleWhileRevalidate(event) {
  const req = event.request;
  return caches.open(CACHE).then((cache) =>
    cache.match(req, { ignoreSearch: true }).then((hit) => {
      const update = fetch(req).then((res) => { put(cache, req, res); return res; });
      if (hit) {
        event.waitUntil(update.catch(() => {}));
        return hit;
      }
      return update;
    })
  );
}

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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(page(event));
    return;
  }

  if (url.origin === self.location.origin && /\.(webp|png|jpe?g|json|svg|ico|js|css|html)$/.test(url.pathname) && !/\/sw\.js$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event).catch(() => fetch(req)));
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req).catch(() => caches.match(req)));
  }
});
