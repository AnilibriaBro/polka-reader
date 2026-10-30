import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addBookmark, chunkAt, chunkCount, deleteBookmark, getChunk, listBookmarks, listChapters, savePosition,
  type Book, type Bookmark, type Chunk, type Settings,
} from './db';
import Sheet from './Sheet';
import { IconBack, IconBookmark, IconList, IconTrash, IconType } from './icons';
import { useBack } from './platform';
import { hyphenate, toPlain, toShown } from './hyphen';

// Экран чтения. Текст куска книги раскладываю в колонки шириной в экран (CSS columns):
// одна колонка = одна страница, листание = сдвиг колонок. Позицию храню как номер символа,
// поэтому после смены шрифта или поворота телефона открывается то же место.
//
// Reading screen. A chunk of text is laid out in screen-wide CSS columns:
// one column = one page, flipping = shifting the columns. Position is stored as a character
// index, so after a font change or rotation the same place stays on screen.

type Props = { book: Book; settings: Settings; onSettings: (s: Settings) => void; onClose: () => void };
type Geo = { w: number; h: number; step: number };
type SheetName = 'toc' | 'marks' | 'type' | null;

// Номер строфы в стихах: «II.», «12» / A stanza number in verse: "II.", "12"
const STANZA = /^([IVXLC]+|\d{1,3})\.?$/;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Прямоугольники строк текста элемента (или самого элемента, если текста нет)
// Line boxes of an element's text (or the element itself when it has no text)
const range = document.createRange();
function rectsOf(el: Element): DOMRect[] {
  if (el.firstChild) {
    range.selectNodeContents(el);
    const r = Array.from(range.getClientRects()).filter((x) => x.width || x.height);
    if (r.length) return r;
  }
  return [el.getBoundingClientRect()];
}
function charLeft(t: Text, i: number) {
  range.setStart(t, i);
  range.setEnd(t, Math.min(t.length, i + 1));
  const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return r.left;
}

export default function Reader({ book, settings, onSettings, onClose }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const count = useMemo(() => chunkCount(book.id), [book.id]);
  const chapters = useMemo(() => listChapters(book.id), [book.id]);

  const [chunk, setChunk] = useState<Chunk | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [pageStart, setPageStart] = useState(0); // начало страницы в символах от начала куска / page start within chunk
  const [pageEnd, setPageEnd] = useState(0);
  const [chrome, setChrome] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [marks, setMarks] = useState<Bookmark[]>(() => listBookmarks(book.id));
  const [drag, setDrag] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [layout, setLayout] = useState(0); // счётчик раскладок / layout counter

  // Куда встать после раскладки: символ в куске или «конец куска»
  // Where to land after layout: a char inside the chunk or "chunk end"
  const target = useRef<number | 'end'>(0);
  const relaid = useRef(false);

  const loadChunk = useCallback((idx: number, at: number | 'end') => {
    const c = getChunk(book.id, idx);
    if (!c) return;
    target.current = at;
    setAnimate(false);
    setChunk(c);
  }, [book.id]);

  // Открываю книгу с сохранённого места / Opening the book at the saved place
  useEffect(() => {
    const pos = Math.min(book.pos, Math.max(0, book.totalChars - 1));
    const idx = chunkAt(book.id, pos);
    const c = getChunk(book.id, idx);
    target.current = c ? pos - c.start : 0;
    setChunk(c);
  }, [book]);

  // Размер страницы: следим за размером окна / Page size: watching the window size
  useLayoutEffect(() => {
    const el = frame.current!;
    const measure = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.getPropertyValue('--pad-x')) || 24; // поля страницы / page margins
      const w = Math.min(el.clientWidth - padX * 2, 620);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setGeo((g) => (g && g.w === w && g.h === h ? g : { w, h: Math.floor(h), step: w + padX * 2 }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Абзацы куска с их местом в тексте / Chunk paragraphs with their position in the text
  const paras = useMemo(() => {
    if (!chunk) return [];
    let o = 0;
    let headingRun = true; // заголовки в самом начале куска — это открытие главы / headings at chunk start open a chapter
    return chunk.body.split('\n').map((line, i) => {
      const mark = '#>~'.includes(line[0]) && line ? line[0] : '';
      const text = mark ? line.slice(1) : line;
      const start = o + (mark ? 1 : 0);
      o += line.length + 1;
      const opening = headingRun && mark === '#' && !!chunk.title;
      if (mark !== '#' && line !== '') headingRun = false;
      // в заголовках и стихах переносов не ставлю / no hyphenation in headings and verse
      return { key: i, mark, text: mark === '#' || mark === '~' ? text : hyphenate(text), start, opening };
    });
  }, [chunk]);
  const isLastChunk = chunk ? chunk.idx === count - 1 : false;

  // --- Измерения / Measurements ---

  const elements = () => Array.from(inner.current?.children ?? []) as HTMLElement[];
  const base = () => inner.current!.getBoundingClientRect().left;

  // Номер символа, с которого начинается страница / The char index a page starts with
  const offsetOfPage = useCallback((p: number) => {
    const els = elements();
    if (!geo || !els.length) return 0;
    const b = base();
    const x0 = p * geo.step;
    let lo = 0, hi = els.length - 1, ans = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const rs = rectsOf(els[mid]);
      if (rs[rs.length - 1].right - b > x0 + 1) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    const el = els[ans];
    const o = Number(el.dataset.o);
    if (rectsOf(el)[0].left - b >= x0 - 1) return o;
    // Абзац начался на прошлой странице — ищу первый символ на этой
    // Paragraph started on the previous page — find its first char on this one
    const t = el.firstChild as Text | null;
    if (!t || t.nodeType !== Node.TEXT_NODE) return o;
    let l = 0, h = t.length - 1, k = h;
    while (l <= h) {
      const m = (l + h) >> 1;
      if (charLeft(t, m) - b >= x0 - 1) { k = m; h = m - 1; } else l = m + 1;
    }
    return o + toPlain(t.data, k); // на экране есть переносы, в базе — нет / screen text has soft hyphens, DB text doesn't
  }, [geo]);

  // На какой странице символ / Which page a char is on
  const pageOfOffset = useCallback((off: number, total: number) => {
    const els = elements();
    if (!geo || !els.length) return 0;
    let i = 0;
    for (let lo = 0, hi = els.length - 1; lo <= hi;) {
      const mid = (lo + hi) >> 1;
      if (Number(els[mid].dataset.o) <= off) { i = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const el = els[i];
    const o = Number(el.dataset.o);
    const t = el.firstChild as Text | null;
    const x = off > o && t?.nodeType === Node.TEXT_NODE
      ? charLeft(t, Math.min(toShown(t.data, off - o), t.length - 1))
      : rectsOf(el)[0].left;
    return Math.max(0, Math.min(total - 1, Math.floor((x - base() + 1) / geo.step)));
  }, [geo]);

  // Раскладка: после смены куска, шрифта или размера считаю страницы и встаю на нужное место
  // Layout: after a chunk, font or size change, count pages and land on the right place
  useLayoutEffect(() => {
    if (!chunk || !geo || !inner.current) return;
    const els = elements();
    const last = rectsOf(els[els.length - 1]);
    const n = Math.max(1, Math.floor((last[last.length - 1].right - base() - 1) / geo.step) + 1);
    setPages(n);
    const t = target.current;
    setPage(t === 'end' ? n - 1 : pageOfOffset(t, n));
    setLayout((v) => v + 1);
    relaid.current = true;
  }, [chunk, geo, settings.fontSize, settings.font, settings.justify, pageOfOffset]);

  // После листания: запоминаю позицию / After a flip: remember the position
  useLayoutEffect(() => {
    if (!chunk || !geo || !inner.current) return;
    // Только что пересчитали раскладку, а номер страницы ещё старый — жду следующего прохода
    // Layout was just recomputed but the page number is still old — wait for the next pass
    if (relaid.current) { relaid.current = false; return; }
    const start = offsetOfPage(page);
    const end = page < pages - 1 ? offsetOfPage(page + 1) : chunk.body.length + 1;
    target.current = start;
    setPageStart(start);
    setPageEnd(end);
    const atEnd = isLastChunk && page === pages - 1;
    savePosition(book.id, atEnd ? book.totalChars : chunk.start + start);
    // (настройки в списке, чтобы этот эффект всегда шёл в одном проходе с раскладкой)
    // (settings are listed so this effect always runs in the same pass as the layout)
  }, [page, pages, chunk, geo, layout, isLastChunk, book.id, book.totalChars, offsetOfPage, settings.fontSize, settings.font, settings.justify]);

  // --- Листание / Flipping ---

  const next = useCallback(() => {
    if (!chunk) return;
    if (page < pages - 1) { setAnimate(true); setPage(page + 1); }
    else if (chunk.idx < count - 1) loadChunk(chunk.idx + 1, 0);
  }, [chunk, page, pages, count, loadChunk]);

  const prev = useCallback(() => {
    if (!chunk) return;
    if (page > 0) { setAnimate(true); setPage(page - 1); }
    else if (chunk.idx > 0) loadChunk(chunk.idx - 1, 'end');
  }, [chunk, page, loadChunk]);

  const jump = useCallback((pos: number) => {
    if (!chunk) return;
    const idx = chunkAt(book.id, pos);
    const c = idx === chunk.idx ? chunk : getChunk(book.id, idx);
    if (!c) return;
    if (idx === chunk.idx) { setAnimate(false); setPage(pageOfOffset(pos - c.start, pages)); }
    else loadChunk(idx, pos - c.start);
  }, [book.id, chunk, pages, pageOfOffset, loadChunk]);

  // Клавиатура на компьютере / Keyboard on a computer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, sheet]);

  // Кнопка «Назад» на Android: закрыть панель, потом меню, потом вернуться на полку
  // Android back button: close the sheet, then the menu, then return to the shelf
  useBack(() => {
    if (sheet) setSheet(null);
    else if (chrome) setChrome(false);
    else onClose();
  });

  // Касания: свайп листает, тап по краю — тоже, тап посередине — меню
  // Touch: swipe flips, tapping an edge flips too, tapping the middle opens the menu
  const touch = useRef<{ x: number; y: number; id: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    touch.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const t = touch.current;
    if (!t || t.id !== e.pointerId || chrome) return;
    const dx = e.clientX - t.x;
    if (Math.abs(dx) > 6) { setAnimate(false); setDrag(dx); }
  };
  const onUp = (e: React.PointerEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    setAnimate(true);
    setDrag(0);
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && !chrome) {
      if (dx < 0) next(); else prev();
      return;
    }
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;
    if (chrome) { setChrome(false); return; }
    const w = frame.current!.clientWidth;
    if (e.clientX < w * 0.3) prev();
    else if (e.clientX > w * 0.7) next();
    else setChrome(true);
  };

  // --- Закладки и главы / Bookmarks and chapters ---

  const globalStart = chunk ? chunk.start + pageStart : 0;
  const globalEnd = chunk ? chunk.start + pageEnd : 0;
  const pageMarks = marks.filter((m) => m.pos >= globalStart && m.pos < globalEnd);
  const atBookEnd = isLastChunk && page === pages - 1;
  const progress = book.totalChars ? (atBookEnd ? 1 : globalStart / book.totalChars) : 0;
  const chapter = [...chapters].reverse().find((c) => c.start <= globalStart);

  const toggleMark = () => {
    if (!chunk) return;
    if (pageMarks.length) pageMarks.forEach((m) => deleteBookmark(m.id));
    else {
      const snippet = chunk.body.slice(pageStart, pageStart + 160).replace(/(^|\n)[#>~]/g, '$1').replace(/\s+/g, ' ').trim();
      addBookmark(book.id, globalStart, snippet);
    }
    setMarks(listBookmarks(book.id));
  };

  const pct = (pos: number) => `${Math.round((pos / Math.max(1, book.totalChars)) * 100)}\u00a0%`;
  const shown = scrub ?? progress;

  const style = {
    '--fs': `${settings.fontSize}px`,
    '--col': geo ? `${geo.w}px` : '100%',
    '--gap': geo ? `${geo.step - geo.w}px` : '0px',
    '--page-h': geo ? `${geo.h}px` : '100%',
  } as React.CSSProperties;

  return (
    <main className={`reader font-${settings.font}${settings.justify ? ' justify' : ''}`} style={style}>
      <div ref={frame} className="page-frame" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={() => { touch.current = null; setDrag(0); setAnimate(true); }}>
        <div className="page-clip">
          <div ref={inner} key={chunk?.idx} lang="ru" className={`columns${animate && !reduceMotion ? ' anim' : ''}`}
            style={{ transform: geo ? `translate3d(${-page * geo.step + drag}px,0,0)` : undefined }}>
            {paras.map((p) =>
              p.mark === '#' ? <h3 key={p.key} data-o={p.start} className={p.opening ? 'opening' : ''}>{p.text}</h3>
                : p.text === '' ? <div key={p.key} data-o={p.start} className="gap" />
                  : <p key={p.key} data-o={p.start} className={p.mark === '>' ? 'epi' : p.mark !== '~' ? '' : STANZA.test(p.text) ? 'verse stanza' : 'verse'}>{p.text}</p>)}
            {isLastChunk && <div className="the-end" data-o={chunk!.body.length}>Конец</div>}
          </div>
        </div>
        {/* Ленточка-закладка на странице / Ribbon bookmark on the page */}
        <span className={`ribbon${pageMarks.length ? ' on' : ''}`} aria-hidden="true" />
      </div>

      <footer className="page-foot" aria-hidden={chrome}>
        <span className="foot-chapter">{chapter?.title ?? book.title}</span>
        <span className="foot-pct">{Math.floor(progress * 100)}&nbsp;%</span>
      </footer>

      {/* Меню поверх страницы / Menu over the page */}
      <div className={`chrome${chrome ? ' open' : ''}`} inert={!chrome}>
        <header className="chrome-top">
          <button className="icon-btn" onClick={onClose} aria-label="На полку"><IconBack /></button>
          <div className="chrome-title">
            <span>{book.title}</span>
            {book.author && <small>{book.author}</small>}
          </div>
          <button className={`icon-btn${pageMarks.length ? ' marked' : ''}`} onClick={toggleMark}
            aria-label={pageMarks.length ? 'Убрать закладку' : 'Добавить закладку'} aria-pressed={pageMarks.length > 0}>
            <IconBookmark filled={pageMarks.length > 0} />
          </button>
        </header>
        <div className="chrome-bottom">
          <div className="scrub">
            <span className="scrub-where">
              {scrub !== null ? `${Math.round(scrub * 100)}\u00a0%` : chapter?.title ?? ''}
            </span>
            <input type="range" min={0} max={1000} value={Math.round(shown * 1000)} aria-label="Место в книге"
              aria-valuetext={`${Math.round(shown * 100)}\u00a0%`}
              onChange={(e) => setScrub(Number(e.target.value) / 1000)}
              onPointerUp={() => { if (scrub !== null) jump(Math.round(scrub * book.totalChars)); setScrub(null); }}
              onKeyUp={() => { if (scrub !== null) jump(Math.round(scrub * book.totalChars)); setScrub(null); }} />
          </div>
          <nav className="tools">
            <button onClick={() => setSheet('toc')} disabled={!chapters.length}><IconList /> Оглавление</button>
            <button onClick={() => setSheet('marks')}><IconBookmark /> Закладки{marks.length ? ` (${marks.length})` : ''}</button>
            <button onClick={() => setSheet('type')}><IconType /> Шрифт и тема</button>
          </nav>
        </div>
      </div>

      {sheet === 'toc' && (
        <Sheet title="Оглавление" onClose={() => setSheet(null)}>
          <ol className="toc">
            {chapters.map((c) => (
              <li key={c.idx}>
                <button className={c === chapter ? 'current' : ''} onClick={() => { loadChunk(c.idx, 0); setSheet(null); setChrome(false); }}>
                  <span>{c.title}</span><small>{pct(c.start)}</small>
                </button>
              </li>
            ))}
          </ol>
        </Sheet>
      )}

      {sheet === 'marks' && (
        <Sheet title="Закладки" onClose={() => setSheet(null)}>
          {!marks.length && <p className="sheet-note">Закладок пока нет. Откройте меню на нужной странице и нажмите на ленточку вверху справа.</p>}
          <ul className="marks">
            {marks.map((m) => (
              <li key={m.id}>
                <button className="mark-go" onClick={() => { jump(m.pos); setSheet(null); setChrome(false); }}>
                  <small>{pct(m.pos)}</small>
                  <span>{m.snippet}</span>
                </button>
                <button className="icon-btn small" aria-label="Удалить закладку"
                  onClick={() => { deleteBookmark(m.id); setMarks(listBookmarks(book.id)); }}><IconTrash size={18} /></button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {sheet === 'type' && (
        <Sheet title="Шрифт и тема" onClose={() => setSheet(null)}>
          <div className="type-row">
            <span>Размер</span>
            <div className="stepper">
              <button onClick={() => onSettings({ ...settings, fontSize: Math.max(14, settings.fontSize - 1) })}
                disabled={settings.fontSize <= 14} aria-label="Мельче">А−</button>
              <output>{settings.fontSize}</output>
              <button onClick={() => onSettings({ ...settings, fontSize: Math.min(30, settings.fontSize + 1) })}
                disabled={settings.fontSize >= 30} aria-label="Крупнее">А+</button>
            </div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Шрифт">
            {(['serif', 'sans'] as const).map((f) => (
              <button key={f} role="radio" aria-checked={settings.font === f} className={`font-${f}`}
                onClick={() => onSettings({ ...settings, font: f })}>
                <b>Аа</b>{f === 'serif' ? 'С засечками' : 'Без засечек'}
              </button>
            ))}
          </div>
          <div className="seg themes" role="radiogroup" aria-label="Тема">
            {([['light', 'Светлая'], ['sepia', 'Сепия'], ['dark', 'Тёмная']] as const).map(([t, label]) => (
              <button key={t} role="radio" aria-checked={settings.theme === t} className={`swatch-${t}`}
                onClick={() => onSettings({ ...settings, theme: t })}>
                <i aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <label className="switch">
            <span>Выравнивать по ширине</span>
            <input type="checkbox" checked={settings.justify} onChange={(e) => onSettings({ ...settings, justify: e.target.checked })} />
          </label>
        </Sheet>
      )}
    </main>
  );
}
