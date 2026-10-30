"""Рисую иконку «Полки»: зелёный тканевый переплёт, золотая рамка тиснением, красная ленточка-закладка.

Кладу PNG для веб-версии (public/icons) и, если есть папка android, — иконки Android-приложения.
Drawing the "Polka" icon: green cloth binding, gold stamped frame, red ribbon bookmark.
Usage: python scripts/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

project = Path(__file__).resolve().parent.parent
CLOTH = (31, 68, 54)
FOIL = (220, 192, 122)
RED = (158, 43, 37)


def draw(size, safe=1.0, round_corners=False):
    # Рисую в 4 раза крупнее и уменьшаю — так края гладкие / Draw 4x larger and downscale for smooth edges
    big = size * 4
    img = Image.new("RGBA", (big, big), CLOTH + (255,))
    d = ImageDraw.Draw(img)
    # Плетение ткани: тонкие линии / Cloth weave: fine lines
    for i in range(0, big, 12):
        d.line([(i, 0), (i, big)], fill=(0, 0, 0, 14), width=2)
        d.line([(0, i), (big, i)], fill=(255, 255, 255, 8), width=2)
    # Мягкий свет сверху справа / Soft light from top right
    light = Image.new("L", (big, big), 0)
    ImageDraw.Draw(light).ellipse([big * 0.25, -big * 0.5, big * 1.4, big * 0.6], fill=60)
    light = light.filter(ImageFilter.GaussianBlur(big / 6))
    img.paste((255, 255, 255, 255), mask=light.point(lambda v: v // 3))

    c = big / 2
    k = big * safe / 2  # половина рабочей области / half of the working area

    # Двойная рамка тиснением / Double stamped frame
    def rect(m, w):
        d.rectangle([c - k + m, c - k + m, c + k - m, c + k - m], outline=FOIL, width=round(w))
    rect(k * 0.22, k * 0.04)
    rect(k * 0.31, k * 0.02)
    # Раскрытая книга золотом: две залитые страницы с изгибом и щелью-корешком
    # Open book in gold: two filled curved pages with a spine gap
    w, h = k * 0.46, k * 0.36
    top, gap = c - h / 2, k * 0.035
    for side in (-1, 1):
        pts = []
        steps = 24
        for i in range(steps + 1):  # верхний край страницы — дуга / top edge is an arc
            t = i / steps
            x = c + side * (gap + t * (w - gap))
            pts.append((x, top + k * 0.07 * (1 - (2 * t - 1) ** 2) - k * 0.05 * (1 - t)))
        for i in range(steps, -1, -1):  # нижний край / bottom edge
            t = i / steps
            x = c + side * (gap + t * (w - gap))
            pts.append((x, top + h + k * 0.07 * (1 - (2 * t - 1) ** 2) - k * 0.05 * (1 - t)))
        d.polygon(pts, fill=FOIL)
        # строки текста на странице / text lines on the page
        for j in range(4):
            y = top + h * (0.30 + j * 0.17)
            x1, x2 = c + side * (gap + w * 0.18), c + side * (w * 0.84)
            d.line([(x1, y + k * 0.03), (x2, y + k * 0.03)], fill=CLOTH, width=round(k * 0.022))
    # Ленточка свисает сверху / Ribbon hanging from the top
    rx, rw = c + k * 0.52, k * 0.16
    rb = c - k * 0.22
    d.polygon([(rx, 0), (rx + rw, 0), (rx + rw, rb), (rx + rw / 2, rb - rw * 0.55), (rx, rb)], fill=RED)

    if round_corners:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


out = project / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    draw(size, safe=0.84).convert("RGB").save(out / name, optimize=True)
draw(32, safe=1.25, round_corners=True).save(out / "favicon-32.png", optimize=True)

# Android: обычная, круглая и «адаптивная» иконка / Android: legacy, round and adaptive icons
res = project / "android" / "app" / "src" / "main" / "res"
if res.exists():
    for folder, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        dst = res / f"mipmap-{folder}"
        draw(px, safe=0.9, round_corners=True).save(dst / "ic_launcher.png")
        r = draw(px, safe=0.8)
        m = Image.new("L", r.size, 0)
        ImageDraw.Draw(m).ellipse([0, 0, px - 1, px - 1], fill=255)
        r.putalpha(m)
        r.save(dst / "ic_launcher_round.png")
        # передний слой адаптивной иконки: 108 dp, рисунок в центральных 66 dp
        # adaptive foreground: 108 dp, artwork inside the central 66 dp
        fg = round(px * 108 / 48)
        draw(fg, safe=0.62).save(dst / "ic_launcher_foreground.png")
    (res / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F4436</color>\n</resources>\n',
        encoding="utf-8")
    print("android icons")
print("ok")
