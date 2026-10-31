import { useCallback, useEffect, useState } from 'react';
import { addBook, deleteBook, getBook, listBooks, loadSettings, saveSettings, type Book, type Settings } from './db';
import { importBook, importFile } from './importer';
import { listenForBooks } from './openWith';
import { isNative } from './platform';
import { checkRelease, type AppRelease } from './update';
import Find from './Find';
import Library from './Library';
import Reader from './Reader';

// Главный компонент: переключаю полку и чтение, храню настройки
// Main component: switches between the shelf and the reader, keeps the settings

const THEME_BG = { light: '#e3e5dc', sepia: '#e3e5dc', dark: '#191c1a' };
const PAGE_BG = { light: '#fbfaf6', sepia: '#f2e6cf', dark: '#1d1f1e' };

export default function App() {
  const [books, setBooks] = useState<Book[]>(() => listBooks());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [open, setOpen] = useState<Book | null>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [release, setRelease] = useState<AppRelease | null>(null);

  // Новая версия: проверяю при запуске и когда приложение снова открывают (только APK —
  // веб-версия на iPhone обновляется сама)
  // New version: checked at launch and whenever the app is reopened (APK only — the web version updates itself)
  useEffect(() => {
    if (!isNative) return;
    const check = () => checkRelease().then((r) => r && setRelease(r));
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Тема: на всю страницу и на цвет строки состояния телефона
  // Theme: applied to the whole page and the phone's status bar color
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    const color = open ? PAGE_BG[settings.theme] : THEME_BG[settings.theme];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [settings.theme, open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Книга пришла из другого приложения (Telegram, «Файлы») — добавляю и сразу открываю
  // A book came from another app (Telegram, Files) — add it and open right away
  useEffect(() => {
    listenForBooks(async ({ bytes, name }) => {
      setBusy(`Добавляю «${name}»…`);
      try {
        const id = await addBook(await importBook(bytes, name));
        setBooks(listBooks());
        setOpen(getBook(id));
      } catch (e) {
        setToast(`Не добавлено: ${e instanceof Error ? e.message : 'не получилось прочитать файл'}`);
      } finally {
        setBusy(null);
      }
    }, setToast);
  }, []);

  const changeSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  // Добавляю книги из выбранных файлов / Adding books from the picked files
  const add = async (files: File[]) => {
    const added: string[] = [];
    const failed: string[] = [];
    for (const f of files) {
      setBusy(`Добавляю «${f.name}»…`);
      try {
        const book = await importFile(f);
        await addBook(book);
        added.push(book.title);
      } catch (e) {
        failed.push(`${f.name}: ${e instanceof Error ? e.message : 'не получилось прочитать файл'}`);
      }
    }
    setBusy(null);
    setBooks(listBooks());
    const ok = added.length === 1 ? `Книга «${added[0]}» на полке.` : added.length ? `Добавлено книг: ${added.length}.` : '';
    const bad = failed.length ? `Не добавлено: ${failed.join('; ')}` : '';
    setToast([ok, bad].filter(Boolean).join(' '));
  };

  // Пример лежит внутри приложения, интернет не нужен / The sample ships inside the app, no internet needed
  const addSample = async () => {
    const res = await fetch('./sample/kapitanskaya-dochka.fb2');
    await add([new File([await res.blob()], 'kapitanskaya-dochka.fb2')]);
  };

  const remove = async (id: number) => {
    const title = books.find((b) => b.id === id)?.title;
    await deleteBook(id);
    setBooks(listBooks());
    setToast(`Книга «${title}» удалена`);
  };

  const close = () => {
    setOpen(null);
    setBooks(listBooks());
  };

  return (
    <>
      {finding ? (
        // Поиск остаётся под открытой книгой: «Назад» из книги вернёт к результатам,
        // а начатые скачивания не прервутся
        // Search stays mounted under an open book: "Back" returns to the results, downloads keep going
        <Find books={books} onBack={() => setFinding(false)} onAdded={() => setBooks(listBooks())}
          onOpen={(id) => setOpen(getBook(id))} />
      ) : (
        !open && <Library books={books} busy={busy} onOpen={(id) => setOpen(getBook(id))}
          onAdd={(fl) => add(Array.from(fl))} onSample={addSample} onFind={() => setFinding(true)} onDelete={remove}
          release={release} onCloseRelease={() => setRelease(null)} />
      )}
      {open && <Reader key={open.id} book={open} settings={settings} onSettings={changeSettings} onClose={close} />}
      <div className="toast-zone" aria-live="polite">{toast && <p className="toast">{toast}</p>}</div>
    </>
  );
}
