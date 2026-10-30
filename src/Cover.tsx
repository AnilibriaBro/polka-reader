import type { Book } from './db';

// Обложка книги. Если в файле есть картинка — показываю её. Если нет (TXT, FB2 без обложки) —
// рисую обложку «под старый переплёт»: ткань, корешок, тиснение золотом.
// Book cover. If the file has a picture, show it. Otherwise draw an old-hardcover look:
// cloth, spine, gold-foil stamping.

// Цвета переплётной ткани / Bookcloth colors
const CLOTHS = ['#6b2526', '#1f4436', '#1e2e4c', '#8f6121', '#45515a', '#46293f', '#1d4a4e', '#5a3a24'];

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
};

export default function Cover({ book, className = '' }: { book: Pick<Book, 'title' | 'author' | 'cover'>; className?: string }) {
  if (book.cover) {
    return (
      <div className={`cover ${className}`}>
        <img src={book.cover} alt="" draggable={false} />
      </div>
    );
  }
  const cloth = CLOTHS[hash(book.title + book.author) % CLOTHS.length];
  // Размер букв подбираю под самое длинное слово, чтобы слова не рвались посередине
  // Font size fits the longest word so words never break in the middle
  const longest = Math.max(...book.title.split(/\s+/).map((w) => w.length));
  const size = Math.min(11.5, 112 / Math.max(1, longest));
  return (
    <div className={`cover cloth ${className}`} style={{ '--cloth': cloth } as React.CSSProperties} aria-hidden="true">
      <div className="foil">
        <span className="foil-title" style={{ fontSize: `${size}cqi` }}>{book.title}</span>
        {book.author && <span className="foil-author">{book.author}</span>}
      </div>
    </div>
  );
}
