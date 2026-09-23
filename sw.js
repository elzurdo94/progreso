/* Progreso — service worker
   Estrategia: la página siempre se intenta bajar de la red primero (así tus
   cambios llegan al abrir la app con datos), y si no hay conexión se sirve
   la última copia guardada. El resto de archivos, al revés: primero caché.
   v2: nueva versión de la app (calendario, gráficas, peso corporal). */

const CACHE = 'progreso-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      // solo borra cachés antiguas de esta app (en github.io el origen se comparte con otras webs tuyas)
      .then(keys => Promise.all(keys.filter(k => k.startsWith('progreso-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const good = res => res && res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const isPage = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    // Red primero, pero si la red tarda más de 3 s (cobertura mala en el gimnasio) se abre la copia guardada
    const net = fetch(req).then(res => {
      if (good(res)) {
        const copy = res.clone();
        ev.waitUntil(caches.open(CACHE).then(c => c.put('./index.html', copy)));
      }
      return res;
    });
    const cached = () => caches.match('./index.html').then(r => r || caches.match('./'));
    ev.respondWith(new Promise(resolve => {
      let done = false;
      const fin = r => { if (!done && r) { done = true; resolve(r); } };
      const t = setTimeout(() => cached().then(fin), 3000);
      net.then(r => { clearTimeout(t); fin(r); },
        () => { clearTimeout(t); cached().then(r => { if (r) fin(r); else if (!done) { done = true; resolve(Response.error()); } }); });
    }));
    return;
  }

  ev.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (good(res)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
