import { useEffect } from 'react';
import { IconClose } from './icons';

// Выезжающая снизу панель (оглавление, закладки, шрифт, меню книги)
// Bottom sheet (contents, bookmarks, font settings, book menu)
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Esc на компьютере закрывает панель / Esc closes the sheet on a computer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-layer" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><IconClose /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
