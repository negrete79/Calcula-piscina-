/* Piscina Inteligente v3.4 — Service Worker (network first no clima) */
const CACHE = 'poolcare-v3.4-final';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async a => {
      try { const r = await fetch(a); if (r && r.ok) await c.put(a, r); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* CLIMA: network first — rede primeiro, guarda a última real, cache se cair o sinal */
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r && r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
        return r;
      } catch (_) {
        const hit = await caches.match(req);
        if (hit) return hit;
        return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  /* Geolocalização: sempre rede, nunca cache */
  if (url.hostname === 'nominatim.openstreetmap.org' || url.hostname === 'ipapi.co' || url.hostname === 'api.bigdatacloud.net') return;

  /* App shell: navegação = network first com fallback offline; demais = cache first */
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith((async () => {
        try {
          const r = await fetch(req);
          if (r && r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cl)); }
          return r;
        } catch (_) {
          const hit = await caches.match('./index.html');
          return hit || new Response('Offline', { status: 503 });
        }
      })());
      return;
    }
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
        return r;
      } catch (_) { return new Response('', { status: 504 }); }
    })());
  }
});
