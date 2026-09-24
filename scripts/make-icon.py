"""Uygulama ikonunu üretir: build/icon.png (512) + build/icon.ico (16–256).

macOS Big Sur tarzı: yumuşak köşeli mavi degrade kare, sağ kenarında beyaz "panel"
(içinde renkli tab'lar ve not çizgileri) — programın kendisinin minik resmi.
Çalıştırma:  python scripts/make-icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 1024  # büyük çiz, sonra küçült (kenarlar pürüzsüz olsun)
OUT = Path(__file__).resolve().parent.parent / 'build'


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def rounded_mask(size, box, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
    return m


def make() -> Image.Image:
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # 1) Zemin: yumuşak köşeli kare, yukarıdan aşağı mavi degrade (Apple ikon ızgarası ~%10 boşluk)
    pad = int(S * 0.09)
    box = (pad, pad, S - pad, S - pad)
    radius = int((S - 2 * pad) * 0.225)
    grad = Image.new('RGBA', (S, S))
    top, bottom = (72, 166, 255, 255), (10, 92, 230, 255)
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S))

    # Hafif gölge (ikon masaüstünde "otursun")
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (box[0], box[1] + 14, box[2], box[3] + 14), radius=radius, fill=(0, 0, 0, 90)
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
    img.paste(grad, (0, 0), rounded_mask((S, S), box, radius))

    # 2) Sağ kenarda beyaz panel
    pw = int(S * 0.36)
    px1 = box[2] - int(S * 0.075)
    px0 = px1 - pw
    py0, py1 = box[1] + int(S * 0.13), box[3] - int(S * 0.13)
    panel_r = int(S * 0.05)
    pshadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(pshadow).rounded_rectangle((px0 - 6, py0 + 10, px1, py1 + 14), radius=panel_r, fill=(0, 30, 90, 110))
    img.alpha_composite(pshadow.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((px0, py0, px1, py1), radius=panel_r, fill=(255, 255, 255, 255))

    # 3) Panelin içi: üstte iki renkli tab hapı, altında not çizgileri
    ix0, ix1 = px0 + int(pw * 0.14), px1 - int(pw * 0.14)
    ty = py0 + int(S * 0.055)
    th = int(S * 0.045)
    tw = int((ix1 - ix0) * 0.44)
    d.rounded_rectangle((ix0, ty, ix0 + tw, ty + th), radius=th // 2, fill=(255, 149, 0, 255))  # turuncu
    d.rounded_rectangle((ix1 - tw, ty, ix1, ty + th), radius=th // 2, fill=(52, 199, 89, 255))  # yeşil

    line_h = int(S * 0.028)
    y = ty + th + int(S * 0.07)
    for frac in (1.0, 0.8, 1.0, 0.6):
        d.rounded_rectangle((ix0, y, ix0 + int((ix1 - ix0) * frac), y + line_h), radius=line_h // 2, fill=(198, 206, 222, 255))
        y += int(S * 0.075)

    # 4) Solda, panele doğru bakan küçük bir ok ucu (kenardan kayma hareketi)
    cx, cy = box[0] + int(S * 0.2), S // 2
    a = int(S * 0.07)
    d.line([(cx + a // 2, cy - a), (cx - a // 2, cy), (cx + a // 2, cy + a)], fill=(255, 255, 255, 235), width=int(S * 0.035), joint='curve')
    r = int(S * 0.0175)
    for (x, yy) in [(cx + a // 2, cy - a), (cx - a // 2, cy), (cx + a // 2, cy + a)]:
        d.ellipse((x - r, yy - r, x + r, yy + r), fill=(255, 255, 255, 235))
    return img


def make_appx_assets(big: Image.Image) -> None:
    """Microsoft Store (MSIX) paketinin istediği ikon boyutları → build/appx/."""
    out = OUT / 'appx'
    out.mkdir(exist_ok=True)

    def square(px):
        return big.resize((px, px), Image.LANCZOS)

    def on_canvas(w, h, px):  # geniş kutucuk: ikon şeffaf zeminde ortada
        c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        c.alpha_composite(square(px), ((w - px) // 2, (h - px) // 2))
        return c

    files = {
        'StoreLogo.png': square(50),
        'StoreLogo.scale-200.png': square(100),
        'Square44x44Logo.png': square(44),
        'Square44x44Logo.scale-200.png': square(88),
        'Square150x150Logo.png': square(150),
        'Square150x150Logo.scale-200.png': square(300),
        'SmallTile.png': square(71),
        'SmallTile.scale-200.png': square(142),
        'LargeTile.png': square(310),
        'LargeTile.scale-200.png': square(620),
        'Wide310x150Logo.png': on_canvas(310, 150, 120),
        'Wide310x150Logo.scale-200.png': on_canvas(620, 300, 240),
    }
    # Görev çubuğu / Başlat menüsü için tam boy ikonlar (plakasız, keskin)
    for t in (16, 24, 32, 48, 256):
        files[f'Square44x44Logo.targetsize-{t}.png'] = square(t)
        files[f'Square44x44Logo.targetsize-{t}_altform-unplated.png'] = square(t)
    for name, im in files.items():
        im.save(out / name)
    print(f'build/appx/ hazır ({len(files)} dosya)')


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    big = make()
    big.resize((512, 512), Image.LANCZOS).save(OUT / 'icon.png')
    big.resize((256, 256), Image.LANCZOS).save(
        OUT / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print('build/icon.png ve build/icon.ico hazır')
    make_appx_assets(big)
