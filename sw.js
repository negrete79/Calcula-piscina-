/* sw.js — Piscina Inteligente v1 */
'use strict';
const VERSION = 'v1.4.0';                    // ↑ bump a cada release
const SHELL = 'shell-' + VERSION;
const APIS  = 'api-' + VERSION;
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(SHELL_FILES);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => (k.startsWith('shell-') || k.startsWith('api-')) && !k.endsWith(VERSION))
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* 1) Navegação: network-first com fallback offline para o shell */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  /* 2) APIs de clima/geo: network-first, serve último dado real offline */
  if (url.hostname.includes('open-meteo.com') || url.hostname.includes('ipwho.is')) {
    e.respondWith((async () => {
      const c = await caches.open(APIS);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) c.put(req, fresh.clone());
        return fresh;
      } catch {
        const hit = await c.match(req);
        if (hit) return hit;
        throw new Error('offline-sem-cache');   // o app cai no fallback simulado
      }
    })());
    return;
  }

  /* 3) Demais assets (fontes, ícones): stale-while-revalidate */
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  })());
});
