import { SITE } from './platform';
import { APP_VERSION } from './version';

// Проверка новой версии (только в Android-приложении: веб-версия обновляется сама).
// На сайте лежит app.json с номером последней версии и ссылкой на APK.
// New version check (Android app only: the web version updates itself).
// The site has app.json with the latest version number and the APK link.

export type AppRelease = { version: string; url: string; notes: string };

// 1.10.0 новее, чем 1.9.0 — сравниваю по числам, а не как строки / compare numerically
const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
};

export async function checkRelease(): Promise<AppRelease | null> {
  try {
    const res = await fetch(`${SITE}app.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const r = await res.json();
    if (typeof r?.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version) || typeof r.url !== 'string') return null;
    // Скачивать разрешаю только с нашей страницы выпусков на GitHub / Downloads only from our GitHub releases
    if (!r.url.startsWith('https://github.com/AnilibriaBro/polka-reader/releases/')) return null;
    return newer(r.version, APP_VERSION) ? { version: r.version, url: r.url, notes: typeof r.notes === 'string' ? r.notes : '' } : null;
  } catch {
    return null; // нет интернета — проверю в следующий раз / offline — check next time
  }
}
