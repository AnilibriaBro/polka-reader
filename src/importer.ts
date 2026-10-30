import type { NewBook } from './db';
import { parseEpub } from './epub';
import { toParas } from './html';
import { isZip, Zip } from './zip';

// Здесь превращаю файл книги (TXT или FB2) в текст для читалки.
// Текст храню просто: абзацы через перевод строки. Первый символ абзаца может быть меткой:
//   «#» — заголовок, «>» — эпиграф или цитата, «~» — строка стихов, пустая строка — отбивка.
// Книгу режу на куски (главы или ~30 тысяч символов): страница строится из одного куска,
// поэтому даже огромная книга открывается быстро.
//
// Here a book file (TXT or FB2) becomes text for the reader.
// Text format is plain: paragraphs separated by newlines. The first char can be a marker:
//   "#" heading, ">" epigraph/quote, "~" verse line, empty line — a gap.
// The book is cut into chunks (chapters or ~30k chars): a page is built from one chunk,
// so even a huge book opens fast.

const CHUNK = 30_000;

// --- Кодировка / Encoding ---

// Частые русские буквы: по ним понимаю, правильно ли раскодирован текст
// Frequent Russian letters: used to tell whether the text was decoded correctly
const score = (s: string) => {
  let n = 0;
  for (const ch of s.slice(0, 20_000)) if ('оеаинтсрвлОЕАИНТСРВЛ '.includes(ch)) n++;
  return n;
};

// Старые русские книги часто сохранены не в UTF-8, а в Windows-1251, KOI8-R или DOS (866).
// Пробую UTF-8 строго; не вышло — пробую остальные и беру ту, где больше обычных русских букв.
// Old Russian books are often not UTF-8 but Windows-1251, KOI8-R or DOS (866).
// Try strict UTF-8 first; otherwise try the rest and pick the one with most common Russian letters.
export function decodeText(bytes: Uint8Array, declared?: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      /* неизвестная кодировка в заголовке — угадываю сам / unknown declared encoding — guess */
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    const variants = ['windows-1251', 'koi8-r', 'ibm866'].map((e) => new TextDecoder(e).decode(bytes));
    return variants.reduce((best, s) => (score(s) > score(best) ? s : best));
  }
}

// --- Общее / Shared ---

export const clean = (s: string) =>
  s.replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();

type Para = string; // абзац с меткой в начале / paragraph with a marker in front

// Собираю абзацы в куски. Новая глава всегда начинает новый кусок.
// Gathering paragraphs into chunks. A new chapter always starts a new chunk.
export type Section = { title: string | null; paras: string[] };

export function toChunks(sections: Section[]): Pick<NewBook, 'chunks' | 'totalChars'> {
  const chunks: NewBook['chunks'] = [];
  let pos = 0;
  const push = (title: string | null, paras: Para[]) => {
    // убираю отбивки по краям куска / dropping gaps at chunk edges
    while (paras.length && paras[0] === '') paras.shift();
    while (paras.length && paras[paras.length - 1] === '') paras.pop();
    if (!paras.length) return;
    const body = paras.join('\n');
    chunks.push({ start: pos, title, body });
    pos += body.length + 1;
  };
  for (const s of sections) {
    let cur: Para[] = [];
    let size = 0;
    let title = s.title;
    for (const p of s.paras) {
      cur.push(p);
      size += p.length + 1;
      if (size >= CHUNK && p !== '' && p[0] !== '#') {
        push(title, cur);
        title = null;
        cur = [];
        size = 0;
      }
    }
    push(title, cur);
  }
  return { chunks, totalChars: Math.max(0, pos - 1) };
}

// --- TXT ---

// Строка похожа на заголовок главы / Line looks like a chapter heading
// (\b в JavaScript не понимает русские буквы, поэтому конец слова проверяю сам)
// (\b doesn't understand Cyrillic in JavaScript, so the word end is checked by hand)
const HEADING = /^(глава|часть|книга|том|пролог|эпилог|предисловие|послесловие|chapter|part|prologue|epilogue)(?![а-яёa-z])[\s.:]*[\dIVXLC]*[\s.:—-]*.{0,60}$/i;
const ROMAN = /^[IVXLC]{1,7}\.?$/;

// Строка — заголовок главы? Если да, возвращаю его в приличном виде, иначе null.
// «ГЛАВА II ВОЖАТЫЙ» → «Глава II. Вожатый»: заглавные буквы в оглавлении читаются тяжело.
// Is the line a chapter heading? If so, return it tidied up, otherwise null.
export function asHeading(t: string): string | null {
  if (t.length >= 70 || !(HEADING.test(t) || ROMAN.test(t))) return null;
  return t === t.toUpperCase() && /[А-ЯЁA-Z]{3}/.test(t)
    ? t.toLowerCase()
      .replace(/(^|\s)([ivxlc]+)(?=\s|$|\.)/g, (_, a: string, r: string) => a + r.toUpperCase())
      .replace(/^(\S+\s+[IVXLC\d]+)\s+(\S)/, (_, a: string, c: string) => `${a}. ${c.toUpperCase()}`)
      .replace(/^./, (c) => c.toUpperCase())
    : t;
}

export function parseTxt(text: string, fileName: string): NewBook {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nonBlank = lines.filter((l) => l.trim());
  const indented = nonBlank.filter((l) => /^\s+\S/.test(l)).length / Math.max(1, nonBlank.length);
  const blank = (lines.length - nonBlank.length) / Math.max(1, lines.length);
  const shortLines = nonBlank.filter((l) => l.trim().length < 85).length / Math.max(1, nonBlank.length);

  // В TXT абзацы бывают устроены по-разному — определяю способ / TXT paragraphs come in different styles
  //   a) абзац начинается с отступа, строки переносятся по ширине (как на lib.ru)
  //      paragraph starts with an indent, lines are hard-wrapped (like lib.ru)
  //   b) абзацы разделены пустой строкой, внутри — переносы / blank line between paragraphs, wrapped inside
  //   c) одна строка — один абзац / one line — one paragraph
  const mode = indented > 0.15 && indented < 0.9 && shortLines > 0.8 ? 'indent' : blank > 0.25 && shortLines > 0.8 ? 'blank' : 'line';

  const sections: { title: string | null; paras: Para[] }[] = [{ title: null, paras: [] }];
  let buf = '';
  const flush = () => {
    const t = clean(buf);
    buf = '';
    if (!t) return;
    const sec = sections[sections.length - 1];
    const heading = asHeading(t);
    if (/^\*\s*\*\s*\*$/.test(t)) sec.paras.push('', '#* * *', '');
    else if (heading) sections.push({ title: heading, paras: ['#' + heading] });
    else sec.paras.push(t);
  };
  for (const raw of lines) {
    const isBlank = !raw.trim();
    if (mode === 'line') {
      buf = raw;
      flush();
    } else if (isBlank) {
      flush();
    } else if (mode === 'indent' && /^\s+\S/.test(raw)) {
      flush();
      buf = raw;
    } else {
      buf += ' ' + raw;
    }
  }
  flush();

  // Название из имени файла: «Автор - Название.txt» / Title from the file name: "Author - Title.txt"
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return {
    title: m ? m[2] : base,
    author: m ? m[1] : '',
    format: 'txt',
    cover: null,
    ...toChunks(sections),
  };
}

// --- FB2 ---

const kids = (el: Element) => Array.from(el.children);
const named = (el: Element | null | undefined, name: string) => (el ? kids(el).filter((c) => c.localName === name) : []);
const first = (el: Element | null | undefined, name: string) => named(el, name)[0];

// Обложку уменьшаю до 480 px, чтобы база не разрасталась / Shrinking the cover to 480 px to keep the DB small
// Книга одним потоком абзацев → главы по заголовкам. Если заголовков слишком много (в пьесе каждое
// «Явление»), главами считаю только «Глава…», «Часть…», «Действие…», номера.
// One stream of paragraphs → chapters by headings. With too many headings (every scene in a play),
// only "Chapter…", "Part…", "Act…" and numbers become chapters.
export function sectionsFromParas(input: string[]): Section[] {
  const paras = input.map((p) => {
    // «ГЛАВА ПЕРВАЯ.» обычным абзацем — тоже заголовок / "ГЛАВА ПЕРВАЯ." as a plain paragraph is a heading too
    if (p.startsWith('#')) return '#' + (asHeading(p.slice(1)) ?? p.slice(1)); // «CHAPTER II.» → «Chapter II.»
    const h = /^[~>]/.test(p) ? null : asHeading(p);
    return h ? '#' + h : p;
  });
  const many = paras.filter((p) => p.startsWith('#')).length > 30;
  const major = (h: string) => !many || !!asHeading(h) || /^\d{1,3}\.?$/.test(h) || /^(действие|акт|картина|act|scene|book)/i.test(h);
  const sections: Section[] = [];
  for (const p of paras) {
    const h = p.startsWith('#') && major(p.slice(1)) ? p.slice(1) : null;
    if (h || !sections.length) sections.push({ title: h, paras: [] });
    sections[sections.length - 1].paras.push(p);
  }
  return sections;
}

export async function shrinkCover(url: string) {
  // createImageBitmap работает и когда приложение свёрнуто; если картинка битая или думает
  // дольше 5 секунд — книга добавится с нарисованной обложкой, а не зависнет
  // createImageBitmap works even in the background; a broken or slow image (5 s) falls back
  // to a drawn cover instead of hanging the import
  const work = async () => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const k = Math.min(1, 480 / bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL('image/jpeg', 0.82);
  };
  try {
    return await Promise.race([work(), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
  } catch {
    return null;
  }
}

export async function parseFb2(bytes: Uint8Array): Promise<NewBook> {
  // Кодировка указана в первой строке XML / Encoding is declared in the XML header
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 200));
  const declared = head.match(/encoding=["']([\w-]+)["']/i)?.[1];
  const xml = new DOMParser().parseFromString(decodeText(bytes, declared), 'application/xml');
  if (xml.querySelector('parsererror') && !xml.querySelector('body')) throw new Error('Файл FB2 повреждён');

  const root = xml.documentElement;
  const info = first(first(root, 'description'), 'title-info');
  const title = clean(first(info, 'book-title')?.textContent || '') || 'Без названия';
  const authors = named(info, 'author')
    .map((a) => clean(['first-name', 'last-name'].map((n) => first(a, n)?.textContent || '').join(' ')))
    .filter(Boolean);

  // Обложка: ссылка на картинку внутри файла / Cover: link to an image stored inside the file
  let cover: string | null = null;
  const img = first(first(info, 'coverpage'), 'image');
  const href = img && (img.getAttribute('l:href') || img.getAttribute('xlink:href') || img.getAttribute('href') ||
    Array.from(img.attributes).find((a) => a.localName === 'href')?.value);
  if (href) {
    const bin = named(root, 'binary').find((b) => b.getAttribute('id') === href.replace(/^#/, ''));
    if (bin) cover = await shrinkCover(`data:${bin.getAttribute('content-type') || 'image/jpeg'};base64,${bin.textContent!.replace(/\s/g, '')}`);
  }

  const sections: { title: string | null; paras: Para[] }[] = [{ title: null, paras: [] }];
  const cur = () => sections[sections.length - 1].paras;
  const text = (el: Element) => clean(el.textContent || '');
  const titleText = (el: Element) => named(el, 'p').map(text).filter(Boolean).join('. ') || text(el);

  // Обхожу разделы книги по порядку / Walking the book's sections in order
  const walk = (el: Element, depth: number) => {
    for (const c of kids(el)) {
      switch (c.localName) {
        case 'section': {
          const t = first(c, 'title');
          // Новая глава — новый кусок, но только для глав с заголовком и не слишком глубоко
          // A new chapter starts a new chunk, only for titled sections and not too deep
          if (t && depth < 3) sections.push({ title: titleText(t), paras: [] });
          walk(c, depth + 1);
          break;
        }
        case 'title':
          cur().push('', ...named(c, 'p').map((p) => '#' + text(p)).filter((p) => p.length > 1), '');
          break;
        case 'subtitle':
          cur().push('', '#' + text(c), '');
          break;
        case 'epigraph':
        case 'cite':
          cur().push(...kids(c).map((p) => (p.localName === 'empty-line' ? '' : '>' + text(p))).filter((p) => p !== '>'), '');
          break;
        case 'poem':
          for (const st of kids(c)) {
            if (st.localName === 'stanza') cur().push(...named(st, 'v').map((v) => '~' + text(v)), '');
            else if (st.localName === 'title') cur().push('#' + titleText(st));
            else if (st.localName === 'text-author') cur().push('>' + text(st));
          }
          break;
        case 'empty-line':
          cur().push('');
          break;
        case 'p': {
          const t = text(c);
          if (t) cur().push(t);
          break;
        }
        case 'text-author':
          cur().push('>' + text(c));
          break;
        case 'image':
          break;
        default:
          walk(c, depth);
      }
    }
  };
  // Сноски (body name="notes") пропускаю / Footnotes (body name="notes") are skipped
  for (const body of named(root, 'body').filter((b) => !b.getAttribute('name'))) walk(body, 0);

  return { title, author: authors.join(', '), format: 'fb2', cover, ...toChunks(sections) };
}

// --- Вход / Entry point ---

const MAX_BOOK = 150 * 1024 * 1024; // файл больше 150 МБ — точно не книга / a file over 150 MB is surely not a book

// Определяю формат по содержимому, а не только по имени: файлы из Telegram и браузера часто
// приходят с неправильным именем. ZIP-архив с книгой внутри (книга.fb2.zip) распаковываю.
// Format is detected by content, not just by name: files from Telegram and browsers often come
// with odd names. A ZIP with a book inside (book.fb2.zip) is unpacked.
async function importBytes(bytes: Uint8Array, fileName: string, depth = 0): Promise<NewBook> {
  const name = fileName.toLowerCase();
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 400));
  if (isZip(bytes)) {
    const zip = new Zip(bytes);
    if (zip.find('META-INF/container.xml')) return parseEpub(zip);
    const inner = zip.entries.find((e) => /\.(fb2|epub|txt)$/i.test(e.name) && !e.name.startsWith('__MACOSX'));
    if (!inner || depth > 0) throw new Error('В архиве нет книги. Подойдут архивы с файлом .fb2, .epub или .txt');
    return importBytes(await zip.read(inner), inner.name.split('/').pop()!, depth + 1);
  }
  if (head.includes('<FictionBook') || name.endsWith('.fb2')) return parseFb2(bytes);
  // HTML-книга (или страница, сохранённая из браузера) — беру только текст
  // An HTML book (or a page saved from a browser) — only its text is taken
  if (/^\s*(<\?xml[^>]*>\s*)?(<!doctype html|<html)/i.test(head)) {
    const doc = new DOMParser().parseFromString(decodeText(bytes, head.match(/charset=["']?([\w-]+)/i)?.[1]), 'text/html');
    const title = clean(doc.title) || fileName.replace(/\.[^.]+$/, '');
    return { title, author: '', format: 'txt', cover: null, ...toChunks(sectionsFromParas(toParas(doc.body))) };
  }
  if (/^%PDF/.test(head)) throw new Error('PDF не подходит для чтения с телефона: в нём страницы как картинки. Поищите эту книгу в EPUB или FB2');
  if (/\.(mobi|azw3?|djvu|docx?|rtf)$/.test(name)) throw new Error('Этот формат не открывается. Подойдут EPUB, FB2, TXT и архивы ZIP с ними');
  // Похоже на текст: нет нулевых байтов в начале (у картинок и программ они есть)
  // Looks like text: no zero bytes at the start (images and programs have them)
  if (bytes.subarray(0, 4096).includes(0) && !(bytes[0] === 0xff || bytes[0] === 0xfe)) {
    throw new Error('Это не книга. Подойдут EPUB, FB2, TXT и архивы ZIP с ними');
  }
  return parseTxt(decodeText(bytes), fileName);
}

export async function importBook(bytes: Uint8Array, fileName: string): Promise<NewBook> {
  if (bytes.length > MAX_BOOK) throw new Error('Файл слишком большой для книги');
  const book = await importBytes(bytes, fileName);
  if (!book.totalChars) throw new Error('В файле нет текста');
  return book;
}

export async function importFile(file: File): Promise<NewBook> {
  if (file.size > MAX_BOOK) throw new Error('Файл слишком большой для книги');
  return importBook(new Uint8Array(await file.arrayBuffer()), file.name);
}
