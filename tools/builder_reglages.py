"""Réglages du site dans Builder.io (modèle site-settings) : met à jour un ou plusieurs champs texte.

    python tools/builder_reglages.py heroSubtitle "Nouveau texte"              # essai à blanc
    python tools/builder_reglages.py heroSubtitle "Nouveau texte" --appliquer  # écrit dans Builder

Le fichier de secours src/content-seed/site-settings.json est mis à jour en même temps, pour que le site
garde le même texte si Builder ne répond pas. La clé privée (secrets/builder.env) n'est jamais affichée.
Les contenus Builder sont lus au build : construire puis publier le site ensuite.
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import builder_texte as bt  # noqa: E402  (clés, lecture et écriture Builder)

SEED = bt.ROOT / "src" / "content-seed" / "site-settings.json"


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--appliquer"]
    appliquer = "--appliquer" in sys.argv
    if len(args) != 2:
        print(__doc__)
        return 1
    champ, valeur = args
    publique, privee = bt.cles()
    entrees = bt.lire_builder("site-settings", publique)
    if not entrees:
        print("Aucune entrée site-settings dans Builder : seul le fichier de secours serait modifié.")
    for e in entrees:
        actuel = (e.get("data") or {}).get(champ)
        print(f"Builder site-settings {e['id']} · {champ}")
        print(f"  actuel  : {actuel}")
        print(f"  nouveau : {valeur}")
        if appliquer and actuel != valeur:
            # Données complètes renvoyées (comme builder_texte.py) : aucun autre réglage n'est perdu.
            data = {**(e.get("data") or {}), champ: valeur}
            statut = bt.ecrire_builder("PATCH", f"{bt.ECRIRE}/site-settings/{e['id']}", {"data": data}, privee)
            print(f"  écrit (HTTP {statut})")
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    if seed.get(champ) != valeur:
        seed[champ] = valeur
        if appliquer:
            SEED.write_bytes((json.dumps(seed, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
            print("Fichier de secours mis à jour.")
    if not appliquer:
        print("Essai à blanc : rien n'a été écrit (ajouter --appliquer).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
