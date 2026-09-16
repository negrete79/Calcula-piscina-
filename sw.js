/* Piscina Inteligente v3.0 — Service Worker */
const CACHE = 'poolcare-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))) // não falha se faltar algum ícone
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API do clima: rede primeiro, guarda a última resposta, usa o cache se ficar sem sinal
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(
      fetch(req).then(res => {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache primeiro, atualiza por trás
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
        return res;
      }))
    );
  }
});
