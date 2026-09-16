/* ============================================================
   Piscina Inteligente — Service Worker
   Estratégias:
   - HTML (navegação): NETWORK-FIRST → o app sempre atualiza ao
     abrir com internet; se offline, cai para o cache.
   - APIs de clima (Open-Meteo / ipwho.is): NETWORK-FIRST com
     fallback para a última resposta em cache (offline real).
   - Estáticos (ícones/fontes): CACHE-FIRST → velocidade e
     funcionamento 100% offline.
   - skipWaiting + clients.claim → nova versão assume na hora.
   v5: sincronizado com o index.html v2.1 (Redutor de pH no
   teto + ATENÇÃO no sulfato). Nenhuma outra mudança — só o
   bump do nome do cache.
   ============================================================ */

const CACHE_NAME = 'poolcare-v16';

/* Pré-cache do shell (try/catch por arquivo: um faltando não trava o install) */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- INSTALL: pré-cache + assume a ativação ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[SW] Pré-cache falhou para:', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- ACTIVATE: limpa caches antigos + claim ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes
        .filter((n) => n !== CACHE_NAME && n !== CACHE_NAME + '-api')
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

/* ---------- FETCH: roteamento por tipo de requisição ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só intercepta GET (POST/PUT vão direto para a rede)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  const ehNavegacao =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  const ehApiClima =
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('ipwho.is');

  /* ===== HTML → NETWORK-FIRST ===== */
  if (ehNavegacao) {
    event.respondWith((async () => {
      try {
        const rede = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', rede.clone());
        return rede;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match(req, { ignoreSearch: true })) ||
          (await cache.match('./index.html')) ||
          Response.error()
        );
      }
    })());
    return;
  }

  /* ===== APIs DE CLIMA → NETWORK-FIRST com fallback de cache =====
     Offline: serve a última previsão real obtida. Sem cache,
     a falha propaga e o app cai na previsão simulada. */
  if (ehApiClima) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME + '-api');
      try {
        const rede = await fetch(req);
        if (rede.ok) cache.put(req, rede.clone());
        return rede;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  /* ===== ESTÁTICOS → CACHE-FIRST com atualização em segundo plano ===== */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req, { ignoreSearch: true });
    const rede = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || rede;
  })());
});
