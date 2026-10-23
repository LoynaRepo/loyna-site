"""Serveur local des notes du panel commercial : même comportement que public/espace-commercial/notes.php
(routes, codes de réponse, conflit 409, limites, sauvegardes, compteurs d'essais de jeton faux), pour les
essais en développement : ce PC n'a pas PHP. Le serveur de développement d'Astro lui transmet les requêtes
/espace-commercial/notes.php (astro.config.mjs, vite.server.proxy).

  python tools/commercial/notes_local.py [--port 4330] [--dossier out/notes-local]

Le dossier joue le rôle de ~/panel-commercial chez OVH : « panel.py publier --local » y dépose jeton.sha256.
Bibliothèque standard uniquement. Toute différence de comportement avec notes.php est un défaut à corriger.
"""
import argparse
import hashlib
import hmac
import json
import re
import secrets
import shutil
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TAILLE_BLOC_MAX = 65536
TAILLE_REQUETE_MAX = 131072
ESSAIS_MAX = 20
FENETRE_ESSAIS = 3600
SAUVEGARDES_MAX = 50
CHEMIN = "/espace-commercial/notes.php"
RE_PROSPECT = re.compile(r"[0-9a-f]{10,64}")
RE_IV = re.compile(r"[A-Za-z0-9+/]{16}")
RE_B64 = re.compile(r"[A-Za-z0-9+/]+={0,2}")
RE_JETON = re.compile(r"[0-9a-f]{64}")
FORMAT_DATE = "%Y-%m-%dT%H:%M:%S.%fZ"
VERROU = threading.Lock()  # équivalent de flock(LOCK_EX) : un seul processus


class Reponse(Exception):
    def __init__(self, code, corps, entetes=None):
        super().__init__(code)
        self.code, self.corps, self.entetes = code, corps, entetes or {}


def lire_json(fichier: Path):
    if not fichier.is_file():
        return None
    try:
        donnees = json.loads(fichier.read_text(encoding="utf-8"))
    except ValueError:
        raise RuntimeError("fichier illisible")
    if not isinstance(donnees, dict):
        raise RuntimeError("fichier illisible")
    return donnees


def ecrire_json(fichier: Path, donnees) -> None:
    tmp = fichier.with_name(f"{fichier.name}.{secrets.token_hex(4)}.tmp")
    tmp.write_text(json.dumps(donnees, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(fichier)


def horodatage_apres(precedent: str) -> str:
    nouveau = datetime.now(timezone.utc).strftime(FORMAT_DATE)
    if precedent and nouveau <= precedent:
        try:
            p = datetime.strptime(precedent, FORMAT_DATE) + timedelta(microseconds=1)
            nouveau = p.strftime(FORMAT_DATE)
        except ValueError:
            pass
    return nouveau


class Serveur:
    def __init__(self, dossier: Path):
        self.dossier = Path(dossier)

    def chemin(self, nom):
        return self.dossier / nom

    def lire_notes(self):
        etat = lire_json(self.chemin("notes.json"))
        if etat is None:
            return {"version": 1, "blocs": {}}
        if not isinstance(etat.get("blocs"), dict):
            raise RuntimeError("notes.json illisible")
        return etat

    def empreinte_attendue(self):
        f = self.chemin("jeton.sha256")
        if not f.is_file():
            return None
        e = f.read_text(encoding="utf-8").strip().lower()
        return e if RE_JETON.fullmatch(e) else None

    def lire_essais(self):
        try:
            return lire_json(self.chemin("essais.json")) or {}
        except RuntimeError:
            return {}

    def essais_recents(self, ip):
        liste = self.lire_essais().get(ip)
        limite = time.time() - FENETRE_ESSAIS
        return sum(1 for t in liste if isinstance(t, int) and t > limite) if isinstance(liste, list) else 0

    def noter_essai(self, ip):
        with VERROU:
            limite = time.time() - FENETRE_ESSAIS
            propre = {}
            for cle, liste in self.lire_essais().items():
                if isinstance(liste, list):
                    recents = [t for t in liste if isinstance(t, int) and t > limite]
                    if recents:
                        propre[cle] = recents
            propre.setdefault(ip, []).append(int(time.time()))
            ecrire_json(self.chemin("essais.json"), propre)

    def sauvegarder(self):
        dossier = self.chemin("sauvegardes")
        dossier.mkdir(parents=True, exist_ok=True)
        t = time.time()
        nom = dossier / f"notes-{time.strftime('%Y%m%d-%H%M%S', time.gmtime(int(t)))}-{int((t - int(t)) * 1_000_000):06d}.json"
        shutil.copyfile(self.chemin("notes.json"), nom)
        liste = sorted(dossier.glob("notes-*.json"), key=lambda f: f.name)
        for ancienne in liste[: max(0, len(liste) - SAUVEGARDES_MAX)]:
            ancienne.unlink()

    def traiter(self, methode, entetes, corps_brut, ip_client):
        """Renvoie (code, corps, entêtes) exactement comme notes.php."""
        try:
            if methode not in ("GET", "POST"):
                raise Reponse(405, {"erreur": "methode"}, {"Allow": "GET, POST"})
            try:
                self.dossier.mkdir(parents=True, exist_ok=True)
            except OSError:
                raise Reponse(503, {"erreur": "stockage"})
            empreinte = self.empreinte_attendue()
            if empreinte is None:
                raise Reponse(503, {"erreur": "non_active"})
            ip = hashlib.sha256(ip_client.encode()).hexdigest()
            if self.essais_recents(ip) >= ESSAIS_MAX:
                raise Reponse(429, {"erreur": "trop_essais"}, {"Retry-After": str(FENETRE_ESSAIS)})
            jeton = (entetes.get("X-Panel-Jeton") or "").strip().lower()
            if not jeton:
                raise Reponse(401, {"erreur": "jeton_absent"})
            if not RE_JETON.fullmatch(jeton) or not hmac.compare_digest(empreinte, hashlib.sha256(bytes.fromhex(jeton)).hexdigest()):
                self.noter_essai(ip)
                raise Reponse(403, {"erreur": "jeton_refuse"})

            if methode == "GET":
                with VERROU:
                    etat = self.lire_notes()
                raise Reponse(200, {"blocs": etat["blocs"]})

            longueur = int(entetes.get("Content-Length") or 0)
            if longueur > TAILLE_REQUETE_MAX or len(corps_brut) > TAILLE_REQUETE_MAX:
                raise Reponse(413, {"erreur": "trop_grand"})
            try:
                requete = json.loads(corps_brut.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                requete = None
            if not isinstance(requete, dict):
                raise Reponse(400, {"erreur": "requete"})
            prospect, iv, donnees = requete.get("prospect"), requete.get("iv"), requete.get("donnees")
            precedent = requete.get("modifie_le_precedent")
            if not isinstance(prospect, str) or not RE_PROSPECT.fullmatch(prospect):
                raise Reponse(400, {"erreur": "prospect"})
            if not isinstance(iv, str) or not RE_IV.fullmatch(iv):
                raise Reponse(400, {"erreur": "iv"})
            if not isinstance(donnees, str):
                raise Reponse(400, {"erreur": "donnees"})
            if len(donnees) > TAILLE_BLOC_MAX:
                raise Reponse(413, {"erreur": "bloc_trop_grand"})
            if len(donnees) < 24 or len(donnees) % 4 != 0 or not RE_B64.fullmatch(donnees):
                raise Reponse(400, {"erreur": "donnees"})
            if precedent is not None and (not isinstance(precedent, str) or len(precedent) > 40):
                raise Reponse(400, {"erreur": "version"})
            precedent = precedent or ""

            with VERROU:
                etat = self.lire_notes()
                actuel = etat["blocs"].get(prospect)
                actuel = actuel if isinstance(actuel, dict) else None
                version = str(actuel.get("modifie_le", "")) if actuel else ""
                if version != precedent:
                    raise Reponse(409, {"erreur": "conflit", "actuel": actuel})
                modifie_le = horodatage_apres(version)
                etat["blocs"][prospect] = {"iv": iv, "donnees": donnees, "modifie_le": modifie_le}
                ecrire_json(self.chemin("notes.json"), {"version": 1, "blocs": etat["blocs"]})
                try:
                    self.sauvegarder()
                except OSError as e:
                    print("notes_local : sauvegarde impossible :", e, file=sys.stderr)
            raise Reponse(200, {"ok": True, "prospect": prospect, "modifie_le": modifie_le})
        except Reponse as r:
            return r.code, r.corps, r.entetes
        except Exception as e:  # même chose que le catch (Throwable) de notes.php : aucun détail renvoyé
            print("notes_local :", repr(e), file=sys.stderr)
            return 500, {"erreur": "serveur"}, {}


def creer_gestionnaire(serveur: Serveur):
    class Gestionnaire(BaseHTTPRequestHandler):
        server_version = "notes-local"
        sys_version = ""

        def _repondre(self, code, corps, entetes):
            brut = json.dumps(corps, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(code)
            for k, v in {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store, max-age=0",
                "Pragma": "no-cache",
                "X-Robots-Tag": "noindex, nofollow",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                **entetes,
            }.items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(brut)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(brut)

        def _traiter(self):
            if self.path.split("?", 1)[0] != CHEMIN:
                return self._repondre(404, {"erreur": "introuvable"}, {})
            longueur = int(self.headers.get("Content-Length") or 0)
            corps = self.rfile.read(min(longueur, TAILLE_REQUETE_MAX + 1)) if longueur > 0 else b""
            code, reponse, entetes = serveur.traiter(self.command, self.headers, corps, self.client_address[0])
            self._repondre(code, reponse, entetes)

        do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = _traiter

        def log_message(self, format, *args):  # pas de jeton ni de contenu dans la console
            sys.stderr.write(f"notes_local {self.command} {self.path.split('?', 1)[0]} {args[1] if len(args) > 1 else ''}\n")

    return Gestionnaire


def demarrer(dossier, port=4330, hote="127.0.0.1"):
    httpd = ThreadingHTTPServer((hote, port), creer_gestionnaire(Serveur(dossier)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    racine = Path(__file__).resolve().parent.parent.parent
    ap = argparse.ArgumentParser(description="Serveur local des notes du panel commercial (comme notes.php).")
    ap.add_argument("--port", type=int, default=4330)
    ap.add_argument("--dossier", type=Path, default=racine / "out" / "notes-local")
    args = ap.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), creer_gestionnaire(Serveur(args.dossier)))
    print(f"Notes locales sur http://127.0.0.1:{args.port}{CHEMIN} (stockage : {args.dossier})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
