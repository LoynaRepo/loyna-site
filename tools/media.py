"""Visuels du site : captures d'écran tirées du motion design, affiche vidéo, icônes."""
import subprocess, shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FF = r"C:\Users\vaiko\Documents\LOYNA-Motion\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"
MASTER = r"C:\Users\vaiko\Documents\LOYNA-Motion\out\LOYNA-motion-design.mp4"
MAIL = r"C:\Users\vaiko\Documents\LOYNA-Motion\out\LOYNA-video-presentation-mail-720p.mp4"
SHOTS = ROOT / "src" / "assets" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
TMP = ROOT / "out" / "frames"; TMP.mkdir(parents=True, exist_ok=True)

def frame(t):
    p = TMP / f"f{t:.2f}.png"
    subprocess.run([FF, "-v", "error", "-y", "-ss", str(t), "-i", MASTER, "-frames:v", "1", str(p)], check=True)
    return Image.open(p).convert("RGB")

# (nom, instant, cadrage x0,y0,x1,y1 dans l'image 1080x1920)
CROPS = [
    ("wallet-card", 15.6, (200, 420, 880, 1520)),
    ("scan-qr", 18.4, (210, 450, 870, 1500)),
    ("inscription", 21.6, (243, 423, 836, 1510)),
    ("ajout-wallet", 24.4, (210, 450, 870, 1500)),
    ("passage-valide", 27.6, (245, 395, 834, 1525)),
    ("recompense", 31.0, (130, 380, 950, 1480)),
    ("notifications", 37.2, (235, 388, 844, 1550)),
    ("tableau-de-bord", 47.2, (60, 410, 1020, 1320)),
    ("automatisations", 41.0, (40, 600, 1040, 1300)),
]
for name, t, box in CROPS:
    frame(t).crop(box).save(SHOTS / f"{name}.png", optimize=True)
    print("capture", name)

# affiche de la vidéo (verticale) et version carrée pour le partage
frame(9.6).save(SHOTS / "poster-video.png", optimize=True)

# vidéo web (720p, déjà optimisée) dans public/
(ROOT / "public" / "video").mkdir(parents=True, exist_ok=True)
shutil.copy(MAIL, ROOT / "public" / "video" / "loyna-presentation-720p.mp4")

# icônes : symbole doré sur fond crème
mark = Image.open(r"C:\Users\vaiko\Documents\LOYNA-Motion\public\logo-mark.png").convert("RGBA")
def icon(size, pad=0.16, bg=(251, 250, 248, 255)):
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - 2 * pad))
    m = mark.resize((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - inner) // 2, (size - inner) // 2))
    return canvas
pub = ROOT / "public"
icon(180).convert("RGB").save(pub / "apple-touch-icon.png", optimize=True)
icon(192).save(pub / "icon-192.png", optimize=True)
icon(512).save(pub / "icon-512.png", optimize=True)
icon(512, pad=0.24).save(pub / "icon-maskable-512.png", optimize=True)
ico = icon(64, pad=0.04, bg=(0, 0, 0, 0))
ico.save(pub / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("icônes ok")
