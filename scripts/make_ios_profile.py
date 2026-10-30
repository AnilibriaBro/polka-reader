"""Файл для iPhone: public/Polka-iPhone.mobileconfig (так же, как у «Олимпиад»).

Это профиль с одной «веб-иконкой» (Web Clip): после установки на экране iPhone появляется иконка
«Полка», которая открывает веб-версию на весь экран, как обычное приложение. Ничего, кроме иконки,
профиль не настраивает. Удалить: Настройки → Основные → VPN и управление устройством → Полка.
The iPhone profile with a single Web Clip: puts a "Polka" icon on the Home Screen that opens the
web version full screen. It changes nothing else on the phone.

Usage: python scripts/make_ios_profile.py   (после make_icons.py)
"""
import plistlib
from pathlib import Path

project = Path(__file__).resolve().parent.parent
icon = (project / "public" / "icons" / "icon-512.png").read_bytes()
# Адрес веб-версии на GitHub Pages (репозиторий AnilibriaBro/polka-reader)
SITE = "https://anilibriabro.github.io/polka-reader/"

# Постоянные идентификаторы: новая версия профиля заменит старую / Fixed ids so a new profile replaces the old one
clip = {
    "PayloadType": "com.apple.webClip.managed",
    "PayloadVersion": 1,
    "PayloadIdentifier": "io.github.anilibriabro.polka.webclip",
    "PayloadUUID": "8C2D4E6F-1A3B-4C5D-9E7F-0A1B2C3D4E01",
    "PayloadDisplayName": "Иконка «Полка»",
    "Label": "Полка",
    "URL": SITE,
    "Icon": icon,
    "FullScreen": True,
    "IsRemovable": True,
    "Precomposed": True,
}
profile = {
    "PayloadType": "Configuration",
    "PayloadVersion": 1,
    "PayloadIdentifier": "io.github.anilibriabro.polka",
    "PayloadUUID": "8C2D4E6F-1A3B-4C5D-9E7F-0A1B2C3D4E00",
    "PayloadDisplayName": "Полка",
    "PayloadDescription": "Добавляет на экран «Домой» иконку бесплатной читалки «Полка»: книги TXT и FB2 "
                          "без интернета, рекламы и регистрации. Других настроек телефона профиль не меняет.",
    "PayloadOrganization": "Полка",
    "PayloadRemovalDisallowed": False,
    "PayloadContent": [clip],
}
out = project / "public" / "Polka-iPhone.mobileconfig"
out.write_bytes(plistlib.dumps(profile, fmt=plistlib.FMT_XML))
print(out, out.stat().st_size, "bytes")
