/* rock do — service worker: офлайн-работа и быстрые обновления.
   При изменении файлов приложения увеличивай VERSION — старый кэш удалится. */
const VERSION = 'v8'; // то же значение — в BUILD в index.html
const CACHE = 'rockdo-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', // большие иконки нужны только при установке — браузер возьмёт их сам
  'img/rock-happy.webp', 'img/rock-neutral.webp', 'img/rock-notes.webp', 'img/rock-sad.webp', 'img/rock-sleep.webp',
  'img/mountain.webp', 'img/pebble.webp',
  'img/river-morning.webp', 'img/river-late.webp', 'img/river-day.webp', 'img/river-evening.webp', 'img/river-night.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rockdo-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // страница — сначала сеть (чтобы обновления приходили сразу), без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); }
        return res;
      })
      .catch(() => caches.match('index.html')));
    return;
  }
  // картинки и прочее — из кэша, с докачкой из сети
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
