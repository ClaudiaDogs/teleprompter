// Service worker: tiene in cache tutta l'app, così funziona anche offline.
// VERSION va cambiata a ogni pubblicazione (node tools/bump-version.mjs <versione>).
const VERSION = '0.3.1';
const CACHE = 'teleprompter-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/version.js', 'js/app.js', 'js/util.js', 'js/db.js', 'js/settings.js', 'js/panel.js',
  'js/importers.js', 'js/backup.js', 'js/library.js', 'js/editor.js', 'js/prompter.js',
  'js/link.js', 'js/remote.js',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'vendor/peerjs/peerjs.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('teleprompter-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Sul computer di sviluppo prima la rete (file sempre aggiornati), la cache solo offline.
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (DEV) {
      try { return await fetch(req, { cache: 'no-store' }); }
      catch { return (await cache.match(req, { ignoreSearch: true })) || new Response('Offline', { status: 503 }); }
    }
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
