"""Corrections de texte dans les contenus Builder.io (FAQ, articles…), sur le modèle des fichiers de secours.

    python tools/builder_texte.py              # montre ce qui changerait, n'écrit rien
    python tools/builder_texte.py --appliquer  # écrit dans Builder (clé privée de secrets/builder.env)

Règles appliquées (relecture du 2026-10-23) : plus de « HT » à côté des prix, puisque la TVA n'est pas
applicable (« 29 € par mois, sans TVA ») ; mise en service décrite d'une seule façon. La clé privée n'est
jamais affichée. Après --appliquer : construire et publier le site (les contenus Builder sont lus au build).
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
NB = " "
MODELES = ["faq", "article", "secteur", "site-settings"]


def cles():
    env = dict(l.split("=", 1) for l in (ROOT / "secrets" / "builder.env").read_text(encoding="utf-8").splitlines() if "=" in l)
    publique = env.get("BUILDER_PUBLIC_KEY", "").strip() or re.search(r"[0-9a-f]{32}", (ROOT / "src/lib/builder.ts").read_text(encoding="utf-8")).group(0)
    return publique, env.get("BUILDER_PRIVATE_KEY", "").strip()


def corriger(texte: str, premier_prix: bool) -> str:
    t = re.sub(r"Oui, des frais de mise en service de 49\s€ HT, facturés une seule fois au démarrage\. Ils sont offerts si vous choisissez le paiement annuel\.",
               f"Oui, 49{NB}€, facturés une seule fois au démarrage. Ils sont offerts en paiement annuel et, pendant l’offre de lancement annoncée en haut des pages, aussi en paiement mensuel.", texte)
    t = re.sub(r"le montant facturé correspond au prix HT de votre formule\.", "le montant facturé est exactement le prix affiché de votre formule.", t)
    t = re.sub(r"le prix HT affiché est le prix que vous payez\.", "le prix affiché, sans TVA, est le prix que vous payez.", t)
    t = re.sub(r"prix HT par mois, TVA non applicable\.", "prix par mois sans TVA (TVA non applicable : le prix affiché est le prix payé).", t)
    if premier_prix:
        t = re.sub(r"(\d+(?:,\d+)?)(\s)€ HT par mois", r"\1\2€ par mois (sans TVA)", t, count=1)
    t = re.sub(r"(\d+(?:,\d+)?)(\s)€ HT\b", r"\1\2€", t)
    t = re.sub(r"\bprix HT\b", "prix sans TVA", t)
    return t


def parcourir(valeur, premier_prix):
    """Applique corriger() à toutes les chaînes d'une valeur JSON ; renvoie (nouvelle valeur, modifié ?)."""
    if isinstance(valeur, str):
        n = corriger(valeur, premier_prix)
        return n, n != valeur
    if isinstance(valeur, list):
        res, mod = [], False
        for v in valeur:
            n, m = parcourir(v, premier_prix)
            res.append(n)
            mod |= m
        return res, mod
    if isinstance(valeur, dict):
        res, mod = {}, False
        for k, v in valeur.items():
            n, m = parcourir(v, premier_prix)
            res[k] = n
            mod |= m
        return res, mod
    return valeur, False


def main():
    appliquer = "--appliquer" in sys.argv
    publique, privee = cles()
    total = 0
    for modele in MODELES:
        url = f"https://cdn.builder.io/api/v3/content/{modele}?apiKey={publique}&limit=100&cachebust=true&includeUnpublished=false"
        with urllib.request.urlopen(url, timeout=30) as r:
            entrees = json.load(r).get("results", [])
        for e in entrees:
            data = e.get("data") or {}
            nouvelle, modifie = parcourir(data, premier_prix=(modele == "article"))
            if not modifie:
                continue
            total += 1
            avant = json.dumps(data, ensure_ascii=False)
            apres = json.dumps(nouvelle, ensure_ascii=False)
            n_ht = len(re.findall(r"\bHT\b", avant)) - len(re.findall(r"\bHT\b", apres))
            print(f"{modele} · {e.get('name') or e.get('id')} : {n_ht} « HT » retiré(s)")
            for m in re.finditer(r"\bHT\b", avant):
                print("   avant :", avant[max(0, m.start() - 60):m.end() + 20].replace("\\n", " "))
            if appliquer:
                corps = json.dumps({"data": nouvelle}).encode("utf-8")
                req = urllib.request.Request(f"https://builder.io/api/v1/write/{modele}/{e['id']}", data=corps, method="PATCH",
                                             headers={"Authorization": f"Bearer {privee}", "Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    print("   écrit dans Builder :", r.status)
    print(f"{total} entrée(s) {'corrigée(s)' if appliquer else 'à corriger (lancer avec --appliquer)'}")


if __name__ == "__main__":
    main()
