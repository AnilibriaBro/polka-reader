// Создаётся при сборке (vite.config.ts). Не редактировать вручную.
const CACHE = 'polka-8c24104e66c4';
const FILES = ["./","assets/literata-cyrillic-opsz-italic-Bj0ndbyp.woff2","assets/onest-latin-wght-normal-Dun_Rd-l.woff2","assets/literata-latin-opsz-normal-BHZsWIlc.woff2","assets/literata-latin-opsz-italic-CJ93D38p.woff2","assets/literata-cyrillic-opsz-normal-DgmypKXX.woff2","assets/pt-serif-latin-400-normal-Cx0mQj7e.woff2","assets/onest-cyrillic-wght-normal-DayYxulF.woff2","assets/pt-serif-cyrillic-700-normal-DvVvs_4R.woff2","assets/pt-serif-cyrillic-400-normal-B-euljER.woff2","assets/pt-serif-cyrillic-400-italic-Bicg0I0x.woff2","assets/pt-serif-latin-700-normal-Bsuo9jes.woff2","assets/lora-cyrillic-wght-normal-UWPuZLjM.woff2","assets/pt-serif-latin-400-italic-zg5EJ2cW.woff2","assets/lora-latin-wght-italic-DBI-iqMr.woff2","assets/lora-cyrillic-wght-italic-BWw7-oF9.woff2","assets/eb-garamond-cyrillic-wght-italic-Cini1BOa.woff2","assets/eb-garamond-cyrillic-wght-normal-DBa2mnKT.woff2","assets/eb-garamond-latin-wght-normal-CRpggXlh.woff2","assets/eb-garamond-latin-wght-italic-AvGrCMCN.woff2","assets/lora-latin-wght-normal-BiLcIKcI.woff2","assets/merriweather-cyrillic-opsz-normal-I8wqy6u5.woff2","assets/merriweather-cyrillic-opsz-italic-Yc9Dl82R.woff2","assets/roboto-slab-cyrillic-wght-normal-BzUUW08o.woff2","assets/pt-sans-cyrillic-400-normal-BgFH0IXl.woff2","assets/merriweather-latin-opsz-normal-BUlHP3aG.woff2","assets/merriweather-latin-opsz-italic-BbZJL_JF.woff2","assets/roboto-slab-latin-wght-normal-NGSZfXMW.woff2","assets/pt-sans-cyrillic-700-normal-TNhnPAH_.woff2","assets/pt-sans-latin-400-normal-Cwy9XeGQ.woff2","assets/pt-sans-cyrillic-400-italic-Bz2mnFoX.woff2","assets/pt-sans-latin-700-normal-DmHhLLdt.woff2","assets/nunito-cyrillic-wght-normal-CY6AOgYE.woff2","assets/nunito-cyrillic-wght-italic-AGUkry7S.woff2","assets/pt-sans-latin-400-italic-BbeYrS_i.woff2","assets/nunito-latin-wght-italic-ZB3Aladm.woff2","assets/nunito-latin-wght-normal-BzFMHfZw.woff2","assets/open-sans-cyrillic-wght-normal-bOs07Rf4.woff2","assets/open-sans-latin-wght-normal-CWNzRldh.woff2","assets/open-sans-cyrillic-wght-italic-BHGTCMtU.woff2","assets/open-sans-latin-wght-italic-Bf1Hxpwk.woff2","assets/sql-wasm-C1U8OeUW.wasm","assets/index-7NVw71a0.css","assets/index-0CQYlAZ-.js","assets/web-B9FXONZs.js","assets/web-FDqa4Fqc.js","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","manifest.webmanifest","Polka-iPhone.mobileconfig","sample/kapitanskaya-dochka.fb2"];

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
