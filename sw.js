/* Rocky — офлайн-работа и мгновенное открытие.
   Версию задаёт index.html (sw.js?v=…): новая версия — новый кэш, старый удаляется. */
const VERSION = new URL(location).searchParams.get('v') || 'dev';
const CACHE = 'rocky-' + VERSION;
const FILES = [
  './', 'manifest.webmanifest', 'icons/icon-192.png',
  'img/rock-neutral.webp', 'img/rock-happy.webp', 'img/rock-sleep.webp', 'img/rock-notes.webp',
  'img/mountain.webp', 'img/pebble.webp',
  'img/river-morning.webp', 'img/river-late.webp', 'img/river-day.webp', 'img/river-evening.webp', 'img/river-night.webp',
];
const APP_PAGE = new URL('./', location).pathname;

self.addEventListener('install', (e) => {
  // cache: 'reload' — строго с сервера, а не из HTTP-кэша браузера (там могут лежать файлы прошлой версии)
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // страница приложения — сразу из кэша; свежая копия тихо скачивается и откроется в следующий раз
  if (e.request.mode === 'navigate') {
    if (url.pathname !== APP_PAGE && url.pathname !== APP_PAGE + 'index.html') return; // чужие страницы не трогаем
    if (url.searchParams.has('v')) { // самообновление (?v=…): сначала сеть, чтобы открылась именно новая версия
      e.respondWith(fetch(url.href, { cache: 'no-cache' })
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); } return res; })
        .catch(() => caches.match('./')));
      return;
    }
    e.respondWith(caches.open(CACHE).then(async (c) => {
      // по адресу, а не по самому запросу: запрос страницы (mode: navigate) нельзя пересобрать с настройками —
      // fetch молча падает, и кэш страницы никогда бы не обновлялся
      const fresh = fetch(url.href, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put('./', res.clone()); return res; });
      const cached = await c.match('./');
      if (!cached) return fresh;
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }));
    return;
  }
  // картинки и прочее — из кэша, чего нет — из сети
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
