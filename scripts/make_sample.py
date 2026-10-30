"""Делаю книгу-пример «Капитанская дочка» (Пушкин, общественное достояние) из страницы az.lib.ru.

Результат — public/sample/kapitanskaya-dochka.fb2 (её можно открыть кнопкой «Открыть пример»)
и, для проверки читалки, TXT в старой кодировке Windows-1251, как на lib.ru.
Making the sample book from the az.lib.ru page: FB2 for the app and a Windows-1251 TXT for testing.

Usage: python scripts/make_sample.py <скачанная страница .html> [папка для тестового TXT]
"""
import html
import re
import sys
import textwrap
from pathlib import Path
from xml.sax.saxutils import escape

src = Path(sys.argv[1]).read_bytes().decode("cp1251")
start = src.index("<b>КАПИТАНСКАЯ ДОЧКА</b>")
end = src.find("<!--Section Ends-->", start)
body = src[start:end if end > 0 else None]

# Достаю по порядку: заголовки (h4), эпиграфы (div align=right), абзацы (dd)
# Pulling out in order: headings (h4), epigraphs (div align=right), paragraphs (dd)
items = []
for m in re.finditer(r'<h4>(.*?)</h4>|<div align="right"\s*>(.*?)</div>|<dd>(.*?)(?=<dd>|<h4>|<div|$)', body, re.S):
    h, e, p = m.groups()
    raw = h or e or p or ""
    t = html.unescape(re.sub(r"<[^>]+>", "", raw)).replace("\xa0", " ")
    t = re.sub(r"\s+", " ", t).strip().replace(" -- ", " — ").replace("--", "—")
    if not t or t.startswith("Примечания"):
        if t.startswith("Примечания"):
            break
        continue
    items.append(("h" if h else "e" if e else "p", t))

# Главы: «ГЛАВА I» + название на следующей строке / Chapters: "ГЛАВА I" + name on the next line
chapters, cur = [], None
for kind, t in items:
    if kind == "h" and t == "КАПИТАНСКАЯ ДОЧКА":
        continue
    # Дальше «Пропущенная глава» и черновики с комментариями — в пример не беру
    # What follows are the "missing chapter" and drafts with commentary — not part of the sample
    if kind == "h" and t.startswith("ПРОПУЩЕННАЯ"):
        break
    if kind == "h" and t.startswith("ГЛАВА"):
        cur = {"title": [t], "body": []}
        chapters.append(cur)
    elif kind == "h" and cur and not cur["body"]:
        cur["title"].append(t)
    elif cur is None:
        continue  # эпиграф ко всей книге ниже / book epigraph handled below
    else:
        cur["body"].append((kind, t))

out = ['<?xml version="1.0" encoding="utf-8"?>',
       '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">',
       "<description><title-info><genre>prose_rus_classic</genre>",
       "<author><first-name>Александр</first-name><last-name>Пушкин</last-name></author>",
       "<book-title>Капитанская дочка</book-title><lang>ru</lang></title-info></description>",
       "<body><title><p>Капитанская дочка</p></title>",
       "<epigraph><p>Береги честь смолоду.</p><text-author>Пословица</text-author></epigraph>"]
for ch in chapters:
    out.append("<section><title>" + "".join(f"<p>{escape(x.capitalize() if x.isupper() and not x.startswith('ГЛАВА') else x.replace('ГЛАВА', 'Глава'))}</p>" for x in ch["title"]) + "</title>")
    # Эпиграф — строки справа до первого абзаца; строки справа внутри текста — подписи писем
    # Epigraph = right-aligned lines before the first paragraph; later ones are letter signatures
    body = ch["body"]
    n = next((i for i, (k, _) in enumerate(body) if k == "p"), len(body))
    epi = [t for _, t in body[:n]]
    if epi:
        out.append("<epigraph>" + "".join(f"<p>{escape(t)}</p>" for t in epi[:-1]) + f"<text-author>{escape(epi[-1])}</text-author></epigraph>")
    for k, t in body[n:]:
        out.append(f"<p>{escape(t)}</p>" if k == "p" else f"<cite><text-author>{escape(t)}</text-author></cite>")
    out.append("</section>")
out.append("</body></FictionBook>")

project = Path(__file__).resolve().parent.parent
fb2 = project / "public" / "sample" / "kapitanskaya-dochka.fb2"
fb2.write_text("\n".join(out), encoding="utf-8")
print(fb2, len(chapters), "глав", fb2.stat().st_size, "байт")

# Тестовый TXT: отступы в начале абзацев и переносы строк по 72 символа, кодировка Windows-1251
# Test TXT: indented paragraphs hard-wrapped at 72 chars, Windows-1251 encoding
if len(sys.argv) > 2:
    lines = ["", "         Александр Пушкин", "         КАПИТАНСКАЯ ДОЧКА", ""]
    for ch in chapters:
        lines += ["", " ".join(ch["title"]), ""]
        for k, t in ch["body"]:
            wrapped = textwrap.wrap(t, 72)
            lines += ["     " + wrapped[0]] + wrapped[1:] if k == "p" else ["                              " + t]
    txt = Path(sys.argv[2]) / "Пушкин - Капитанская дочка.txt"
    txt.write_bytes("\r\n".join(lines).encode("cp1251", "replace"))
    print(txt)
