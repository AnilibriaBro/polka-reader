import { useEffect, useRef, useState } from 'react';
import { addBook, type Book, type NewBook } from './db';
import Cover from './Cover';
import * as gutenberg from './gutenberg';
import { IconBack, IconSearch } from './icons';
import { useBack } from './platform';
import * as wiki from './wikisource';

// Экран «Найти книгу»: две бесплатные законные библиотеки, скачивание на полку одной кнопкой.
//   Русская классика — Викитека; мировая классика — Project Gutenberg (книги на языке оригинала).
// "Find a book" screen: two free legal libraries, one-tap download to the shelf.
//   Russian classics — Wikisource; world classics — Project Gutenberg (original languages).

type Source = 'wiki' | 'gutenberg';
type Item = {
  key: string;
  name: string;
  author: string;
  // скачать книгу; у Gutenberg в веб-версии вместо этого — ссылка на файл
  // download the book; for Gutenberg on the web — a link to the file instead
  get?: (onProgress: (done: number, total: number) => void) => Promise<NewBook>;
  link?: string;
};

const fromWiki = (f: wiki.Found): Item => ({
  key: 'w:' + f.title, name: f.name, author: f.author,
  get: async (p) => ({ ...(await wiki.download(f, p)), format: 'wiki' }),
});
const fromGutenberg = (b: gutenberg.GutenbergBook): Item => ({
  key: 'g:' + b.id, name: b.title, author: b.author,
  ...(gutenberg.canDownload ? { get: () => gutenberg.download(b) } : { link: gutenberg.epubUrl(b.id) }),
});

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
  return fromWiki({ title, name: m[1], author: m[2] });
});

// Популярная мировая классика на Gutenberg (номера книг проверены)
// Popular world classics on Gutenberg (book numbers verified)
const WORLD: Item[] = ([
  [1342, 'Pride and Prejudice', 'Jane Austen'], [11, "Alice's Adventures in Wonderland", 'Lewis Carroll'],
  [1661, 'The Adventures of Sherlock Holmes', 'Arthur Conan Doyle'], [84, 'Frankenstein', 'Mary Shelley'],
  [64317, 'The Great Gatsby', 'F. Scott Fitzgerald'], [174, 'The Picture of Dorian Gray', 'Oscar Wilde'],
  [345, 'Dracula', 'Bram Stoker'], [1260, 'Jane Eyre', 'Charlotte Brontë'], [2701, 'Moby Dick', 'Herman Melville'],
  [98, 'A Tale of Two Cities', 'Charles Dickens'], [74, 'The Adventures of Tom Sawyer', 'Mark Twain'],
  [76, 'Adventures of Huckleberry Finn', 'Mark Twain'], [120, 'Treasure Island', 'Robert Louis Stevenson'],
  [35, 'The Time Machine', 'H. G. Wells'], [36, 'The War of the Worlds', 'H. G. Wells'],
  [103, 'Around the World in Eighty Days', 'Jules Verne'], [1184, 'The Count of Monte Cristo', 'Alexandre Dumas'],
  [135, 'Les Misérables', 'Victor Hugo'], [16, 'Peter Pan', 'J. M. Barrie'], [55, 'The Wonderful Wizard of Oz', 'L. Frank Baum'],
  [5200, 'Metamorphosis', 'Franz Kafka'], [2554, 'Crime and Punishment (English)', 'Fyodor Dostoevsky'],
] as [number, string, string][]).map(([id, title, author]) => fromGutenberg({ id, title, author }));

type State = { done: number; total: number } | { bookId: number } | { error: string } | { opened: true };

type Props = { books: Book[]; onBack: () => void; onAdded: () => void; onOpen: (id: number) => void };

export default function Find({ books, onBack, onAdded, onOpen }: Props) {
  const [source, setSource] = useState<Source>('wiki');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[] | null>(null);
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
      const ask = source + ':' + q;
      asked.current = ask;
      setSearching(true);
      setError(null);
      try {
        const r = source === 'wiki' ? (await wiki.search(q)).map(fromWiki) : (await gutenberg.search(q)).map(fromGutenberg);
        if (asked.current === ask) setResults(r);
      } catch (e) {
        if (asked.current === ask) setError((e as Error).message);
      } finally {
        if (asked.current === ask) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, source]);

  // Книга уже на полке? Сравниваю по названию / Is the book already on the shelf? Compare by title
  const onShelf = (it: Item) => books.find((b) => b.title === it.name && (!it.author || b.author.includes(it.author.split(' ').pop()!)));

  const get = async (it: Item) => {
    if (!it.get) return;
    setStates((s) => ({ ...s, [it.key]: { done: 0, total: 1 } }));
    try {
      const book = await it.get((done, total) => setStates((s) => ({ ...s, [it.key]: { done, total } })));
      const id = await addBook(book);
      setStates((s) => ({ ...s, [it.key]: { bookId: id } }));
      onAdded();
    } catch (e) {
      setStates((s) => ({ ...s, [it.key]: { error: (e as Error).message } }));
    }
  };

  const row = (it: Item) => {
    const st = states[it.key];
    const id = st && 'bookId' in st ? st.bookId : onShelf(it)?.id;
    return (
      <li key={it.key} className="find-row">
        <Cover book={{ title: it.name, author: it.author, cover: null }} className="mini" />
        <div className="find-text">
          <span className="find-title">{it.name}</span>
          {it.author && <span className="find-author">{it.author}</span>}
          {st && 'error' in st && <span className="find-error">{st.error}</span>}
          {st && 'opened' in st && <span className="find-hint">Файл скачивается в браузере. Потом нажмите «Добавить книгу → Выбрать файл».</span>}
        </div>
        {id ? (
          <button className="pill solid" onClick={() => onOpen(id)}>Читать</button>
        ) : st && 'total' in st ? (
          <span className="pill progress" role="status" aria-label="Скачиваю"
            style={{ '--p': `${Math.round((st.done / Math.max(1, st.total)) * 100)}%` } as React.CSSProperties}>
            {st.total > 1 ? `${st.done} из ${st.total}` : 'Скачиваю'}
          </span>
        ) : it.link ? (
          <a className="pill" href={it.link} target="_blank" rel="noopener noreferrer"
            onClick={() => setStates((s) => ({ ...s, [it.key]: { opened: true } }))}>Файл EPUB</a>
        ) : (
          <button className="pill" onClick={() => get(it)}>{st && 'error' in st ? 'Ещё раз' : 'Скачать'}</button>
        )}
      </li>
    );
  };

  const switchTo = (s: Source) => { setSource(s); setResults(null); setError(null); };

  return (
    <main className="find">
      <header className="find-head">
        <button className="icon-btn" onClick={onBack} aria-label="На полку"><IconBack /></button>
        <h1>Найти книгу</h1>
      </header>

      <div className="tabs" role="tablist" aria-label="Библиотека">
        <button role="tab" aria-selected={source === 'wiki'} onClick={() => switchTo('wiki')}>
          Русская классика<small>Викитека</small>
        </button>
        <button role="tab" aria-selected={source === 'gutenberg'} onClick={() => switchTo('gutenberg')}>
          Мировая классика<small>Project Gutenberg</small>
        </button>
      </div>

      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
        <IconSearch />
        <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={source === 'wiki' ? 'Название или автор' : 'Title or author, e.g. Dickens'}
          aria-label="Название или автор" enterKeyHint="search" autoComplete="off" />
      </form>
      <p className="find-note">
        {source === 'wiki'
          ? 'Книги, у которых закончились авторские права, — бесплатно и законно. Интернет нужен только чтобы найти и скачать, читать можно без него.'
          : gutenberg.canDownload
            ? '70 тысяч книг мировой классики, в основном на языке оригинала (английский, французский, немецкий…). Бесплатно и законно.'
            : '70 тысяч книг мировой классики на языке оригинала. В веб-версии книга скачивается файлом через браузер — потом добавьте его через «Выбрать файл».'}
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
        <section aria-label={source === 'wiki' ? 'Школьная программа' : 'Популярное'}>
          <h2 className="shelf-title">{source === 'wiki' ? 'Школьная программа' : 'Популярное'}</h2>
          <ul className="find-list">{(source === 'wiki' ? SCHOOL : WORLD).map(row)}</ul>
        </section>
      )}
    </main>
  );
}
