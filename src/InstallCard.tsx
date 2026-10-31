import { useState } from 'react';
import { APK_URL, IOS_PROFILE_URL, isAndroid, isIOS, isNative, isStandalone } from './platform';

// Как поставить «Полку» на телефон (так же, как в веб-версии других моих приложений).
// Сама понимает, где её открыли: iPhone — скачать иконку (профиль) или «На экран Домой»,
// Android в браузере — скачать APK; в приложении и с иконки на экране — не показывается.
// How to install Polka. Detects where it's open: iPhone — download the icon profile or "Add to Home
// Screen"; Android browser — download the APK; hidden inside the app or when opened from the icon.

const KEY = 'install-card-hidden';
const hiddenBefore = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

// GitHub отдаёт профиль без нужного типа файла, и Safari может не узнать его. Поэтому скачиваю
// его сам и открываю с правильным типом — тогда iPhone сразу предлагает установку.
// GitHub serves the profile with the wrong type, so I fetch it and open it with the right one.
const downloadIosProfile = async () => {
  try {
    const r = await fetch(IOS_PROFILE_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const blob = new Blob([await r.arrayBuffer()], { type: 'application/x-apple-aspen-config' });
    window.location.href = URL.createObjectURL(blob);
  } catch {
    window.location.href = IOS_PROFILE_URL; // запасной путь: файл сохранится в «Файлы» / fallback
  }
};

const ShareIcon = () => (
  <svg className="share-ico" viewBox="0 0 20 24" aria-label="значок «Поделиться»" role="img">
    <path d="M10 2v13M5.5 6.5L10 2l4.5 4.5M4 10H2.5v12h15V10H16" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export default function InstallCard() {
  const [hidden, setHidden] = useState(hiddenBefore);
  const [started, setStarted] = useState(false);

  if (isNative || isStandalone || hidden || (!isIOS && !isAndroid)) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* не запомнится — покажу ещё раз / won't be remembered — shown again next time */
    }
  };

  return (
    <aside className="install" aria-label="Как установить приложение">
      {isIOS ? (
        <>
          <b>Поставьте «Полку» на iPhone</b>
          <small>На экране появится иконка «Полка». Приложение бесплатное и работает без интернета.</small>
          <button className="primary" onClick={() => { setStarted(true); downloadIosProfile(); }}>Скачать для iPhone</button>
          {started && (
            <ol>
              <li>Если iPhone спросит, разрешить ли загрузку профиля, нажмите «Разрешить»</li>
              <li>Откройте «Настройки»: вверху появится строка «Профиль загружен», нажмите её</li>
              <li>Нажмите «Установить» и введите код-пароль телефона. Надпись «Не подписан» — это нормально</li>
              <li>Иконка «Полка» появится на экране «Домой»</li>
            </ol>
          )}
          <small>Или без профиля: в Safari нажмите «Поделиться» <ShareIcon /> → «На экран „Домой“» → «Добавить».</small>
        </>
      ) : (
        <>
          <b>Скачайте «Полку» для Android</b>
          <small>В приложении книги из Telegram открываются сразу, а книги мировой классики скачиваются одной кнопкой.</small>
          <a className="primary" href={APK_URL}>Скачать приложение</a>
        </>
      )}
      <button className="link install-close" onClick={hide}>Не показывать</button>
    </aside>
  );
}
