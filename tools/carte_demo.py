"""Met en ligne une carte Apple Wallet de démonstration (.pkpass) sur loyna.fr, pour l'ajouter depuis un QR code.

La carte est fabriquée par le dépôt LOYNA (scripts/google-poc/demo-client.ts apple). Elle est déposée par SFTP dans
www/cartes-demo/<jeton>/, hors du dépôt Git puisqu'elle contient les coordonnées d'un prospect ou d'un client.
- Le jeton est aléatoire : l'adresse ne se devine pas, et le dossier n'est pas listable (Options -Indexes).
- Le dossier est noindex et n'est pas supprimé par « deploy.py publier ».
- .htaccess sert les .pkpass en application/vnd.apple.pkpass : Safari sur iPhone propose « Ajouter ».

Commandes :
  python tools/carte_demo.py envoyer <fichier.pkpass>   met la carte en ligne et affiche son adresse
  python tools/carte_demo.py liste                      cartes de démonstration en ligne
  python tools/carte_demo.py retirer <jeton>            retire une carte (dossier www/cartes-demo/<jeton>/)
"""
import posixpath
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from deploy import CARTES_DEMO, DOSSIER_DISTANT, connexion  # noqa: E402

SITE = "https://loyna.fr"


def envoyer(fichier: str) -> int:
    source = Path(fichier)
    if source.suffix != ".pkpass" or not source.is_file():
        sys.exit(f"Fichier .pkpass introuvable : {fichier}")
    jeton = secrets.token_urlsafe(12)
    dossier = posixpath.join(DOSSIER_DISTANT, CARTES_DEMO.rstrip("/"), jeton)
    client, sftp = connexion()
    try:
        for d in (posixpath.join(DOSSIER_DISTANT, CARTES_DEMO.rstrip("/")), dossier):
            try:
                sftp.stat(d)
            except FileNotFoundError:
                sftp.mkdir(d)
        sftp.put(str(source), posixpath.join(dossier, source.name))
    finally:
        sftp.close()
        client.close()
    print(f"{SITE}/{CARTES_DEMO}{jeton}/{source.name}")
    return 0


def liste() -> int:
    client, sftp = connexion()
    try:
        racine = posixpath.join(DOSSIER_DISTANT, CARTES_DEMO.rstrip("/"))
        try:
            jetons = sftp.listdir(racine)
        except FileNotFoundError:
            jetons = []
        for j in sorted(jetons):
            for nom in sftp.listdir(posixpath.join(racine, j)):
                print(f"{j}  {SITE}/{CARTES_DEMO}{j}/{nom}")
    finally:
        sftp.close()
        client.close()
    return 0


def retirer(jeton: str) -> int:
    if not jeton or "/" in jeton or ".." in jeton:
        sys.exit("Jeton invalide.")
    client, sftp = connexion()
    try:
        dossier = posixpath.join(DOSSIER_DISTANT, CARTES_DEMO.rstrip("/"), jeton)
        for nom in sftp.listdir(dossier):
            sftp.remove(posixpath.join(dossier, nom))
        sftp.rmdir(dossier)
    finally:
        sftp.close()
        client.close()
    print(f"Carte retirée : {jeton}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) >= 3 and sys.argv[1] == "envoyer":
        sys.exit(envoyer(sys.argv[2]))
    if len(sys.argv) == 2 and sys.argv[1] == "liste":
        sys.exit(liste())
    if len(sys.argv) == 3 and sys.argv[1] == "retirer":
        sys.exit(retirer(sys.argv[2]))
    sys.exit(__doc__)
