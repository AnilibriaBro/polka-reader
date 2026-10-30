import { useRef, useState } from 'react';
import type { Book } from './db';
import Cover from './Cover';
import Sheet from './Sheet';
import { IconFile, IconMore, IconPlus, IconSearch, IconTrash } from './icons';
import { isIOS, isNative, isStandalone } from './platform';
import { hyphenate } from './hyphen';

// Экран «Полка»: книга, которую читаю сейчас, и все остальные книги
// The "Shelf" screen: the book being read now and all the other books

const percent = (b: Pick<Book, 'pos' | 'totalChars'>) =>
  b.totalChars ? Math.min(100, Math.round((b.pos / b.totalChars) * 100)) : 0;

const status = (b: Book) => {
  const p = percent(b);
  if (!b.openedAt) return 'Новая';
  if (p >= 100) return 'Прочитана';
  return `${p}\u00a0%`;
};

type Props = {
  books: Book[];
  busy: string | null;
  onOpen: (id: number) => void;
  onAdd: (files: FileList) => void;
  onSample: () => void;
  onFind: () => void;
  onDelete: (id: number) => void;
};

const FORMAT = { txt: 'файл TXT', fb2: 'файл FB2', wiki: 'из Викитеки' };

export default function Library({ books, busy, onOpen, onAdd, onSample, onFind, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<Book | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  // «Читаю сейчас» — последняя открытая и не дочитанная книга
  // "Reading now" — the last opened book that isn't finished
  const current = books.find((b) => b.openedAt && percent(b) < 100);

  const pick = () => input.current?.click();

  return (
    <main className="library">
      <header className="lib-head">
        <h1>Полка</h1>
        {books.length > 0 && (
          <button className="add-btn" onClick={() => setAdding(true)} disabled={!!busy}>
            <IconPlus size={20} /> Добавить книгу
          </button>
        )}
      </header>

      {/* Без accept: на Android файлы .fb2 иначе бывают серыми и не выбираются */}
      {/* No accept attribute: otherwise Android may grey out .fb2 files */}
      <input ref={input} type="file" multiple hidden
        onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ''; }} />

      {busy && <p className="busy" role="status">{busy}</p>}

      {!books.length && (
        <section className="empty">
          <div className="empty-shelf" aria-hidden="true">
            <Cover book={{ title: 'Ваша книга', author: '', cover: null }} className="lean" />
          </div>
          <h2>Здесь будут ваши книги</h2>
          <p>Найдите классику в бесплатной библиотеке или добавьте файл&nbsp;.txt или&nbsp;.fb2 с&nbsp;телефона. Книги хранятся только на этом устройстве, читать можно без интернета.</p>
          <div className="empty-actions">
            <button className="primary" onClick={onFind} disabled={!!busy}><IconSearch /> Найти книгу</button>
            <button className="ghost" onClick={pick} disabled={!!busy}><IconFile size={20} /> Выбрать файл</button>
          </div>
          <button className="link" onClick={onSample} disabled={!!busy}>Открыть пример: «Капитанская дочка»</button>
        </section>
      )}

      {current && (
        <section className="now" aria-label="Читаю сейчас">
          <button className="now-card" onClick={() => onOpen(current.id)}>
            <Cover book={current} />
            <span className="now-text">
              <span className="now-label">Читаю сейчас</span>
              <span className="now-title">{hyphenate(current.title)}</span>
              {current.author && <span className="now-author">{current.author}</span>}
              <span className="meter" aria-hidden="true"><span style={{ width: `${percent(current)}%` }} /></span>
              <span className="now-go">Продолжить с {percent(current)}&nbsp;%</span>
            </span>
          </button>
        </section>
      )}

      {books.length > 0 && (
        <section aria-label="Все книги">
          <h2 className="shelf-title">Все книги <span>{books.length}</span></h2>
          <ul className="shelf">
            {books.map((b) => (
              <li key={b.id}>
                <button className="book" onClick={() => onOpen(b.id)} aria-label={`${b.title}, ${status(b)}`}>
                  <Cover book={b} />
                  <span className="book-line" aria-hidden="true"><span style={{ width: `${percent(b)}%` }} /></span>
                </button>
                <div className="book-meta">
                  <span className="book-title">{hyphenate(b.title)}</span>
                  <button className="icon-btn small" onClick={() => { setMenu(b); setConfirm(false); }} aria-label={`Действия: ${b.title}`}>
                    <IconMore size={18} />
                  </button>
                </div>
                <span className="book-status">{status(b)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Подсказка для веб-версии на iPhone: как поставить иконку на экран «Домой» */}
      {/* Hint for the iPhone web version: how to add the icon to the Home Screen */}
      {!isNative && isIOS && !isStandalone && (
        <p className="install-hint">
          Чтобы «Полка» открывалась как приложение и без интернета: в Safari нажмите «Поделиться», затем «На экран „Домой“».
        </p>
      )}

      {adding && (
        <Sheet title="Добавить книгу" onClose={() => setAdding(false)}>
          <button className="row-btn big" onClick={() => { setAdding(false); onFind(); }}>
            <IconSearch size={22} />
            <span><b>Найти в библиотеке</b><small>Бесплатная классика из Викитеки, нужен интернет</small></span>
          </button>
          <button className="row-btn big" onClick={() => { setAdding(false); pick(); }}>
            <IconFile />
            <span><b>Выбрать файл</b><small>TXT или FB2 из памяти телефона</small></span>
          </button>
        </Sheet>
      )}

      {menu && (
        <Sheet title={menu.title} onClose={() => setMenu(null)}>
          <p className="sheet-note">
            {menu.author ? `${menu.author}. ` : ''}Книга {FORMAT[menu.format]}, примерно {Math.round(menu.totalChars / 1800)} стр. Прочитано {percent(menu)}&nbsp;%.
          </p>
          {!confirm ? (
            <button className="row-btn danger" onClick={() => setConfirm(true)}><IconTrash /> Удалить книгу</button>
          ) : (
            <div className="confirm">
              <p>Удалить книгу вместе с закладками? Вернуть её можно, только добавив заново.</p>
              <div className="confirm-row">
                <button className="ghost" onClick={() => setMenu(null)}>Оставить</button>
                <button className="primary danger" onClick={() => { onDelete(menu.id); setMenu(null); }}>Удалить</button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </main>
  );
}
