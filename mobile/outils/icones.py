"""Icône et écran de démarrage de l'application Loyna, à partir du logo officiel (coffre « Loyna Prospection »,
11 Marque et vidéos/Identité/Logo/Icône LOYNA (officielle, transparente).png).

  python outils/icones.py [chemin du logo]

Écrit :
  - resources/icon.png : 1024 x 1024, sans transparence (exigence d'Apple), fond bleu nuit de la charte (#111316) avec un
    halo violet (#7B4DFF), logo centré ;
  - resources/splash.png : 2732 x 2732, même fond, logo plus petit au centre ;
  - et, si le projet iOS existe (ios/App/App/Assets.xcassets), les recopie aux noms attendus par Xcode.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ICI = Path(__file__).resolve().parent.parent
LOGO = Path.home() / "Documents" / "Loyna Prospection" / "11 Marque et vidéos" / "Identité" / "Logo" / "Icône LOYNA (officielle, transparente).png"
FOND = (17, 19, 22)  # #111316
HALO = (123, 77, 255)  # #7B4DFF


def fond(taille: int, force: float) -> Image.Image:
    """Fond bleu nuit, halo violet doux au centre (en haut)."""
    img = Image.new("RGB", (taille, taille), FOND)
    halo = Image.new("L", (taille, taille), 0)
    d = ImageDraw.Draw(halo)
    r = int(taille * 0.42)
    cx, cy = taille // 2, int(taille * 0.44)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=int(255 * force))
    halo = halo.filter(ImageFilter.GaussianBlur(taille * 0.12))
    img.paste(Image.new("RGB", (taille, taille), HALO), (0, 0), halo)
    return img


def logo_recadre(chemin: Path) -> Image.Image:
    im = Image.open(chemin).convert("RGBA")
    boite = im.getchannel("A").point(lambda v: 255 if v > 60 else 0).getbbox()
    return im.crop(boite)


def poser(base: Image.Image, logo: Image.Image, part: float) -> Image.Image:
    """Logo centré, son plus grand côté = part x côté de l'image."""
    t = base.size[0]
    echelle = part * t / max(logo.size)
    l = logo.resize((round(logo.size[0] * echelle), round(logo.size[1] * echelle)), Image.LANCZOS)
    base = base.copy()
    base.paste(l, ((t - l.size[0]) // 2, (t - l.size[1]) // 2), l)
    return base


def main() -> None:
    chemin = Path(sys.argv[1]) if len(sys.argv) > 1 else LOGO
    logo = logo_recadre(chemin)
    res = ICI / "resources"
    res.mkdir(exist_ok=True)
    icone = poser(fond(1024, 0.55), logo, 0.80).convert("RGB")  # RGB : aucune transparence
    icone.save(res / "icon.png", optimize=True)
    ecran = poser(fond(2732, 0.35), logo, 0.26).convert("RGB")
    ecran.save(res / "splash.png", optimize=True)
    print("resources/icon.png et resources/splash.png écrits")

    xc = ICI / "ios" / "App" / "App" / "Assets.xcassets"
    if xc.is_dir():
        icones = xc / "AppIcon.appiconset"
        for f in icones.glob("*.png"):
            icone.save(f, optimize=True)  # modèle Capacitor : une seule image 1024 (AppIcon-512@2x.png)
        for f in (xc / "Splash.imageset").glob("*.png"):
            ecran.save(f, optimize=True)
        print("Assets.xcassets du projet iOS mis à jour")


if __name__ == "__main__":
    main()
