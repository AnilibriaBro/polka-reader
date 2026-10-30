import { App as CapApp } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { isNative } from './platform';

// Android: книгу можно открыть прямо из Telegram, браузера или «Файлов» — «Открыть с помощью → Полка»
// или «Поделиться → Полка». Телефон передаёт ссылку на файл (content://…), я читаю его и добавляю.
// Android: a book can be opened straight from Telegram, a browser or Files — "Open with → Polka"
// or "Share → Polka". The phone hands over a file link (content://…); I read it and add the book.

export type Incoming = { bytes: Uint8Array; name: string };

const nameOf = (url: string) => {
  const last = url.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last).split('/').pop() || 'Книга';
  } catch {
    return last || 'Книга';
  }
};

async function read(url: string): Promise<Incoming | null> {
  // Беру только файлы с телефона, никакие ссылки из интернета / Only local files, never web links
  if (!/^(content|file):\/\//.test(url)) return null;
  const { data } = await Filesystem.readFile({ path: url });
  const bytes = typeof data === 'string'
    ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    : new Uint8Array(await data.arrayBuffer());
  return { bytes, name: nameOf(url) };
}

export function listenForBooks(onBook: (b: Incoming) => void, onError: (message: string) => void) {
  if (!isNative) return;
  const handle = (url: string | undefined) => {
    if (!url) return;
    read(url).then((b) => b && onBook(b)).catch(() => onError('Не удалось открыть файл. Попробуйте сохранить его и добавить через «Выбрать файл».'));
  };
  // Приложение запустили файлом / The app was launched with a file
  CapApp.getLaunchUrl().then((r) => handle(r?.url)).catch(() => {});
  // Файл пришёл, когда приложение уже открыто / A file arrived while the app is open
  CapApp.addListener('appUrlOpen', (e) => handle(e.url));
}
