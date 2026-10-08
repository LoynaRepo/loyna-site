"""Images de partage (Open Graph 1200x630) à la charte LOYNA."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = str(ROOT / "tools" / "fonts" / "jakarta-var.ttf")
MARK = Image.open(r"C:\Users\vaiko\Documents\LOYNA-Motion\public\logo-mark.png").convert("RGBA")
CARD = Image.open(ROOT / "src" / "assets" / "shots" / "wallet-card.png").convert("RGB")
OUT = ROOT / "public" / "og"

def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f

def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur); cur = w
    lines.append(cur)
    return lines

def og(slug, title, subtitle, eyebrow="Carte de fidélité digitale"):
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), (251, 250, 248))
    d = ImageDraw.Draw(im)
    # halo doré
    halo = Image.new("L", (W, H), 0)
    hd = ImageDraw.Draw(halo)
    for r in range(380, 0, -6):
        hd.ellipse((960 - r, 315 - r, 960 + r, 315 + r), fill=int(70 * (1 - r / 380)))
    gold = Image.new("RGB", (W, H), (232, 196, 128))
    im = Image.composite(gold, im, halo)
    d = ImageDraw.Draw(im)
    # capture de la carte dans un téléphone
    card = CARD.copy()
    card.thumbnail((380, 560))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width - 1, card.height - 1), 36, fill=255)
    im.paste(card, (960 - card.width // 2, 315 - card.height // 2), mask)
    # logo + textes
    m = MARK.resize((70, 70), Image.LANCZOS)
    im.paste(m, (70, 64), m)
    d.text((152, 80), "LOYNA", font=font(34, 600), fill=(20, 20, 20), spacing=8)
    d.text((72, 176), eyebrow.upper(), font=font(22, 750), fill=(138, 97, 32))
    ft = font(58 if len(title) < 48 else 50, 800)
    y = 214
    for line in wrap(d, title, ft, 640)[:4]:
        d.text((70, y), line, font=ft, fill=(18, 18, 22))
        y += int(ft.size * 1.14)
    fs = font(26, 500)
    y += 14
    for line in wrap(d, subtitle, fs, 620)[:3]:
        d.text((72, y), line, font=fs, fill=(93, 88, 80))
        y += 36
    d.text((72, 560), "loyna.fr", font=font(24, 700), fill=(138, 97, 32))
    im.save(OUT / f"{slug}.png", optimize=True)

if __name__ == "__main__":
    pages = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    for p in pages:
        og(p["slug"], p["title"], p["subtitle"], p.get("eyebrow", "Carte de fidélité digitale"))
        print("og", p["slug"])
