import { clean } from './importer';

// HTML (страница Викитеки или глава EPUB) → абзацы с метками, как у остальных книг.
// HTML из файла никогда не вставляю в страницу как есть — беру только текст, поэтому скрипты
// и ссылки внутри книги ничего не могут сделать.
// HTML (a Wikisource page or an EPUB chapter) → marked paragraphs like other books.
// Book HTML is never inserted into the page — only its text is taken, so scripts and links inside do nothing.
export function toParas(root: Element): string[] {
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
      } else if (['script', 'style', 'img', 'svg', 'sup', 'head', 'title', 'noscript', 'iframe', 'object'].includes(tag)) {
        // служебное и картинки пропускаю / skipping service tags and images
      } else if (e.classList.contains('pg-boilerplate') || e.id === 'pg-header' || e.id === 'pg-footer') {
        // лицензия Project Gutenberg в начале и в конце книги — не текст книги / Gutenberg licence blocks
      } else if (/^h[1-6]$/.test(tag)) {
        // подписи к картинкам внутри заголовка не беру / captions inside a heading are skipped
        const h = e.cloneNode(true) as Element;
        h.querySelectorAll('.caption, img, sup, .pagenum').forEach((x) => x.remove());
        flush(mark); buf = h.textContent ?? ''; flush('#');
      } else if (e.classList.contains('poem') || e.classList.contains('stanza') || tag === 'poem') {
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

