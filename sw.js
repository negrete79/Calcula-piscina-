/* =========================================================
   Piscina Inteligente v3.7.2 — Service Worker
   - CACHE novo a cada versão (força o celular a pegar o app atualizado)
   - Clima (Open-Meteo): NETWORK FIRST — rede primeiro,
     guarda a última previsão REAL e serve do cache se cair o sinal
   - Geolocalização (Nominatim / ipapi.co): sempre rede, nunca cache
   - App shell: navegação = rede primeiro com fallback offline;
     demais arquivos = cache primeiro
   ========================================================= */

const CACHE = 'poolcare-v3.7.2';   /* ★ suba esta versão a cada atualização do app */

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- instalação: pré-cacheia o que puder (sem falhar se faltar ícone) ---------- */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async a => {
      try {
        const r = await fetch(a);
        if (r && r.ok) await c.put(a, r);
      } catch (_) { /* arquivo ausente (ex: ícone ainda não gerado) — ignora */ }
    }));
    self.skipWaiting();
  })());
});

/* ---------- ativação: apaga caches de versões antigas ---------- */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------- estratégia de rede ---------- */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  /* 1) CLIMA — network first */
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r && r.ok) {
          const cl = r.clone();
          caches.open(CACHE).then(c => c.put(req, cl));
        }
        return r;
      } catch (_) {
        const hit = await caches.match(req);
        if (hit) return hit;
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  /* 2) GEOLOCALIZAÇÃO — sempre rede (dados pessoais, não cacheia) */
  if (url.hostname === 'nominatim.openstreetmap.org' || url.hostname === 'ipapi.co') return;

  /* 3) APP SHELL (mesma origem) */
  if (url.origin === location.origin) {

    /* navegação: rede primeiro, fallback para o index.html em cache */
    if (req.mode === 'navigate') {
      e.respondWith((async () => {
        try {
          const r = await fetch(req);
          if (r && r.ok) {
            const cl = r.clone();
            caches.open(CACHE).then(c => c.put('./index.html', cl));
          }
          return r;
        } catch (_) {
          const hit = await caches.match('./index.html');
          return hit || new Response('Offline', { status: 503 });
        }
      })());
      return;
    }

    /* demais arquivos: cache primeiro */
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && r.ok) {
          const cl = r.clone();
          caches.open(CACHE).then(c => c.put(req, cl));
        }
        return r;
      } catch (_) {
        return new Response('', { status: 504 });
      }
    })());
  }
});
