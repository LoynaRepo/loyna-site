"""Signale les pages de loyna.fr aux moteurs compatibles IndexNow (Bing, Yandex, Seznam, Naver…).

Google n'utilise pas IndexNow : pour Google, le plan du site est lu via la Search Console.

  python tools/indexnow.py            toutes les adresses du plan du site (dist/sitemap-0.xml)
  python tools/indexnow.py /tarifs/ /blog/creer-carte-de-fidelite/    seulement ces pages
  python tools/indexnow.py --essai    affiche ce qui serait envoyé

La clé publique est le fichier public/<clé>.txt (servi à la racine du site) : ce n'est pas un secret.
"""
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOTE = "loyna.fr"
CLE_FICHIER = next((p for p in (ROOT / "public").glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}\.txt", p.name)), None)


def adresses_du_plan() -> list[str]:
    urls = []
    for f in sorted((ROOT / "dist").glob("sitemap-*.xml")):
        if f.name == "sitemap-index.xml":
            continue
        urls += re.findall(r"<loc>(https://loyna\.fr/[^<]*)</loc>", f.read_text(encoding="utf-8"))
    return urls


def main() -> int:
    if not CLE_FICHIER:
        print("Clé IndexNow introuvable (public/<32 caractères hexadécimaux>.txt).")
        return 1
    cle = CLE_FICHIER.stem
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    urls = [f"https://{HOTE}{a}" for a in args] if args else adresses_du_plan()
    if not urls:
        print("Aucune adresse : lancez d'abord « npx astro build ».")
        return 1
    corps = {"host": HOTE, "key": cle, "keyLocation": f"https://{HOTE}/{cle}.txt", "urlList": urls[:10000]}
    print(f"{len(urls)} adresse(s) à signaler.")
    if "--essai" in sys.argv:
        print("\n".join(urls))
        return 0
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("IndexNow :", r.status, "(200 ou 202 = reçu)")
    except urllib.error.HTTPError as e:
        print("IndexNow a refusé :", e.code, e.read().decode()[:200])
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
