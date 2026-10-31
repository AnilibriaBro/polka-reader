import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

// Здесь вся работа с базой SQLite. Базы две:
//   library — тексты книг (большая, меняется только при добавлении/удалении книги);
//   reader  — список книг, позиции, закладки, настройки (маленькая, сохраняется часто).
// Разделил, чтобы сохранение позиции после каждой страницы было мгновенным и не
// переписывало мегабайты текста.
// Обе базы лежат в памяти телефона (IndexedDB внутри приложения), интернет не нужен.
//
// All SQLite work lives here. Two databases:
//   library — book texts (large, changes only when a book is added/removed);
//   reader  — book list, positions, bookmarks, settings (small, saved often).
// Split so that saving the reading position after every page is instant and doesn't
// rewrite megabytes of text. Both are stored on the phone (IndexedDB), no internet needed.

export type Book = {
  id: number;
  title: string;
  author: string;
  format: 'txt' | 'fb2' | 'epub' | 'wiki' | 'gutenberg'; // wiki/gutenberg — скачана из библиотеки / downloaded from a library
  totalChars: number;
  cover: string | null; // картинка обложки (data URL) или null — тогда рисую тканевую / cover image or null
  addedAt: number;
  openedAt: number;
  pos: number; // позиция чтения: номер символа от начала книги / reading position: char index
};

export type Chunk = { idx: number; start: number; title: string | null; body: string };
export type Chapter = { idx: number; start: number; title: string };
export type Bookmark = { id: number; bookId: number; pos: number; snippet: string; createdAt: number };

let library: Database;
let reader: Database;

// --- Хранилище файлов баз в IndexedDB / Database files storage in IndexedDB ---

const IDB_NAME = 'polka';
const openIdb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbGet = async (key: string) => {
  const idb = await openIdb();
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const req = idb.transaction('files').objectStore('files').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const idbPut = async (key: string, data: Uint8Array) => {
  const idb = await openIdb();
  return new Promise<void>((resolve, reject) => {
    const tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- Открытие баз / Opening the databases ---

export async function openDatabases() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const [libFile, readerFile] = await Promise.all([idbGet('library.sqlite'), idbGet('reader.sqlite')]);
  library = new SQL.Database(libFile);
  reader = new SQL.Database(readerFile);

  // Создаю таблицы, если их ещё нет (первый запуск) / Creating tables on first launch
  library.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      book_id INTEGER NOT NULL,
      idx     INTEGER NOT NULL,
      start   INTEGER NOT NULL,
      title   TEXT,
      body    TEXT NOT NULL,
      PRIMARY KEY (book_id, idx)
    );`);
  reader.run(`
    CREATE TABLE IF NOT EXISTS books (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      author      TEXT NOT NULL DEFAULT '',
      format      TEXT NOT NULL,
      total_chars INTEGER NOT NULL,
      cover       TEXT,
      added_at    INTEGER NOT NULL,
      opened_at   INTEGER NOT NULL DEFAULT 0,
      pos         INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS chapters (
      book_id INTEGER NOT NULL,
      idx     INTEGER NOT NULL,
      start   INTEGER NOT NULL,
      title   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id    INTEGER NOT NULL,
      pos        INTEGER NOT NULL,
      snippet    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`);

  // Просим браузер не стирать данные при нехватке места (важно для iPhone)
  // Asking the browser not to evict our data when storage is low (matters on iPhone)
  navigator.storage?.persist?.().catch(() => {});
}

// --- Сохранение на диск / Saving to disk ---

let readerTimer = 0;
let saving: Promise<void> = Promise.resolve();

const saveLibrary = () => (saving = saving.then(() => idbPut('library.sqlite', library.export())));
const saveReaderNow = () => {
  clearTimeout(readerTimer);
  readerTimer = 0;
  return (saving = saving.then(() => idbPut('reader.sqlite', reader.export())));
};
// Позицию сохраняю не сразу, а через полсекунды тишины — чтобы быстрое листание не грузило телефон
// Position is saved after half a second of quiet, so fast page flipping doesn't load the phone
const saveReaderSoon = () => {
  clearTimeout(readerTimer);
  readerTimer = window.setTimeout(saveReaderNow, 500);
};

// Приложение сворачивают — сохраняю немедленно / App goes to background — save right away
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && readerTimer) saveReaderNow();
});

// --- Запросы / Queries ---

const rows = (db: Database, sql: string, params: SqlValue[] = []) => {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: Record<string, SqlValue>[] = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
};

const toBook = (r: Record<string, SqlValue>): Book => ({
  id: r.id as number,
  title: r.title as string,
  author: r.author as string,
  format: r.format as Book['format'],
  totalChars: r.total_chars as number,
  cover: (r.cover as string) || null,
  addedAt: r.added_at as number,
  openedAt: r.opened_at as number,
  pos: r.pos as number,
});

// Книги: сначала те, что открывали недавно / Books: recently opened first
export const listBooks = () =>
  rows(reader, 'SELECT * FROM books ORDER BY MAX(opened_at, added_at) DESC').map(toBook);

export const getBook = (id: number) => {
  const r = rows(reader, 'SELECT * FROM books WHERE id = ?', [id])[0];
  return r ? toBook(r) : null;
};

export type NewBook = {
  title: string;
  author: string;
  format: Book['format'];
  cover: string | null;
  chunks: Omit<Chunk, 'idx'>[];
  totalChars: number;
};

// Добавляю книгу: описание — в reader, текст по кусочкам — в library
// Adding a book: description goes to reader, text in chunks goes to library
export async function addBook(b: NewBook) {
  reader.run('INSERT INTO books (title, author, format, total_chars, cover, added_at) VALUES (?, ?, ?, ?, ?, ?)', [
    b.title, b.author, b.format, b.totalChars, b.cover, Date.now(),
  ]);
  const id = rows(reader, 'SELECT last_insert_rowid() AS id')[0].id as number;

  library.run('BEGIN');
  b.chunks.forEach((c, idx) =>
    library.run('INSERT INTO chunks (book_id, idx, start, title, body) VALUES (?, ?, ?, ?, ?)', [id, idx, c.start, c.title, c.body]));
  library.run('COMMIT');
  b.chunks.forEach((c, idx) => {
    if (c.title) reader.run('INSERT INTO chapters (book_id, idx, start, title) VALUES (?, ?, ?, ?)', [id, idx, c.start, c.title]);
  });

  await Promise.all([saveLibrary(), saveReaderNow()]);
  return id;
}

export async function deleteBook(id: number) {
  library.run('DELETE FROM chunks WHERE book_id = ?', [id]);
  for (const t of ['books WHERE id', 'chapters WHERE book_id', 'bookmarks WHERE book_id']) reader.run(`DELETE FROM ${t} = ?`, [id]);
  await Promise.all([saveLibrary(), saveReaderNow()]);
}

export const chunkCount = (bookId: number) =>
  rows(library, 'SELECT COUNT(*) AS n FROM chunks WHERE book_id = ?', [bookId])[0].n as number;

export const getChunk = (bookId: number, idx: number): Chunk | null => {
  const r = rows(library, 'SELECT idx, start, title, body FROM chunks WHERE book_id = ? AND idx = ?', [bookId, idx])[0];
  return r ? { idx: r.idx as number, start: r.start as number, title: r.title as string | null, body: r.body as string } : null;
};

// Какой кусок содержит позицию pos / Which chunk contains position pos
export const chunkAt = (bookId: number, pos: number) =>
  (rows(library, 'SELECT idx FROM chunks WHERE book_id = ? AND start <= ? ORDER BY idx DESC LIMIT 1', [bookId, pos])[0]?.idx as number) ?? 0;

export const listChapters = (bookId: number): Chapter[] =>
  rows(reader, 'SELECT idx, start, title FROM chapters WHERE book_id = ? ORDER BY idx', [bookId]).map((r) => ({
    idx: r.idx as number, start: r.start as number, title: r.title as string,
  }));

// Книга без глав (обычный TXT): оглавление из её кусков — по первым словам каждого
// A book without chapters (plain TXT): contents built from its chunks, by their first words
export const listFragments = (bookId: number): Chapter[] =>
  rows(library, 'SELECT idx, start, substr(body, 1, 120) AS head FROM chunks WHERE book_id = ? ORDER BY idx', [bookId]).map((r) => {
    const words = (r.head as string).replace(/(^|\n)[#>~]/g, '$1').replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
    return { idx: r.idx as number, start: r.start as number, title: `Часть ${(r.idx as number) + 1}. ${words}…` };
  });

export function savePosition(bookId: number, pos: number) {
  reader.run('UPDATE books SET pos = ?, opened_at = ? WHERE id = ?', [pos, Date.now(), bookId]);
  saveReaderSoon();
}

export const listBookmarks = (bookId: number): Bookmark[] =>
  rows(reader, 'SELECT * FROM bookmarks WHERE book_id = ? ORDER BY pos', [bookId]).map((r) => ({
    id: r.id as number, bookId: r.book_id as number, pos: r.pos as number, snippet: r.snippet as string, createdAt: r.created_at as number,
  }));

export function addBookmark(bookId: number, pos: number, snippet: string) {
  reader.run('INSERT INTO bookmarks (book_id, pos, snippet, created_at) VALUES (?, ?, ?, ?)', [bookId, pos, snippet, Date.now()]);
  saveReaderNow();
}

export function deleteBookmark(id: number) {
  reader.run('DELETE FROM bookmarks WHERE id = ?', [id]);
  saveReaderNow();
}

// --- Настройки / Settings ---

export type Settings = {
  theme: 'light' | 'sepia' | 'dark';
  fontSize: number;
  font: string; // id шрифта из fonts.ts / font id from fonts.ts
  justify: boolean;
};

export const defaultSettings: Settings = { theme: 'light', fontSize: 18, font: 'literata', justify: true };

export function loadSettings(): Settings {
  const r = rows(reader, "SELECT value FROM settings WHERE key = 'reader'")[0];
  try {
    return r ? { ...defaultSettings, ...JSON.parse(r.value as string) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  reader.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('reader', ?)", [JSON.stringify(s)]);
  saveReaderSoon();
}
