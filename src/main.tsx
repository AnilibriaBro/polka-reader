import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { loadSettings, openDatabases } from './db';
import { fontById, FONTS, loadFont, registerFonts } from './fonts';
import { isNative } from './platform';

// Запуск: открываю базы, жду шрифты (без них страницы посчитаются неверно), показываю приложение
// Startup: open the databases, wait for fonts (pages would be measured wrong without them), show the app

// Веб-версия (iPhone, браузер): запоминаю файлы приложения, чтобы оно открывалось без интернета
// Web version (iPhone, browser): cache the app files so it opens offline
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Слишком старый браузер (iOS до 16.4 — это iPhone 7 и старше): честно говорю, что делать,
// вместо пустого экрана
// Too old a browser (iOS before 16.4, i.e. iPhone 7 and older): explain what to do instead of a blank screen
const supported = typeof DecompressionStream !== 'undefined' && typeof WebAssembly !== 'undefined' &&
  CSS.supports('color', 'color-mix(in srgb, red, blue)');

const root = createRoot(document.getElementById('root')!);
registerFonts();

if (!supported) {
  document.getElementById('root')!.innerHTML =
    '<p class="fatal">«Полке» нужен более новый браузер. На iPhone обновите iOS до версии 16.4 или новее: ' +
    '«Настройки» → «Основные» → «Обновление ПО» (подходят iPhone 8 и новее). На Android обновите Chrome.</p>';
  throw new Error('unsupported browser');
}

// Интерфейс — Literata и Onest; плюс шрифт, выбранный для чтения
// The interface uses Literata and Onest; plus the font chosen for reading
openDatabases()
  .then(() => Promise.all([FONTS[0], fontById('onest'), fontById(loadSettings().font)].map(loadFont)))
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
