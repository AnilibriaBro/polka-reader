import type { NewBook } from './db';

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
  return t === t.toUpperCase() && /[А-ЯЁ]{3}/.test(t)
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
async function shrinkCover(dataUrl: string) {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const k = Math.min(1, 480 / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
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

export async function importFile(file: File): Promise<NewBook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const looksXml = new TextDecoder('ascii').decode(bytes.subarray(0, 400)).includes('<FictionBook');
  let book: NewBook;
  if (name.endsWith('.fb2') || looksXml) book = await parseFb2(bytes);
  else if (name.endsWith('.txt') || file.type.startsWith('text/') || !/\.\w+$/.test(name)) book = parseTxt(decodeText(bytes), file.name);
  else throw new Error('Этот формат пока не открывается. Подойдут файлы .txt и .fb2');
  if (!book.totalChars) throw new Error('В файле нет текста');
  return book;
}
