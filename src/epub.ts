import type { NewBook } from './db';
import { toParas } from './html';
import { clean, sectionsFromParas, shrinkCover, toChunks } from './importer';
import { Zip } from './zip';

// Чтение EPUB — самого частого формата скачанных книг. EPUB — это ZIP с HTML-главами внутри:
// META-INF/container.xml → файл описания (OPF) → список глав по порядку (spine) и оглавление.
// Reading EPUB, the most common format of downloaded books. EPUB is a ZIP with HTML chapters:
// META-INF/container.xml → the OPF package file → chapters in order (spine) and the contents.

const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const byName = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));

// Путь внутри архива относительно папки файла / A path inside the archive relative to a file's folder
function resolve(base: string, href: string) {
  const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '').concat(decodeURIComponent(href.split('#')[0])).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

export async function parseEpub(zip: Zip): Promise<NewBook> {
  const container = await zip.text('META-INF/container.xml');
  const opfPath = container && xml(container).querySelector('rootfile')?.getAttribute('full-path');
  const opfText = opfPath && (await zip.text(opfPath));
  if (!opfPath || !opfText) throw new Error('Файл EPUB повреждён');
  const opf = xml(opfText);

  const meta = (name: string) => clean(byName(opf, name)[0]?.textContent ?? '');
  const title = meta('title') || 'Без названия';
  const author = byName(opf, 'creator').map((c) => clean(c.textContent ?? '')).filter(Boolean).slice(0, 3).join(', ');

  // Описание файлов книги / The book's file list
  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const item of byName(opf, 'item')) {
    manifest.set(item.getAttribute('id') ?? '', {
      href: resolve(opfPath, item.getAttribute('href') ?? ''),
      type: item.getAttribute('media-type') ?? '',
      props: item.getAttribute('properties') ?? '',
    });
  }

  // Обложка: EPUB 3 — properties="cover-image", EPUB 2 — <meta name="cover">
  // Cover: EPUB 3 uses properties="cover-image", EPUB 2 uses <meta name="cover">
  let cover: string | null = null;
  const coverId = byName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const coverItem = [...manifest.values()].find((m) => m.props.includes('cover-image')) ?? (coverId ? manifest.get(coverId) : undefined);
  const coverEntry = coverItem && coverItem.type.startsWith('image/') && zip.find(coverItem.href);
  if (coverEntry && coverEntry.size < 8 * 1024 * 1024) {
    const data = await zip.read(coverEntry);
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: coverItem.type }));
    cover = await shrinkCover(url);
    URL.revokeObjectURL(url);
  }

  // Оглавление: названия глав по файлам (EPUB 3 nav или EPUB 2 NCX)
  // Contents: chapter names per file (EPUB 3 nav or EPUB 2 NCX)
  const tocNames = new Map<string, string>();
  const nav = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
  const ncxId = byName(opf, 'spine')[0]?.getAttribute('toc');
  const ncx = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
  if (nav) {
    const doc = new DOMParser().parseFromString((await zip.text(nav.href)) ?? '', 'text/html');
    const toc = Array.from(doc.querySelectorAll('nav')).find((n) => (n.getAttribute('epub:type') ?? n.getAttribute('type')) === 'toc') ?? doc.querySelector('nav');
    for (const a of toc?.querySelectorAll('a[href]') ?? []) {
      const file = resolve(nav.href, a.getAttribute('href')!);
      if (!tocNames.has(file)) tocNames.set(file, clean(a.textContent ?? ''));
    }
  } else if (ncx) {
    const doc = xml((await zip.text(ncx.href)) ?? '');
    for (const p of byName(doc, 'navPoint')) {
      const src = byName(p, 'content')[0]?.getAttribute('src');
      const label = clean(byName(p, 'text')[0]?.textContent ?? '');
      if (src && label && !tocNames.has(resolve(ncx.href, src))) tocNames.set(resolve(ncx.href, src), label);
    }
  }

  // Главы по порядку чтения: весь текст одним потоком, в начало файла без заголовка
  // ставлю название из оглавления, потом делю на главы по заголовкам
  // Chapters in reading order: all text as one stream; a file without a heading gets its contents
  // name, then the stream is split into chapters by headings
  const all: string[] = [];
  for (const ref of byName(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item || !/html|xml/.test(item.type)) continue;
    const entry = zip.find(item.href);
    if (!entry) continue;
    const html = new TextDecoder('utf-8').decode(await zip.read(entry));
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const paras = toParas(body);
    if (!paras.length) continue;
    const label = tocNames.get(item.href);
    if (label && !paras[0].startsWith('#')) paras.unshift('#' + label);
    all.push(...paras);
  }

  const book = toChunks(sectionsFromParas(all));
  return { title, author, format: 'epub', cover, ...book };
}
