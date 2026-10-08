"""Mise en ligne de loyna.fr sur l'hébergement OVH (FTP chiffré, dossier www).

Commandes (Python 3.13 de la machine) :
  python tools/deploy.py configurer   enregistre le mot de passe FTP dans le Gestionnaire d'identifiants Windows
  python tools/deploy.py test         connexion + contenu actuel du dossier www (ne modifie rien)
  python tools/deploy.py publier      envoie dist/ vers www/ (fichiers nouveaux ou modifiés), puis
                                      supprime de www/ les fichiers qui n'existent plus dans dist/
  python tools/deploy.py publier --essai   affiche ce qui serait fait, sans rien envoyer

Le mot de passe n'est jamais écrit dans un fichier ni affiché.
"""
import ftplib
import getpass
import hashlib
import json
import posixpath
import ssl
import sys
from pathlib import Path

HOTE = "ftp.cluster129.hosting.ovh.net"
UTILISATEUR = "loynafb"
SERVICE_KEYRING = "loyna-site-ftp"
DOSSIER_DISTANT = "/www"
QUOTA_OCTETS = 100 * 1024 * 1024  # hébergement gratuit OVH : 100 Mo
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
MANIFESTE = ROOT / "out" / "deploy-manifest.json"  # empreintes des fichiers déjà envoyés
# Fichiers propres à OVH à ne jamais supprimer dans www/
GARDER = {".ovhconfig"}


def mot_de_passe() -> str:
    import keyring

    mdp = keyring.get_password(SERVICE_KEYRING, UTILISATEUR)
    if not mdp:
        sys.exit("Mot de passe FTP absent : lancer « Enregistrer le mot de passe FTP du site.cmd ».")
    return mdp


def connexion() -> ftplib.FTP_TLS:
    ftp = ftplib.FTP_TLS(HOTE, timeout=60, context=ssl.create_default_context())
    ftp.login(UTILISATEUR, mot_de_passe())
    ftp.prot_p()
    ftp.encoding = "utf-8"
    return ftp


def lister(ftp: ftplib.FTP_TLS, dossier: str) -> dict[str, int]:
    """Tous les fichiers sous `dossier` : chemin relatif -> taille."""
    out: dict[str, int] = {}
    for nom, faits in ftp.mlsd(dossier, facts=["type", "size"]):
        if nom in (".", ".."):
            continue
        chemin = posixpath.join(dossier, nom)
        if faits.get("type") == "dir":
            for k, v in lister(ftp, chemin).items():
                out[posixpath.join(nom, k)] = v
        elif faits.get("type") == "file":
            out[nom] = int(faits.get("size", 0))
    return out


def empreinte(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def cmd_configurer() -> int:
    import keyring

    print(f"Mot de passe FTP du compte {UTILISATEUR} (OVH > Hébergements > FTP-SSH). La saisie reste invisible :")
    mdp = getpass.getpass("> ")
    if not mdp:
        print("Aucun mot de passe saisi, rien n'a été enregistré.")
        return 1
    keyring.set_password(SERVICE_KEYRING, UTILISATEUR, mdp)
    print("Enregistré dans le Gestionnaire d'identifiants Windows. Test de connexion…")
    return cmd_test()


def cmd_test() -> int:
    ftp = connexion()
    print("Connexion FTP chiffrée : OK")
    fichiers = lister(ftp, DOSSIER_DISTANT)
    total = sum(fichiers.values())
    print(f"{DOSSIER_DISTANT} : {len(fichiers)} fichiers, {total / 1024 / 1024:.1f} Mo")
    for k in sorted(fichiers)[:25]:
        print("  ", k, fichiers[k])
    if len(fichiers) > 25:
        print("   …")
    ftp.quit()
    return 0


def creer_dossiers(ftp: ftplib.FTP_TLS, chemin: str, existants: set[str]) -> None:
    parties = chemin.strip("/").split("/")
    for i in range(1, len(parties) + 1):
        d = "/" + "/".join(parties[:i])
        if d in existants:
            continue
        try:
            ftp.mkd(d)
        except ftplib.error_perm:
            pass  # existe déjà
        existants.add(d)


def cmd_publier(essai: bool) -> int:
    if not (DIST / "index.html").is_file():
        sys.exit("dist/ est vide : lancer d'abord « npx astro build ».")
    locaux = {p.relative_to(DIST).as_posix(): p for p in DIST.rglob("*") if p.is_file()}
    poids = sum(p.stat().st_size for p in locaux.values())
    print(f"dist/ : {len(locaux)} fichiers, {poids / 1024 / 1024:.1f} Mo (quota {QUOTA_OCTETS // 1024 // 1024} Mo)")
    if poids > QUOTA_OCTETS * 0.9:
        sys.exit("Le site dépasse 90 % du quota de l'hébergement : rien n'est envoyé.")

    manifeste = json.loads(MANIFESTE.read_text(encoding="utf-8")) if MANIFESTE.is_file() else {}
    ftp = connexion()
    distants = lister(ftp, DOSSIER_DISTANT)

    a_envoyer = []
    for rel, p in sorted(locaux.items()):
        h = empreinte(p)
        if rel not in distants or distants[rel] != p.stat().st_size or manifeste.get(rel) != h:
            a_envoyer.append((rel, p, h))
    a_supprimer = sorted(k for k in distants if k not in locaux and posixpath.basename(k) not in GARDER)

    print(f"À envoyer : {len(a_envoyer)} · à supprimer : {len(a_supprimer)} · inchangés : {len(locaux) - len(a_envoyer)}")
    for rel, _, _ in a_envoyer[:40]:
        print("  +", rel)
    for rel in a_supprimer[:40]:
        print("  -", rel)
    if essai:
        print("Mode essai : rien n'a été modifié.")
        ftp.quit()
        return 0

    # Les pages HTML en dernier : les fichiers qu'elles appellent sont déjà en ligne.
    a_envoyer.sort(key=lambda x: (x[0].endswith(".html"), x[0]))
    dossiers: set[str] = set()
    for i, (rel, p, h) in enumerate(a_envoyer, 1):
        distant = posixpath.join(DOSSIER_DISTANT, rel)
        creer_dossiers(ftp, posixpath.dirname(distant), dossiers)
        with p.open("rb") as f:
            ftp.storbinary(f"STOR {distant}", f)
        manifeste[rel] = h
        if i % 20 == 0:
            print(f"  {i}/{len(a_envoyer)} envoyés")
    for rel in a_supprimer:
        try:
            ftp.delete(posixpath.join(DOSSIER_DISTANT, rel))
        except ftplib.error_perm as e:
            print("  suppression impossible :", rel, e)
        manifeste.pop(rel, None)
    # dossiers devenus vides
    for d in sorted({posixpath.dirname(r) for r in a_supprimer if "/" in r}, key=len, reverse=True):
        try:
            ftp.rmd(posixpath.join(DOSSIER_DISTANT, d))
        except ftplib.error_perm:
            pass
    ftp.quit()
    MANIFESTE.parent.mkdir(parents=True, exist_ok=True)
    MANIFESTE.write_text(json.dumps(manifeste, indent=0, sort_keys=True), encoding="utf-8")
    print("Mise en ligne terminée : https://loyna.fr/")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] not in {"configurer", "test", "publier"}:
        print(__doc__)
        sys.exit(1)
    if args[0] == "configurer":
        sys.exit(cmd_configurer())
    if args[0] == "test":
        sys.exit(cmd_test())
    sys.exit(cmd_publier("--essai" in args))
