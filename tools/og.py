"""Images de partage (Open Graph 1200x630) à la charte LOYNA.
Palette et logo du 09/11/2026 : fond #E9ECEF, texte #111316, halo #7B4DFF, accents texte #5A2FE0,
icône + mot « Loyna » (mêmes images que public/marque/, src/components/Logo.astro).
    python tools/og.py pages.json   (liste de {slug, title, subtitle, eyebrow})"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = str(ROOT / "tools" / "fonts" / "jakarta-var.ttf")
LOGO = Path(r"C:\Users\vaiko\Documents\LOYNA-Motion\hyperframes\commun\logo")
ICONE = Image.open(LOGO / "icone.png").convert("RGBA")
MOT = Image.open(LOGO / "mot-nuit.png").convert("RGBA")
FOND, TEXTE, GRIS, ACCENT, HALO = (233, 236, 239), (17, 19, 22), (91, 97, 104), (90, 47, 224), (123, 77, 255)
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
    im = Image.new("RGB", (W, H), FOND)
    d = ImageDraw.Draw(im)
    # halo violet
    halo = Image.new("L", (W, H), 0)
    hd = ImageDraw.Draw(halo)
    for r in range(380, 0, -6):
        hd.ellipse((960 - r, 315 - r, 960 + r, 315 + r), fill=int(60 * (1 - r / 380)))
    violet = Image.new("RGB", (W, H), HALO)
    im = Image.composite(violet, im, halo)
    d = ImageDraw.Draw(im)
    # capture de la carte dans un téléphone
    card = CARD.copy()
    card.thumbnail((380, 560))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width - 1, card.height - 1), 36, fill=255)
    im.paste(card, (960 - card.width // 2, 315 - card.height // 2), mask)
    # logo + textes
    ic = ICONE.resize((round(84 * ICONE.width / ICONE.height), 84), Image.LANCZOS)
    im.paste(ic, (66, 57), ic)
    mot = MOT.resize((round(47 * MOT.width / MOT.height), 47), Image.LANCZOS)  # 47 px : y complet, lettres à 40 px comme avant
    im.paste(mot, (66 + ic.width + 16, 79), mot)
    d.text((72, 176), eyebrow.upper(), font=font(22, 750), fill=ACCENT)
    ft = font(58 if len(title) < 48 else 50, 800)
    y = 214
    for line in wrap(d, title, ft, 640)[:4]:
        d.text((70, y), line, font=ft, fill=TEXTE)
        y += int(ft.size * 1.14)
    fs = font(26, 500)
    y += 14
    for line in wrap(d, subtitle, fs, 620)[:3]:
        d.text((72, y), line, font=fs, fill=GRIS)
        y += 36
    d.text((72, 560), "loyna.fr", font=font(24, 700), fill=ACCENT)
    im.save(OUT / f"{slug}.png", optimize=True)

if __name__ == "__main__":
    pages = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    for p in pages:
        og(p["slug"], p["title"], p["subtitle"], p.get("eyebrow", "Carte de fidélité digitale"))
        print("og", p["slug"])
