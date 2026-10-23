"""Tests du serveur des notes (tools/commercial/notes_local.py, copie fidèle de public/espace-commercial/notes.php) :
codes de réponse, jeton, conflit 409, limites, sauvegardes, compteur d'essais, écritures simultanées.

  python tools/commercial/test_notes_serveur.py

Chaque scénario utilise un dossier temporaire et un port libre : rien n'est écrit dans le projet.
"""
import base64
import hashlib
import json
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notes_local  # noqa: E402

JETON = os.urandom(32).hex()
FAUX = os.urandom(32).hex()
ok = True


def verifier(cond, message):
    global ok
    print(("OK    " if cond else "ÉCHEC ") + message)
    ok &= bool(cond)


def demarrer(dossier, avec_empreinte=True):
    if avec_empreinte:
        Path(dossier).mkdir(parents=True, exist_ok=True)
        (Path(dossier) / "jeton.sha256").write_text(hashlib.sha256(bytes.fromhex(JETON)).hexdigest() + "\n", encoding="utf-8")
    httpd = notes_local.demarrer(dossier, port=0)
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}{notes_local.CHEMIN}"


def requete(url, methode="GET", jeton=None, corps=None, brut=None):
    donnees = brut if brut is not None else (json.dumps(corps).encode() if corps is not None else None)
    r = urllib.request.Request(url, data=donnees, method=methode)
    if jeton:
        r.add_header("X-Panel-Jeton", jeton)
    if donnees is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=10) as rep:
            return rep.status, json.loads(rep.read() or b"null"), dict(rep.headers)
    except urllib.error.HTTPError as e:
        texte = e.read()
        return e.code, (json.loads(texte) if texte else None), dict(e.headers)


def bloc(n=1):
    return {"iv": base64.b64encode(os.urandom(12)).decode(), "donnees": base64.b64encode(os.urandom(16 + 40 * n)).decode()}


with tempfile.TemporaryDirectory() as tmp:
    # 1. pas encore activé (aucune empreinte déposée par panel.py)
    httpd, url = demarrer(Path(tmp) / "a", avec_empreinte=False)
    code, rep, _ = requete(url, jeton=JETON)
    verifier(code == 503 and rep == {"erreur": "non_active"}, "sans empreinte du jeton : 503 non_active")
    httpd.shutdown()

    # 2. lecture et écriture
    httpd, url = demarrer(Path(tmp) / "b")
    code, rep, h = requete(url)
    verifier(code == 401 and rep["erreur"] == "jeton_absent", "GET sans jeton : 401")
    verifier(h.get("Cache-Control", "").startswith("no-store") and "noindex" in h.get("X-Robots-Tag", ""), "en-têtes : pas de cache, noindex")
    code, rep, _ = requete(url, jeton=FAUX)
    verifier(code == 403 and rep["erreur"] == "jeton_refuse", "GET avec un faux jeton : 403")
    code, rep, _ = requete(url, jeton="pas-un-jeton")
    verifier(code == 403, "jeton mal formé : 403")
    code, rep, _ = requete(url, jeton=JETON)
    verifier(code == 200 and rep == {"blocs": {}}, "GET avec le bon jeton : 200, aucun bloc")
    code, rep, _ = requete(url, "POST", FAUX, {"prospect": "a1b2c3d4e5", **bloc(), "modifie_le_precedent": None})
    verifier(code == 403, "POST avec un faux jeton : 403")
    b1 = bloc()
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "a1b2c3d4e5", **b1, "modifie_le_precedent": None})
    verifier(code == 200 and rep["ok"] and rep["modifie_le"].endswith("Z"), "POST d'un nouveau bloc : 200 et version datée")
    v1 = rep["modifie_le"]
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "a1b2c3d4e5", **bloc(), "modifie_le_precedent": ""})
    verifier(code == 409 and rep["erreur"] == "conflit" and rep["actuel"] == {**b1, "modifie_le": v1}, "version périmée : 409 avec la version actuelle")
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "a1b2c3d4e5", **bloc(), "modifie_le_precedent": v1})
    verifier(code == 200 and rep["modifie_le"] > v1, "bonne version : 200, nouvelle version postérieure")
    code, rep, _ = requete(url, jeton=JETON)
    verifier(code == 200 and list(rep["blocs"]) == ["a1b2c3d4e5"], "GET : le bloc enregistré")

    # 3. validations
    for prospect, nom in [("A1B2C3D4E5", "majuscules"), ("abc", "trop court"), ("a1b2c3d4e5\n", "retour à la ligne"), ("../../x", "chemin")]:
        code, rep, _ = requete(url, "POST", JETON, {"prospect": prospect, **bloc(), "modifie_le_precedent": None})
        verifier(code == 400 and rep["erreur"] == "prospect", f"identifiant refusé ({nom}) : 400")
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "b1b2c3d4e5", "iv": "court", "donnees": bloc()["donnees"]})
    verifier(code == 400 and rep["erreur"] == "iv", "iv invalide : 400")
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "b1b2c3d4e5", "iv": bloc()["iv"], "donnees": "pas du base64 !"})
    verifier(code == 400 and rep["erreur"] == "donnees", "données invalides : 400")
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "b1b2c3d4e5", "iv": bloc()["iv"], "donnees": "A" * 65540})
    verifier(code == 413 and rep["erreur"] == "bloc_trop_grand", "bloc de plus de 64 Ko : 413")
    code, rep, _ = requete(url, "POST", JETON, brut=b"{" + b" " * 140000 + b"}")
    verifier(code == 413 and rep["erreur"] == "trop_grand", "requête de plus de 128 Ko : 413")
    code, rep, _ = requete(url, "POST", JETON, brut=b"[1,2,3]")
    verifier(code == 400 and rep["erreur"] == "requete", "corps qui n'est pas un objet JSON : 400")
    code, rep, _ = requete(url, "POST", JETON, {"prospect": "b1b2c3d4e5", **bloc(), "modifie_le_precedent": 12})
    verifier(code == 400 and rep["erreur"] == "version", "version qui n'est pas une chaîne : 400")
    code, rep, h = requete(url, "PUT", JETON, {})
    verifier(code == 405 and h.get("Allow") == "GET, POST", "méthode PUT : 405 avec Allow")

    # 4. écritures simultanées : une seule passe, l'autre reçoit 409
    code, rep, _ = requete(url, jeton=JETON)
    version = rep["blocs"]["a1b2c3d4e5"]["modifie_le"]
    resultats = []
    fils = [threading.Thread(target=lambda: resultats.append(requete(url, "POST", JETON, {"prospect": "a1b2c3d4e5", **bloc(), "modifie_le_precedent": version})[0])) for _ in range(6)]
    [f.start() for f in fils]
    [f.join() for f in fils]
    verifier(sorted(resultats) == [200, 409, 409, 409, 409, 409], f"6 écritures simultanées sur la même version : une seule passe ({sorted(resultats)})")

    # 5. sauvegardes : une copie datée par écriture, 50 au plus
    for i in range(55):
        code, rep, _ = requete(url, jeton=JETON)
        requete(url, "POST", JETON, {"prospect": "c1b2c3d4e5", **bloc(), "modifie_le_precedent": rep["blocs"].get("c1b2c3d4e5", {}).get("modifie_le")})
    sauvegardes = list((Path(tmp) / "b" / "sauvegardes").glob("notes-*.json"))
    verifier(len(sauvegardes) == 50, f"rotation des sauvegardes : {len(sauvegardes)} copies gardées (50 attendues)")
    derniere = max(sauvegardes, key=lambda f: f.name)
    verifier(derniere.read_bytes() == (Path(tmp) / "b" / "notes.json").read_bytes(), "la dernière sauvegarde est l'état actuel")
    verifier(not (Path(tmp) / "b" / "essais.json").exists() or "jeton" not in (Path(tmp) / "b" / "essais.json").read_text(), "compteurs : adresses en empreinte, aucun jeton")

    # 6. fichier abîmé : erreur 500 sans détail, jamais réécrit
    (Path(tmp) / "b" / "notes.json").write_text("{abîmé", encoding="utf-8")
    code, rep, _ = requete(url, jeton=JETON)
    verifier(code == 500 and rep == {"erreur": "serveur"}, "notes.json abîmé : 500 sans détail")
    requete(url, "POST", JETON, {"prospect": "d1b2c3d4e5", **bloc(), "modifie_le_precedent": None})
    verifier((Path(tmp) / "b" / "notes.json").read_text(encoding="utf-8") == "{abîmé", "notes.json abîmé : jamais écrasé")
    httpd.shutdown()

    # 7. limite des jetons faux : 20 par heure et par adresse, puis 429 même avec le bon jeton
    httpd, url = demarrer(Path(tmp) / "c")
    codes = [requete(url, jeton=FAUX)[0] for _ in range(20)]
    code, rep, h = requete(url, jeton=JETON)
    verifier(codes == [403] * 20 and code == 429 and rep["erreur"] == "trop_essais" and h.get("Retry-After") == "3600", "après 20 jetons faux : 429, même avec le bon jeton")
    httpd.shutdown()

print("TOUT EST BON" if ok else "DES TESTS ÉCHOUENT")
sys.exit(0 if ok else 1)
