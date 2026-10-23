"""Mise en ligne de loyna.fr sur l'hébergement OVH (SFTP chiffré, dossier www).

L'hébergement gratuit OVH n'accepte pas le FTP chiffré (AUTH TLS refusé) : on passe par SFTP (port 22),
qui chiffre le mot de passe et les fichiers. Mêmes identifiants que le FTP.

Commandes (Python 3.13 de la machine, module paramiko) :
  python tools/deploy.py configurer   enregistre le mot de passe FTP dans le Gestionnaire d'identifiants Windows
  python tools/deploy.py test         connexion + contenu actuel du dossier www (ne modifie rien)
  python tools/deploy.py publier      envoie dist/ vers www/ (fichiers nouveaux ou modifiés), puis
                                      supprime de www/ les fichiers qui n'existent plus dans dist/
  python tools/deploy.py publier --essai   affiche ce qui serait fait, sans rien envoyer

Le mot de passe n'est jamais écrit dans un fichier ni affiché.
"""
import getpass
import hashlib
import json
import posixpath
import stat
import sys
from pathlib import Path

import paramiko

HOTE = "ftp.cluster129.hosting.ovh.net"
PORT = 22
UTILISATEUR = "loynafb"
SERVICE_KEYRING = "loyna-site-ftp"
DOSSIER_DISTANT = "www"  # relatif au dossier personnel de l'hébergement
QUOTA_OCTETS = 100 * 1024 * 1024  # hébergement gratuit OVH : 100 Mo
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
MANIFESTE = ROOT / "out" / "deploy-manifest.json"  # empreintes des fichiers déjà envoyés
CLES_SERVEUR = ROOT / "tools" / "ovh_known_hosts"  # clé publique du serveur, vérifiée à chaque connexion
# Fichiers propres à OVH à ne jamais supprimer dans www/
GARDER = {".ovhconfig"}
# Données chiffrées de l'espace commercial : déposées par _systeme/panel.py du coffre de prospection, jamais
# envoyées depuis dist/ (la copie locale de développement) ni supprimées par la mise en ligne du site.
DONNEES_COMMERCIALES = "espace-commercial/donnees.enc"


def mot_de_passe() -> str:
    import keyring

    mdp = keyring.get_password(SERVICE_KEYRING, UTILISATEUR)
    if not mdp:
        sys.exit("Mot de passe FTP absent : lancer « Enregistrer le mot de passe FTP du site.cmd ».")
    return mdp


class _PremiereConnexion(paramiko.MissingHostKeyPolicy):
    """Première connexion : la clé du serveur est enregistrée, puis exigée à l'identique les fois suivantes."""

    def missing_host_key(self, client, hostname, key):
        client.get_host_keys().add(hostname, key.get_name(), key)
        CLES_SERVEUR.write_text(f"{hostname} {key.get_name()} {key.get_base64()}\n", encoding="utf-8")
        print(f"Clé du serveur enregistrée ({key.get_name()} {key.get_fingerprint().hex(':')}).")


def connexion() -> tuple[paramiko.SSHClient, paramiko.SFTPClient]:
    client = paramiko.SSHClient()
    if CLES_SERVEUR.is_file():
        client.load_host_keys(str(CLES_SERVEUR))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    else:
        client.set_missing_host_key_policy(_PremiereConnexion())
    client.connect(HOTE, port=PORT, username=UTILISATEUR, password=mot_de_passe(),
                   look_for_keys=False, allow_agent=False, timeout=30)
    return client, client.open_sftp()


def lister(sftp: paramiko.SFTPClient, dossier: str) -> dict[str, int]:
    """Tous les fichiers sous `dossier` : chemin relatif -> taille (-1 pour un lien symbolique,
    comme le www/index.html qu'OVH fait pointer vers sa page « Site en construction »)."""
    out: dict[str, int] = {}
    for a in sftp.listdir_attr(dossier):
        chemin = posixpath.join(dossier, a.filename)
        if stat.S_ISDIR(a.st_mode or 0):
            for k, v in lister(sftp, chemin).items():
                out[posixpath.join(a.filename, k)] = v
        elif stat.S_ISREG(a.st_mode or 0):
            out[a.filename] = int(a.st_size or 0)
        elif stat.S_ISLNK(a.st_mode or 0):
            out[a.filename] = -1
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
    client, sftp = connexion()
    print("Connexion SFTP chiffrée : OK")
    fichiers = lister(sftp, DOSSIER_DISTANT)
    total = sum(fichiers.values())
    print(f"{DOSSIER_DISTANT}/ : {len(fichiers)} fichiers, {total / 1024 / 1024:.1f} Mo")
    for k in sorted(fichiers)[:25]:
        print("  ", k, fichiers[k])
    if len(fichiers) > 25:
        print("   …")
    client.close()
    return 0


def creer_dossiers(sftp: paramiko.SFTPClient, chemin: str, existants: set[str]) -> None:
    parties = chemin.strip("/").split("/")
    for i in range(1, len(parties) + 1):
        d = "/".join(parties[:i])
        if d in existants:
            continue
        try:
            sftp.stat(d)
        except FileNotFoundError:
            sftp.mkdir(d)
        existants.add(d)


def cmd_publier(essai: bool) -> int:
    if not (DIST / "index.html").is_file():
        sys.exit("dist/ est vide : lancer d'abord « npx astro build ».")
    locaux = {p.relative_to(DIST).as_posix(): p for p in DIST.rglob("*") if p.is_file()}
    locaux.pop(DONNEES_COMMERCIALES, None)
    poids = sum(p.stat().st_size for p in locaux.values())
    print(f"dist/ : {len(locaux)} fichiers, {poids / 1024 / 1024:.1f} Mo (quota {QUOTA_OCTETS // 1024 // 1024} Mo)")
    if poids > QUOTA_OCTETS * 0.9:
        sys.exit("Le site dépasse 90 % du quota de l'hébergement : rien n'est envoyé.")

    manifeste = json.loads(MANIFESTE.read_text(encoding="utf-8")) if MANIFESTE.is_file() else {}
    client, sftp = connexion()
    distants = lister(sftp, DOSSIER_DISTANT)

    a_envoyer = []
    for rel, p in sorted(locaux.items()):
        h = empreinte(p)
        if rel not in distants or distants[rel] != p.stat().st_size or manifeste.get(rel) != h:
            a_envoyer.append((rel, p, h))
    a_supprimer = sorted(k for k in distants if k not in locaux and posixpath.basename(k) not in GARDER
                         and k != DONNEES_COMMERCIALES and not posixpath.basename(k).startswith(".donnees.enc."))

    print(f"À envoyer : {len(a_envoyer)} · à supprimer : {len(a_supprimer)} · inchangés : {len(locaux) - len(a_envoyer)}")
    for rel, _, _ in a_envoyer[:40]:
        print("  +", rel)
    for rel in a_supprimer[:40]:
        print("  -", rel)
    if essai:
        print("Mode essai : rien n'a été modifié.")
        client.close()
        return 0

    # Les pages HTML en dernier : les fichiers qu'elles appellent sont déjà en ligne.
    a_envoyer.sort(key=lambda x: (x[0].endswith(".html"), x[0]))
    dossiers: set[str] = set()
    for i, (rel, p, h) in enumerate(a_envoyer, 1):
        distant = posixpath.join(DOSSIER_DISTANT, rel)
        creer_dossiers(sftp, posixpath.dirname(distant), dossiers)
        if distants.get(rel) == -1:
            sftp.remove(distant)  # lien symbolique OVH : remplacé par le vrai fichier
        sftp.put(str(p), distant)
        manifeste[rel] = h
        if i % 20 == 0:
            print(f"  {i}/{len(a_envoyer)} envoyés")
    for rel in a_supprimer:
        try:
            sftp.remove(posixpath.join(DOSSIER_DISTANT, rel))
        except OSError as e:
            print("  suppression impossible :", rel, e)
        manifeste.pop(rel, None)
    # dossiers devenus vides
    for d in sorted({posixpath.dirname(r) for r in a_supprimer if "/" in r}, key=len, reverse=True):
        try:
            sftp.rmdir(posixpath.join(DOSSIER_DISTANT, d))
        except OSError:
            pass
    client.close()
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
