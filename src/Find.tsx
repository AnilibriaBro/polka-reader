import { useEffect, useRef, useState } from 'react';
import { addBook, type Book } from './db';
import Cover from './Cover';
import { IconBack, IconSearch } from './icons';
import { useBack } from './platform';
import { download, search, type Found } from './wikisource';

// Экран «Найти книгу»: поиск в Викитеке, скачивание на полку одной кнопкой.
// "Find a book" screen: search Wikisource, download to the shelf with one tap.

// Школьная программа — проверено, что все эти книги в Викитеке есть и скачиваются
// School curriculum — all of these were checked to exist on Wikisource and download fine
const SCHOOL = [
  'Капитанская дочка (Пушкин)', 'Евгений Онегин (Пушкин)', 'Дубровский (Пушкин)', 'Пиковая дама (Пушкин)',
  'Герой нашего времени (Лермонтов)', 'Мёртвые души (Гоголь)', 'Шинель (Гоголь)', 'Ревизор (Гоголь)',
  'Тарас Бульба (Гоголь)', 'Горе от ума (Грибоедов)', 'Недоросль (Фонвизин)', 'Бедная Лиза (Карамзин)',
  'Муму (Тургенев)', 'Отцы и дети (Тургенев)', 'Гроза (Островский)', 'Обломов (Гончаров)',
  'Кому на Руси жить хорошо (Некрасов)', 'Левша (Лесков)', 'Преступление и наказание (Достоевский)',
  'Идиот (Достоевский)', 'Война и мир (Толстой)', 'Анна Каренина (Толстой)', 'После бала (Толстой)',
  'Вишнёвый сад (Чехов)', 'Человек в футляре (Чехов)', 'Хамелеон (Чехов)', 'Палата № 6 (Чехов)',
  'Старуха Изергиль (Горький)', 'На дне (Горький)',
].map((title) => {
  const m = title.match(/^(.*) \((.*)\)$/)!;
  return { title, name: m[1], author: m[2] };
});

type State = { done: number; total: number } | { bookId: number } | { error: string };

type Props = { books: Book[]; onBack: () => void; onAdded: () => void; onOpen: (id: number) => void };

export default function Find({ books, onBack, onAdded, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, State>>({});
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef('');

  useBack(onBack);

  // Ищу через полсекунды после того, как перестали печатать / Search half a second after typing stops
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setError(null); return; }
    const t = setTimeout(async () => {
      asked.current = q;
      setSearching(true);
      setError(null);
      try {
        const r = await search(q);
        if (asked.current === q) setResults(r);
      } catch (e) {
        if (asked.current === q) setError((e as Error).message);
      } finally {
        if (asked.current === q) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  // Книга уже на полке? Сравниваю по названию / Is the book already on the shelf? Compare by title
  const onShelf = (f: Found) => books.find((b) => b.title === f.name && (!f.author || b.author.includes(f.author)));

  const get = async (f: Found) => {
    setStates((s) => ({ ...s, [f.title]: { done: 0, total: 1 } }));
    try {
      const book = await download(f, (done, total) => setStates((s) => ({ ...s, [f.title]: { done, total } })));
      const id = await addBook({ ...book, format: 'wiki' });
      setStates((s) => ({ ...s, [f.title]: { bookId: id } }));
      onAdded();
    } catch (e) {
      setStates((s) => ({ ...s, [f.title]: { error: (e as Error).message } }));
    }
  };

  const row = (f: Found) => {
    const st = states[f.title];
    const have = onShelf(f);
    const id = st && 'bookId' in st ? st.bookId : have?.id;
    const busy = st && 'total' in st;
    return (
      <li key={f.title} className="find-row">
        <Cover book={{ title: f.name, author: f.author, cover: null }} className="mini" />
        <div className="find-text">
          <span className="find-title">{f.name}</span>
          {f.author && <span className="find-author">{f.author}</span>}
          {st && 'error' in st && <span className="find-error">{st.error}</span>}
        </div>
        {id ? (
          <button className="pill solid" onClick={() => onOpen(id)}>Читать</button>
        ) : busy ? (
          <span className="pill progress" role="status" aria-label="Скачиваю"
            style={{ '--p': `${Math.round((st.done / Math.max(1, st.total)) * 100)}%` } as React.CSSProperties}>
            {st.total > 1 ? `${st.done} из ${st.total}` : 'Скачиваю'}
          </span>
        ) : (
          <button className="pill" onClick={() => get(f)}>{st && 'error' in st ? 'Ещё раз' : 'Скачать'}</button>
        )}
      </li>
    );
  };

  return (
    <main className="find">
      <header className="find-head">
        <button className="icon-btn" onClick={onBack} aria-label="На полку"><IconBack /></button>
        <h1>Найти книгу</h1>
      </header>

      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
        <IconSearch />
        <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Название или автор" aria-label="Название или автор" enterKeyHint="search" autoComplete="off" />
      </form>
      <p className="find-note">
        Классика из Викитеки — бесплатно и законно. Интернет нужен только чтобы найти и скачать книгу, читать можно без него.
      </p>

      {error && <p className="find-error block" role="alert">{error}</p>}
      {searching && !results && <p className="find-note" role="status">Ищу…</p>}

      {results ? (
        <section aria-label="Найдено">
          <h2 className="shelf-title">Найдено <span>{results.length}</span></h2>
          {!results.length && <p className="find-note">Ничего не нашлось. Попробуйте фамилию автора или часть названия.</p>}
          <ul className="find-list">{results.map(row)}</ul>
        </section>
      ) : (
        <section aria-label="Школьная программа">
          <h2 className="shelf-title">Школьная программа</h2>
          <ul className="find-list">{SCHOOL.map(row)}</ul>
        </section>
      )}
    </main>
  );
}
