import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Literata — шрифт, сделанный специально для чтения книг с экрана (с оптическим размером)
// Literata is a typeface made for reading books on screens (with optical sizing)
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource-variable/onest/index.css';
import './index.css';
import App from './App.tsx';
import { openDatabases } from './db';
import { isNative } from './platform';

// Запуск: открываю базы, жду шрифты (без них страницы посчитаются неверно), показываю приложение
// Startup: open the databases, wait for fonts (pages would be measured wrong without them), show the app

// Веб-версия (iPhone, браузер): запоминаю файлы приложения, чтобы оно открывалось без интернета
// Web version (iPhone, browser): cache the app files so it opens offline
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const root = createRoot(document.getElementById('root')!);

Promise.all([
  openDatabases(),
  document.fonts.load('400 19px "Literata Variable"'),
  document.fonts.load('400 19px "Onest Variable"'),
])
  .then(() => document.fonts.ready)
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ))
  .catch((e) => {
    document.getElementById('root')!.innerHTML =
      `<p class="fatal">Не удалось открыть хранилище книг. Попробуйте перезапустить приложение.<br><small>${String(e)}</small></p>`;
  });
