import { useRef, useState } from 'react';
import type { Book } from './db';
import Cover from './Cover';
import Sheet from './Sheet';
import { IconMore, IconPlus, IconTrash } from './icons';
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
  onDelete: (id: number) => void;
};

export default function Library({ books, busy, onOpen, onAdd, onSample, onDelete }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<Book | null>(null);
  const [confirm, setConfirm] = useState(false);
  // «Читаю сейчас» — последняя открытая и не дочитанная книга
  // "Reading now" — the last opened book that isn't finished
  const current = books.find((b) => b.openedAt && percent(b) < 100);

  const pick = () => input.current?.click();

  return (
    <main className="library">
      <header className="lib-head">
        <h1>Полка</h1>
        {books.length > 0 && (
          <button className="add-btn" onClick={pick} disabled={!!busy}>
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
          <p>Добавьте файл .txt или .fb2 из памяти телефона. Книги хранятся только на этом устройстве, интернет для чтения не нужен.</p>
          <button className="primary" onClick={pick} disabled={!!busy}>Добавить книгу</button>
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

      {menu && (
        <Sheet title={menu.title} onClose={() => setMenu(null)}>
          <p className="sheet-note">
            {menu.author ? `${menu.author}. ` : ''}Формат {menu.format.toUpperCase()}, {Math.round(menu.totalChars / 1800)} стр. примерно. Прочитано {percent(menu)}&nbsp;%.
          </p>
          {!confirm ? (
            <button className="row-btn danger" onClick={() => setConfirm(true)}><IconTrash /> Удалить книгу</button>
          ) : (
            <div className="confirm">
              <p>Удалить книгу вместе с закладками? Вернуть её можно, только добавив файл заново.</p>
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
