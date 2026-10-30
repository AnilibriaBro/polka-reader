import type { NewBook } from './db';
import { asHeading, clean, toChunks, type Section } from './importer';

// Поиск и скачивание книг из Викитеки (ru.wikisource.org) — свободной библиотеки текстов,
// у которых закончились авторские права. Всё бесплатно и законно.
// Интернет нужен только здесь: скачанная книга кладётся на полку и читается без сети.
//
// Как устроена книга в Викитеке: страница произведения → издания («1960 (СО)» — современная
// орфография, «(ДО)» — дореформенная, с ятями) → главы отдельными страницами. Выбираю издание
// в современной орфографии и собираю книгу из глав по порядку.
//
// Searching and downloading books from Russian Wikisource — a free library of public-domain texts.
// Internet is needed only here: a downloaded book goes to the shelf and is read offline.
// A work page → editions ("(СО)" modern spelling, "(ДО)" pre-1918 spelling) → chapter subpages.
// I pick the modern-spelling edition and assemble the book from its chapters in order.

const API = 'https://ru.wikisource.org/w/api.php';

export type Found = { title: string; name: string; author: string };

// Запрос к API Викитеки. origin=* разрешает запросы из приложения (CORS)
// A Wikisource API request. origin=* allows requests from the app (CORS)
async function api(params: Record<string, string>) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })}`;
  // Викитека просит подписывать запросы — указываю название приложения
  // Wikimedia asks clients to identify themselves — sending the app name
  const headers = { 'Api-User-Agent': 'Polka-reader/1.0 (school project; offline book reader)' };
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch {
      throw new Error('Нет связи с библиотекой. Проверьте интернет: он нужен, чтобы найти и скачать книгу.');
    }
    // 429 — «слишком много запросов»: жду и пробую ещё раз / 429 "too many requests": wait and retry
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Библиотека не ответила (ошибка ${res.status}). Попробуйте ещё раз через минуту.`);
    return res.json();
  }
}

// Дореформенная орфография → современная: ѣ→е, і→и, ѳ→ф, ѵ→и, твёрдый знак на конце слова убираю.
// Не идеально (окончания «-аго» остаются), но читается как обычный текст.
// Pre-1918 spelling → modern: ѣ→е, і→и, ѳ→ф, ѵ→и, drop word-final ъ. Not perfect, but reads normally.
const modernize = (s: string) =>
  s.replace(/ѣ/g, 'е').replace(/Ѣ/g, 'Е').replace(/і/g, 'и').replace(/І/g, 'И')
    .replace(/ѳ/g, 'ф').replace(/Ѳ/g, 'Ф').replace(/ѵ/g, 'и').replace(/Ѵ/g, 'И')
    .replace(/([бвгджзклмнпрстфхцчшщ])ъ(?![а-яё])/gi, '$1');

// «Муму (Тургенев)» → название «Муму», автор «Тургенев» / "Title (Author)" → name and author
const split = (title: string): Found => {
  const m = title.match(/^(.*?)\s*\(([^()]+)\)$/);
  return { title, name: m ? m[1] : title, author: m ? m[2] : '' };
};

// Поиск: сначала по названию страницы (в нём есть фамилия автора), потом по тексту.
// Главы («Книга/Глава I») не показываю — только сами произведения.
// Search: by page title first (it contains the author's surname), then by text.
// Chapters ("Book/Chapter I") are hidden — only whole works are shown.
export async function search(query: string): Promise<Found[]> {
  const q = query.trim();
  if (!q) return [];
  const run = async (srsearch: string) =>
    ((await api({ action: 'query', list: 'search', srsearch, srnamespace: '0', srlimit: '40', srprop: '' }))
      .query?.search ?? []) as { title: string }[];
  const words = q.split(/\s+/).map((w) => `intitle:${w}`).join(' ');
  const [byTitle, byText] = await Promise.all([run(words), run(q)]);
  const seen = new Set<string>();
  return [...byTitle, ...byText]
    .map((r) => r.title)
    .filter((t) => !t.includes('/') && !t.startsWith('«') && !seen.has(t) && seen.add(t))
    .slice(0, 30)
    .map(split)
    // Порядок: сначала книги, где искомое — автор («Чехов» → его рассказы), потом остальные книги,
    // в конце страницы без автора (обычно это списки, а не книги)
    // Order: works by the searched author first, then other works, pages without an author last
    .map((f) => ({ f, rank: q.toLowerCase().split(/\s+/).some((w) => f.author.toLowerCase().includes(w)) ? 0 : f.author ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.f);
}

// --- Скачивание / Download ---

type Page = { title: string; doc: Element; subpages: string[]; author: string };

async function fetchPage(title: string): Promise<Page> {
  const data = await api({ action: 'parse', page: title, prop: 'text', redirects: '1', disableeditsection: '1' });
  if (data.error) throw new Error('Такой страницы в библиотеке нет');
  const real = data.parse.title as string;
  const root = new DOMParser().parseFromString(data.parse.text, 'text/html').querySelector('.mw-parser-output') ?? document.createElement('div');
  // Автор — первая ссылка на страницу «Автор:…» в шапке / Author — the first "Автор:" link in the header
  const authorLink = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/wiki/"]'))
    .find((a) => decodeURIComponent(a.getAttribute('href')!).startsWith('/wiki/Автор:'));
  // Подстраницы (главы или издания) по порядку, без повторов / Subpages (chapters or editions) in order, no repeats
  const subpages: string[] = [];
  for (const a of root.querySelectorAll('a[href^="/wiki/"]')) {
    const t = decodeURIComponent(a.getAttribute('href')!.slice(6).split('#')[0]).replace(/_/g, ' ');
    if (t.startsWith(real + '/') && !subpages.includes(t)) subpages.push(t);
  }
  // Убираю служебное: шапки, навигацию, сноски, номера страниц / Removing headers, navigation, footnotes, page numbers
  root.querySelectorAll('.ws-noexport, .navbox, .reference, .references, .mw-references-wrap, .mw-editsection, .pagenum, .ws-pagenum, .licensetemplate, .headertemplate, .toc, #toc, .mw-toc, style, script, .noprint, .metadata, sup')
    .forEach((el) => el.remove());
  return { title: real, doc: root, subpages, author: authorLink?.textContent?.trim() ?? '' };
}

// HTML страницы → абзацы с метками, как у остальных книг / Page HTML → marked paragraphs like other books
function toParas(root: Element): string[] {
  const out: string[] = [];
  let buf = '';
  const flush = (mark = '') => {
    const t = clean(buf);
    buf = '';
    if (t) out.push(mark + t);
  };
  const walk = (el: Element, mark: string) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) { buf += n.textContent; continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const e = n as Element;
      const tag = e.localName;
      if (tag === 'br') {
        // в стихах каждая строка — отдельно / in poems every line stands alone
        if (mark === '~') flush('~'); else buf += ' ';
      } else if (/^h[1-6]$/.test(tag)) {
        flush(mark); buf = e.textContent ?? ''; flush('#');
      } else if (e.classList.contains('poem') || tag === 'poem') {
        flush(mark); walk(e, '~'); flush('~'); out.push('');
      } else if (tag === 'blockquote') {
        flush(mark); walk(e, '>'); flush('>');
      } else if (['p', 'div', 'center', 'dd', 'li', 'section', 'dl', 'ul', 'ol', 'table', 'tbody', 'tr', 'td', 'th'].includes(tag)) {
        flush(mark); walk(e, mark); flush(mark);
      } else {
        walk(e, mark); // строчные теги: b, i, span, a… / inline tags
      }
    }
  };
  walk(root, '');
  flush();
  // строки из одних чёрточек и звёздочек-линеек — мусор от старых сканов
  // lines made only of dashes or rules are leftovers from old scans
  return out.filter((p) => !/^[~>#]?[-=_—–*\s]{5,}$/.test(p));
}

// Не главы, а служебные страницы издания / Edition service pages, not chapters
const SKIP = /\/(Примечания|Комментарии|Приложени[ея]|Варианты|Указатель|Оглавление|Содержание)$/i;
// Подстраница — это издание? («1960 (СО)», «(ДО)», «Издание 1886») / Is a subpage an edition?
// («ВТ» — текст, переведённый в современную орфографию самой Викитекой; «ВТ:Ё» — ещё и с буквой ё)
// ("ВТ" is a text modernized by Wikisource itself; "ВТ:Ё" also with the letter ё)
const EDITION = /(^(СО|ДО|ВТ|ЕО)$|\(\s*(СО|ДО|ВТ|ЕО)(:Ё)?\s*\)|(^|\s)(1[6-9]|20)\d\d(\s|—|$)|издание|^версия)/i;
const MODERN = /(\(\s*(СО|ВТ)(:Ё)?\s*\)|\/(СО|ВТ)$)/;
const OLD = /(\(\s*ДО\s*\)|\/ДО$)/;

// Главы — самые глубокие подстраницы по порядку, без примечаний. У больших романов бывает
// «Часть первая/Глава I» — тогда берётся глава, а не часть.
// Chapters: the deepest subpages in order, no notes. Big novels have "Part/Chapter" — chapters win.
// Другие редакции и черновики внутри издания пропускаю — иначе текст удвоится
// Other redactions and drafts inside an edition are skipped, otherwise the text doubles
const DRAFT = /\/(Редакция|Другие редакции|Черновые|Черновик|Вариант|Ранняя редакция)[^/]*(\/|$)/i;
const chaptersOf = (p: Page) => {
  // Бывает, что у главы внутри лежит её же копия в старой орфографии («…/Глава I/ДО») — копию пропускаю
  // Sometimes a chapter holds its own old-spelling copy ("…/Chapter I/ДО") — skip the copy
  const isCopy = (s: string) => {
    const cut = s.lastIndexOf('/');
    return EDITION.test(s.slice(cut + 1)) && p.subpages.includes(s.slice(0, cut));
  };
  const subs = p.subpages.filter((s) => !SKIP.test(s) && !DRAFT.test(s.slice(p.title.length)) && !isCopy(s));
  return subs.filter((s) => !subs.some((o) => o.startsWith(s + '/')));
};

export async function download(found: Found, onProgress: (done: number, total: number) => void): Promise<NewBook> {
  let page = await fetchPage(found.title);
  const author = page.author || found.author;

  // Страница со списком изданий — беру издание в современной орфографии
  // A page listing editions — take the modern-spelling one
  for (let i = 0; i < 2 && page.subpages.length; i++) {
    const tails = page.subpages.map((s) => s.slice(page.title.length + 1));
    if (!tails.every((t) => EDITION.test(t) && !t.includes('/'))) break;
    // Если изданий в современной орфографии несколько — смотрю все и беру то, где книга разбита
    // на главы (обычно оно аккуратнее), иначе — где больше текста
    // Several modern editions: fetch them all, prefer one split into chapters, otherwise the longest
    const modern = page.subpages.filter((s) => MODERN.test(s));
    const candidates = (modern.length ? modern : page.subpages.filter((s) => !OLD.test(s))).slice(0, 4);
    const pages = await Promise.all((candidates.length ? candidates : [page.subpages[0]]).map(fetchPage));
    const score = (p: Page) => (chaptersOf(p).length ? 1e9 + chaptersOf(p).length : (p.doc.textContent ?? '').length);
    page = pages.reduce((best, p) => (score(p) > score(best) ? p : best));
  }

  // На странице почти нет текста, а глав не нашлось — текст лежит в подстранице-варианте
  // («Хамелеон/Вариант журнала…»): беру её
  // Almost no text and no chapters — the text lives in a variant subpage: take it
  if (!chaptersOf(page).length && page.subpages.length && toParas(page.doc).join('').length < 1500) {
    page = await fetchPage(page.subpages.find((s) => !OLD.test(s)) ?? page.subpages[0]);
  }

  const sections: Section[] = [];
  const chapters = chaptersOf(page);
  if (!chapters.length) {
    // Вся книга на одной странице: оглавление строю по заголовкам внутри неё
    // The whole book on one page: the contents come from its headings
    onProgress(1, 1);
    const paras = toParas(page.doc).map((p) => {
      // «ГЛАВА ПЕРВАЯ.» обычным абзацем — тоже заголовок / "ГЛАВА ПЕРВАЯ." as a plain paragraph is a heading too
      const h = /^[#~>]/.test(p) ? null : asHeading(p);
      return h ? '#' + h : p;
    });
    // Заголовков слишком много (в пьесе каждое «Явление») — в оглавление беру только главы и действия
    // Too many headings (every scene in a play) — only chapters and acts go to the contents
    const many = paras.filter((p) => p.startsWith('#')).length > 30;
    const major = (h: string) => !many || !!asHeading(h) || /^(действие|акт|картина)/i.test(h);
    for (const p of paras) {
      const h = p.startsWith('#') && major(p.slice(1)) ? p.slice(1) : null;
      if (h || !sections.length) sections.push({ title: h, paras: [] });
      sections[sections.length - 1].paras.push(p);
    }
  } else {
    if (chapters.length > 300) throw new Error('Книга слишком большая для скачивания целиком');
    // Главы качаю по 3 сразу, но кладу строго по порядку / Chapters download 3 at a time, kept in order
    const pages: Page[] = new Array(chapters.length);
    let done = 0;
    onProgress(0, chapters.length);
    for (let i = 0; i < chapters.length; i += 3) {
      await Promise.all(chapters.slice(i, i + 3).map(async (t, k) => {
        pages[i + k] = await fetchPage(t);
        onProgress(++done, chapters.length);
      }));
    }
    for (const p of pages) {
      let name = p.title.slice(page.title.length + 1).replace(/\//g, '. ');
      const paras = toParas(p.doc);
      // Заголовки в начале главы, повторяющие её название («Глава I», «I», «Том первый») — лишние
      // Headings at the chapter start repeating its name ("Глава I", "I", "Том первый") are duplicates
      const norm = (s: string) => s.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
      while (paras[0]?.startsWith('#') && paras[0].length < 40 &&
        (norm(name).endsWith(norm(paras[0])) || /^#(том|часть|книга)\s/i.test(paras[0]))) paras.shift();
      // Первая строка главы часто повторяет её название полнее: «Глава I Сержант гвардии».
      // Тогда беру её как название, а в тексте не дублирую.
      // The chapter's first line often repeats its name in full: "Глава I Сержант гвардии" — use it as the title.
      const head = paras[0]?.replace(/^#/, '') ?? '';
      if (head.toLowerCase().startsWith(name.toLowerCase()) && head.length < 120) {
        paras.shift();
        const rest = head.slice(name.length).replace(/^[\s.:—-]+/, '');
        if (rest) name = `${name}. ${rest}`;
      }
      sections.push({ title: name, paras: ['#' + name, '', ...paras] });
    }
  }

  // Нашлось только старое издание с ятями — перевожу в современную орфографию
  // Only a pre-1918 edition was found — convert it to modern spelling
  if (sections.some((s) => s.paras.some((p) => /[ѣѢ]/.test(p)))) {
    for (const s of sections) {
      s.title = s.title && modernize(s.title);
      s.paras = s.paras.map(modernize);
    }
  }
  const book = toChunks(sections);
  if (book.totalChars < 200) throw new Error('В этой записи нет текста книги — попробуйте другое издание или название');
  return { title: found.name, author, format: 'txt', cover: null, ...book };
}
