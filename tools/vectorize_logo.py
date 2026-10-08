"""Vectorise le logo officiel LOYNA (symbole doré + mot LOYNA) en SVG compacts."""
import numpy as np, potrace
from PIL import Image, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(r"C:\Users\vaiko\Downloads\logo loyna.png")
img = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
bg = np.array([254, 253, 252.0])
dist = np.linalg.norm(img - bg, axis=2)
sat = img.max(axis=2) - img.min(axis=2)
lum = img.mean(axis=2)

def bbox(mask, pad=6):
    ys, xs = np.where(mask)
    return max(ys.min()-pad, 0), ys.max()+pad, max(xs.min()-pad, 0), xs.max()+pad

def trace(mask, scale=2):
    im = Image.fromarray((mask * 255).astype(np.uint8)).resize((mask.shape[1]*scale, mask.shape[0]*scale), Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(1.6 * scale))
    bm = potrace.Bitmap(np.asarray(im) <= 127)
    plist = bm.trace(turdsize=40, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.1, opticurve=True, opttolerance=0.8)
    f = lambda p: f"{round(p.x/scale)} {round(p.y/scale)}"
    d = []
    for curve in plist:
        d.append("M" + f(curve.start_point))
        for seg in curve.segments:
            if seg.is_corner:
                d.append("L" + f(seg.c) + "L" + f(seg.end_point))
            else:
                d.append("C" + f(seg.c1) + " " + f(seg.c2) + " " + f(seg.end_point))
        d.append("Z")
    return "".join(d)

h = img.shape[0]
# symbole doré (moitié haute, pixels saturés)
gold = (dist > 40) & (sat > 30); gold[int(h*0.56):] = False
y0, y1, x0, x1 = bbox(gold)
mark_d = trace(gold[y0:y1, x0:x1].astype(float))
mw, mh = x1-x0, y1-y0
# mot LOYNA (pixels sombres sous le symbole, au-dessus de la signature)
dark = (lum < 110); dark[:int(h*0.55)] = False; dark[int(h*0.70):] = False
wy0, wy1, wx0, wx1 = bbox(dark)
word_d = trace(dark[wy0:wy1, wx0:wx1].astype(float))
ww, wh = wx1-wx0, wy1-wy0

grad = ('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#D9B27A"/><stop offset="1" stop-color="#B07D45"/></linearGradient></defs>')
(ROOT/"src/assets/logo-mark.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {mw} {mh}">{grad}<path fill="url(#g)" d="{mark_d}"/></svg>', encoding="utf-8")
(ROOT/"src/assets/logo-word.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ww} {wh}"><path fill="currentColor" d="{word_d}"/></svg>', encoding="utf-8")
print("symbole", mw, "x", mh, len(mark_d), "car. | mot", ww, "x", wh, len(word_d), "car.")
