"""Serveur local du panel commercial : même comportement que public/espace-commercial/notes.php et cartes.php
(routes, codes de réponse, conflit 409, limites, sauvegardes, compteurs d'essais de jeton faux), pour les
essais en développement : ce PC n'a pas PHP. Le serveur de développement d'Astro lui transmet les requêtes
/espace-commercial/notes.php (astro.config.mjs, vite.server.proxy).

  python tools/commercial/notes_local.py [--port 4330] [--dossier out/notes-local]

Le dossier joue le rôle de ~/panel-commercial chez OVH : « panel.py publier --local » y dépose jeton.sha256.
Bibliothèque standard uniquement. Toute différence de comportement avec notes.php est un défaut à corriger.
"""
import argparse
import base64
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
from urllib.parse import parse_qs

TAILLE_BLOC_MAX = 65536
TAILLE_REQUETE_MAX = 131072
ESSAIS_MAX = 20
FENETRE_ESSAIS = 3600
SAUVEGARDES_MAX = 50
CHEMIN = "/espace-commercial/notes.php"
CHEMIN_CARTES = "/espace-commercial/cartes.php"
TAILLE_REQUETE_CARTES_MAX = 1600000
TAILLE_LOGO_MAX = 1400000
CARTES_MAX = 300
OFFRES = ("starter", "pro")  # à l'écriture ; les fiches déjà écrites restent servies telles quelles, comme dans cartes.php
ENGAGEMENTS = ("sans", "engage")
PREFIXE_LOGO = "data:image/png;base64,"
RE_ID_CARTE = re.compile(r"[a-z0-9]{16}")
RE_COULEUR = re.compile(r"#[0-9a-f]{6}")
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


def carte_propre(c):
    """Comme carte_propre() de cartes.php : réglages acceptés (liste fermée), None si un champ est invalide."""
    def texte(v, mini, maxi):
        return isinstance(v, str) and mini <= len(v.strip()) <= maxi

    def entier(v, mini, maxi):
        return isinstance(v, int) and not isinstance(v, bool) and mini <= v <= maxi

    qr = c.get("qr")
    if not (texte(c.get("nom"), 1, 60) and texte(c.get("activite", ""), 0, 60) and texte(c.get("recompense"), 1, 80)
            and isinstance(c.get("fond"), str) and RE_COULEUR.fullmatch(c["fond"])
            and isinstance(c.get("tampons"), str) and RE_COULEUR.fullmatch(c["tampons"])
            and entier(c.get("passages"), 1, 100)
            and (c.get("montant") is None or entier(c.get("montant"), 20, 1000))
            and c.get("offre") in OFFRES and c.get("engagement") in ENGAGEMENTS
            and isinstance(qr, dict) and entier(qr.get("unit"), 0, 20) and entier(qr.get("pack5"), 0, 4) and entier(qr.get("pack10"), 0, 4)
            and texte(c.get("prospect", ""), 0, 64)):
        return None
    return {"nom": c["nom"].strip(), "activite": c.get("activite", "").strip(), "recompense": c["recompense"].strip(),
            "fond": c["fond"], "tampons": c["tampons"], "passages": c["passages"], "montant": c.get("montant"), "offre": c["offre"], "engagement": c["engagement"],
            "qr": {"unit": qr["unit"], "pack5": qr["pack5"], "pack10": qr["pack10"]}, "prospect": c.get("prospect", "").strip()}


def logo_propre(logo):
    """Base64 d'un vrai PNG, sinon None (comme logo_propre() de cartes.php)."""
    if not isinstance(logo, str) or not logo.startswith(PREFIXE_LOGO):
        return None
    b64 = logo[len(PREFIXE_LOGO):]
    if len(b64) > TAILLE_LOGO_MAX:
        return None
    try:
        octets = base64.b64decode(b64, validate=True)
    except ValueError:
        return None
    return b64 if octets.startswith(b"\x89PNG\r\n\x1a\n") else None


def traiter_cartes(serveur: Serveur, methode, entetes, corps_brut, ip_client, requete_id):
    """Renvoie (code, corps, entêtes) exactement comme cartes.php."""
    cartes = serveur.chemin("cartes")
    maintenant = lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        if methode not in ("GET", "POST"):
            raise Reponse(405, {"erreur": "methode"}, {"Allow": "GET, POST"})
        if methode == "GET" and requete_id is not None:
            f = cartes / f"{requete_id}.json"
            if not RE_ID_CARTE.fullmatch(requete_id) or not f.is_file():
                raise Reponse(404, {"erreur": "inconnue"})
            carte = lire_json(f)
            carte.pop("prospect", None)
            logo = cartes / f"{requete_id}.logo"
            carte["logo"] = PREFIXE_LOGO + logo.read_text(encoding="ascii") if logo.is_file() else None
            raise Reponse(200, {"carte": carte})
        cartes.mkdir(parents=True, exist_ok=True)
        empreinte = serveur.empreinte_attendue()
        if empreinte is None:
            raise Reponse(503, {"erreur": "non_active"})
        ip = hashlib.sha256(ip_client.encode()).hexdigest()
        if serveur.essais_recents(ip) >= ESSAIS_MAX:
            raise Reponse(429, {"erreur": "trop_essais"}, {"Retry-After": str(FENETRE_ESSAIS)})
        jeton = (entetes.get("X-Panel-Jeton") or "").strip().lower()
        if not jeton:
            raise Reponse(401, {"erreur": "jeton_absent"})
        if not RE_JETON.fullmatch(jeton) or not hmac.compare_digest(empreinte, hashlib.sha256(bytes.fromhex(jeton)).hexdigest()):
            serveur.noter_essai(ip)
            raise Reponse(403, {"erreur": "jeton_refuse"})
        if methode == "GET":
            liste = []
            for f in cartes.glob("*.json"):
                if RE_ID_CARTE.fullmatch(f.stem):
                    carte = lire_json(f)
                    carte["id"] = f.stem
                    carte["a_logo"] = (cartes / f"{f.stem}.logo").is_file()
                    liste.append(carte)
            liste.sort(key=lambda x: str(x.get("modifie_le", "")), reverse=True)
            raise Reponse(200, {"cartes": liste})
        if int(entetes.get("Content-Length") or 0) > TAILLE_REQUETE_CARTES_MAX or len(corps_brut) > TAILLE_REQUETE_CARTES_MAX:
            raise Reponse(413, {"erreur": "trop_grand"})
        try:
            requete = json.loads(corps_brut.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            requete = None
        if not isinstance(requete, dict):
            raise Reponse(400, {"erreur": "requete"})
        if "supprimer" in requete:
            cid = requete["supprimer"]
            if not isinstance(cid, str) or not RE_ID_CARTE.fullmatch(cid):
                raise Reponse(400, {"erreur": "id"})
            (cartes / f"{cid}.json").unlink(missing_ok=True)
            (cartes / f"{cid}.logo").unlink(missing_ok=True)
            raise Reponse(200, {"ok": True})
        cid = requete.get("id")
        if cid is not None and (not isinstance(cid, str) or not RE_ID_CARTE.fullmatch(cid) or not (cartes / f"{cid}.json").is_file()):
            raise Reponse(404, {"erreur": "inconnue"})
        brute = requete.get("carte")
        carte = carte_propre(brute) if isinstance(brute, dict) else None
        if carte is None:
            raise Reponse(400, {"erreur": "carte"})
        logo, b64 = brute.get("logo"), None
        if logo is not None:
            b64 = logo_propre(logo)
            if b64 is None:
                raise Reponse(400, {"erreur": "logo"})
        cree_le = maintenant()
        if cid is None:
            if len(list(cartes.glob("*.json"))) >= CARTES_MAX:
                raise Reponse(413, {"erreur": "trop_de_cartes"})
            cid = secrets.token_hex(10)[:16].translate(str.maketrans("abcdef", "ghjkmn"))
        else:
            cree_le = str(lire_json(cartes / f"{cid}.json").get("cree_le", cree_le))
        carte["cree_le"], carte["modifie_le"] = cree_le, maintenant()
        if b64 is not None:
            (cartes / f"{cid}.logo").write_text(b64, encoding="ascii")
        else:
            (cartes / f"{cid}.logo").unlink(missing_ok=True)
        ecrire_json(cartes / f"{cid}.json", carte)
        raise Reponse(200, {"ok": True, "id": cid, "modifie_le": carte["modifie_le"]})
    except Reponse as r:
        return r.code, r.corps, r.entetes
    except Exception as e:
        print("notes_local (cartes) :", repr(e), file=sys.stderr)
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
            chemin, _, requete = self.path.partition("?")
            if chemin not in (CHEMIN, CHEMIN_CARTES):
                return self._repondre(404, {"erreur": "introuvable"}, {})
            longueur = int(self.headers.get("Content-Length") or 0)
            maxi = TAILLE_REQUETE_CARTES_MAX if chemin == CHEMIN_CARTES else TAILLE_REQUETE_MAX
            corps = self.rfile.read(min(longueur, maxi + 1)) if longueur > 0 else b""
            if chemin == CHEMIN_CARTES:
                cid = parse_qs(requete).get("id", [None])[0]
                return self._repondre(*traiter_cartes(serveur, self.command, self.headers, corps, self.client_address[0], cid))
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
