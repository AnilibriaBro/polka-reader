// Создаётся при сборке (vite.config.ts). Не редактировать вручную.
const CACHE = 'polka-f28f061152de';
const FILES = ["./","assets/sql-wasm-C1U8OeUW.wasm","assets/literata-cyrillic-ext-opsz-italic-5yUt4G_9.woff2","assets/literata-vietnamese-opsz-italic-BdcrZMcO.woff2","assets/literata-greek-opsz-italic-CHERNRFq.woff2","assets/literata-cyrillic-opsz-italic-Bj0ndbyp.woff2","assets/literata-greek-ext-opsz-italic-DFpO5j-Z.woff2","assets/literata-cyrillic-ext-opsz-normal-C5tfwALZ.woff2","assets/literata-latin-ext-opsz-italic-4y8iAqqs.woff2","assets/literata-cyrillic-opsz-normal-DgmypKXX.woff2","assets/literata-latin-opsz-italic-CJ93D38p.woff2","assets/literata-greek-ext-opsz-normal-DGm64vGR.woff2","assets/literata-greek-opsz-normal-DFglUmAd.woff2","assets/literata-vietnamese-opsz-normal-Gqw5JQlq.woff2","assets/onest-cyrillic-ext-wght-normal-DOFToQv1.woff2","assets/literata-latin-ext-opsz-normal-STiTPs0F.woff2","assets/literata-latin-opsz-normal-BHZsWIlc.woff2","assets/onest-cyrillic-wght-normal-DayYxulF.woff2","assets/onest-symbols-wght-normal-DxQzqQfC.woff2","assets/onest-math-wght-normal-Bl4ZGkZl.woff2","assets/onest-vietnamese-wght-normal-BBxOatbv.woff2","assets/onest-latin-wght-normal-Dun_Rd-l.woff2","assets/onest-latin-ext-wght-normal-QAhDxQuo.woff2","assets/index-C9Bk9u1p.css","assets/index-HRNk9NVS.js","assets/web-BgoHGKGU.js","assets/web-DNFcrOru.js","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","manifest.webmanifest","Polka-iPhone.mobileconfig","sample/kapitanskaya-dochka.fb2"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('polka-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  // ignoreVary: иначе файл с пометкой Vary: Origin не находится в кэше без интернета
  // ignoreVary: otherwise a file marked Vary: Origin isn't found in the cache offline
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
