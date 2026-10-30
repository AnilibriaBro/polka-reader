import { CapacitorHttp } from '@capacitor/core';
import type { NewBook } from './db';
import { parseEpub } from './epub';
import { isNative } from './platform';
import { isZip, Zip } from './zip';

// Project Gutenberg — 70 с лишним тысяч книг мировой классики (в основном на языке оригинала),
// у которых закончились авторские права. Поиск идёт из приложения, а сами книги сайт скачивать
// из браузера не разрешает (нет заголовка CORS), поэтому:
//   • на Android качает само приложение (CapacitorHttp — запрос идёт не из браузера);
//   • в веб-версии (iPhone) открываю файл книги в Safari, а потом его добавляют через «Выбрать файл».
//
// Project Gutenberg: 70k+ public-domain world classics (mostly in the original language).
// Search works from the app, but the site doesn't allow book downloads from a browser (no CORS), so:
//   • on Android the app downloads natively (CapacitorHttp — not a browser request);
//   • on the web (iPhone) the book file opens in Safari, then it's added via "Choose a file".

const SITE = 'https://www.gutenberg.org';

export type GutenbergBook = { id: number; title: string; author: string };

export const canDownload = isNative;
export const epubUrl = (id: number) => `${SITE}/cache/epub/${id}/pg${id}.epub`;

export async function search(query: string): Promise<GutenbergBook[]> {
  let res: Response;
  try {
    res = await fetch(`${SITE}/ebooks/search.opds/?query=${encodeURIComponent(query.trim())}`);
  } catch {
    throw new Error('Нет связи с библиотекой. Проверьте интернет: он нужен, чтобы найти и скачать книгу.');
  }
  if (!res.ok) throw new Error(`Библиотека не ответила (ошибка ${res.status}). Попробуйте ещё раз через минуту.`);
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const out: GutenbergBook[] = [];
  for (const e of Array.from(doc.getElementsByTagName('entry'))) {
    // У книги id вида https://www.gutenberg.org/ebooks/1399.opds, остальное — разделы каталога
    // A book's id looks like …/ebooks/1399.opds; the rest are catalog sections
    const id = Number(e.getElementsByTagName('id')[0]?.textContent?.match(/\/ebooks\/(\d+)\.opds$/)?.[1]);
    if (!id) continue;
    const title = e.getElementsByTagName('title')[0]?.textContent?.trim() ?? '';
    const author = (e.getElementsByTagName('content')[0]?.textContent ?? '').replace(/^graf\s+/i, '').trim();
    out.push({ id, title: title.replace(/\s*\((Russian|English|French|German)\)$/, ''), author });
  }
  return out;
}

// Скачать EPUB книги (только Android) / Download the book's EPUB (Android only)
export async function download(book: GutenbergBook): Promise<NewBook> {
  if (!canDownload) throw new Error('В веб-версии книга откроется в браузере');
  const url = epubUrl(book.id);
  // Приложение ходит только на сайт Gutenberg — адрес собираю сам, из номера книги
  // The app only talks to gutenberg.org — the address is built here from the book number
  let res;
  try {
    res = await CapacitorHttp.get({ url, responseType: 'arraybuffer', connectTimeout: 20000, readTimeout: 60000 });
  } catch {
    throw new Error('Нет связи с библиотекой. Проверьте интернет.');
  }
  if (res.status !== 200) throw new Error(`Библиотека не отдала книгу (ошибка ${res.status})`);
  // На Android ответ приходит строкой base64 / On Android the body arrives as a base64 string
  const bytes = typeof res.data === 'string'
    ? Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0))
    : new Uint8Array(res.data as ArrayBuffer);
  if (!isZip(bytes)) throw new Error('У этой книги нет файла EPUB — попробуйте другое издание');
  const parsed = await parseEpub(new Zip(bytes));
  return { ...parsed, title: parsed.title || book.title, author: parsed.author || book.author, format: 'gutenberg' };
}
