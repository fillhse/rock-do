/* rock do — service worker: офлайн-работа и быстрые обновления.
   При изменении файлов приложения увеличивай VERSION — старый кэш удалится. */
const VERSION = 'v10'; // то же значение — в BUILD в index.html
const CACHE = 'rockdo-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', // большие иконки нужны только при установке — браузер возьмёт их сам
  'img/rock-happy.webp', 'img/rock-neutral.webp', 'img/rock-notes.webp', 'img/rock-sad.webp', 'img/rock-sleep.webp',
  'img/mountain.webp', 'img/pebble.webp',
  'img/river-morning.webp', 'img/river-late.webp', 'img/river-day.webp', 'img/river-evening.webp', 'img/river-night.webp',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' — строго с сервера: иначе из HTTP-кэша браузера (у GitHub 10 минут)
  // в кэш новой версии попадают файлы предыдущей
  const fresh = ASSETS.map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rockdo-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // страница — сразу из кэша (открытие не ждёт сеть), а свежая версия тихо скачивается в кэш
  // и покажется при следующем открытии. Нет копии в кэше (самый первый запуск) — из сети.
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const cached = await c.match('index.html');
      // no-cache: сверить с GitHub, а не взять HTTP-кэш браузера (у GitHub он живёт 10 минут)
      const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) c.put('index.html', res.clone());
        return res;
      });
      if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
      return fresh;
    }));
    return;
  }
  // картинки и прочее — из кэша, с докачкой из сети
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
