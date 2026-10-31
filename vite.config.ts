import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { APP_VERSION, RELEASE_NOTES } from './src/version';

// Политика безопасности страницы: код и данные — только из самого приложения, в интернет оно не ходит.
// 'wasm-unsafe-eval' нужен, чтобы запустить SQLite (он скомпилирован в WebAssembly).
// 'unsafe-inline' для скриптов нужен мосту Capacitor, который Android встраивает в страницу.
// Добавляется только в сборку: в режиме разработки Vite нужны свои встроенные скрипты.
// Исключение — две библиотеки (Викитека и Project Gutenberg): из них ищутся и скачиваются книги.
// Page security policy: code and data only from the app itself; the one exception is Wikisource for «Find a book».
// 'wasm-unsafe-eval' lets SQLite (compiled to WebAssembly) run.
const CSP = [
  "default-src 'self'",
  "connect-src 'self' data: blob: https://ru.wikisource.org https://www.gutenberg.org https://anilibriabro.github.io",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <title>`),
});

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]);

// Service worker для веб-версии: запоминает все файлы приложения, чтобы оно открывалось без интернета.
// Страница берётся из сети, если она есть (так новая версия приходит сразу), иначе — из памяти телефона.
// Service worker for the web version: caches all app files so it opens offline.
const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const publicFiles = listFiles('public').map((f) => relative('public', f).replace(/\\/g, '/'));
    const files = ['./', ...Object.keys(bundle), ...publicFiles].filter((f) => f !== 'sw.js');
    const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
    const source = `// Создаётся при сборке (vite.config.ts). Не редактировать вручную.
const CACHE = 'polka-${version}';
const FILES = ${JSON.stringify(files)};

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
`;
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  },
});

// Файл app.json для проверки обновлений: номер версии и что нового — из src/version.ts
// app.json for update checks: version and notes come from src/version.ts
const appJson = (): Plugin => ({
  name: 'app-json',
  apply: 'build',
  generateBundle() {
    const source = JSON.stringify({
      version: APP_VERSION,
      url: 'https://github.com/AnilibriaBro/polka-reader/releases/latest/download/Polka.apk',
      notes: RELEASE_NOTES,
    }, null, 2);
    this.emitFile({ type: 'asset', fileName: 'app.json', source });
  },
});

// base: './' — чтобы собранные файлы открывались и внутри Android-приложения, и на GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react(), csp(), serviceWorker(), appJson()],
});
