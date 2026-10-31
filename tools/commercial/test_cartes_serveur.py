"""Cartes préparées (cartes.php, reproduit par notes_local.py) : droits, validation, lecture publique, mise à jour, suppression.
    python tools/commercial/test_cartes_serveur.py
"""
import base64
import hashlib
import json
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.stdout.reconfigure(encoding="utf-8")
import notes_local  # noqa: E402

JETON = "ab" * 32
PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 40).decode()
CARTE = {"nom": "La Fusion", "activite": "Restaurant", "recompense": "Dessert offert", "fond": "#0d131a", "tampons": "#e9a03d", "passages": 8,
         "offre": "premium", "periode": "mensuel", "qr": {"unit": 1, "pack5": 0, "pack10": 0}, "prospect": "abc123", "logo": PNG}


def appel(base, chemin="", jeton=JETON, corps=None):
    req = urllib.request.Request(base + chemin, method="POST" if corps is not None else "GET",
                                 data=json.dumps(corps).encode() if corps is not None else None,
                                 headers={"Content-Type": "application/json", **({"X-Panel-Jeton": jeton} if jeton else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


with tempfile.TemporaryDirectory() as tmp:
    (Path(tmp) / "jeton.sha256").write_text(hashlib.sha256(bytes.fromhex(JETON)).hexdigest(), encoding="ascii")
    httpd = notes_local.demarrer(tmp, port=4331)
    B = "http://127.0.0.1:4331" + notes_local.CHEMIN_CARTES
    ok = 0

    def verifie(nom, condition):
        global ok
        assert condition, nom
        ok += 1
        print("ok :", nom)

    verifie("sans jeton : 401", appel(B, jeton="")[0] == 401)
    verifie("mauvais jeton : 403", appel(B, jeton="cd" * 32)[0] == 403)
    verifie("écriture sans jeton : 401", appel(B, jeton="", corps={"carte": CARTE})[0] == 401)
    verifie("carte inconnue : 404", appel(B, "?id=aaaaaaaaaaaaaaaa", jeton="")[0] == 404)
    verifie("identifiant invalide : 404", appel(B, "?id=../../jeton", jeton="")[0] == 404)
    code, r = appel(B, corps={"carte": CARTE})
    verifie("création", code == 200 and r["ok"] and notes_local.RE_ID_CARTE.fullmatch(r["id"]))
    cid = r["id"]
    code, r = appel(B, f"?id={cid}", jeton="")
    verifie("lecture publique avec logo, sans le repère du panel", code == 200 and r["carte"]["logo"] == PNG and "prospect" not in r["carte"] and r["carte"]["passages"] == 8)
    code, r = appel(B)
    verifie("liste sans logo, avec le repère", code == 200 and len(r["cartes"]) == 1 and "logo" not in r["cartes"][0] and r["cartes"][0]["a_logo"] and r["cartes"][0]["prospect"] == "abc123")
    code, r = appel(B, corps={"id": cid, "carte": {**CARTE, "passages": 10, "logo": None}})
    verifie("mise à jour : même identifiant", code == 200 and r["id"] == cid)
    code, r = appel(B, f"?id={cid}", jeton="")
    verifie("mise à jour relue, logo retiré", r["carte"]["passages"] == 10 and r["carte"]["logo"] is None)
    for nom, champ in (("couleur", {"fond": "red"}), ("offre", {"offre": "gratuit"}), ("nom vide", {"nom": "  "}), ("passages", {"passages": 500}), ("QR", {"qr": {"unit": 99, "pack5": 0, "pack10": 0}})):
        verifie(f"refus : {nom}", appel(B, corps={"carte": {**CARTE, **champ}})[0] == 400)
    verifie("refus : logo SVG", appel(B, corps={"carte": {**CARTE, "logo": "data:image/svg+xml;base64,PHN2Zz4="}})[0] == 400)
    verifie("refus : faux PNG", appel(B, corps={"carte": {**CARTE, "logo": "data:image/png;base64,PHN2Zz4="}})[0] == 400)
    verifie("mise à jour d'une carte inconnue : 404", appel(B, corps={"id": "aaaaaaaaaaaaaaaa", "carte": CARTE})[0] == 404)
    verifie("suppression", appel(B, corps={"supprimer": cid})[0] == 200)
    verifie("carte supprimée : 404", appel(B, f"?id={cid}", jeton="")[0] == 404)
    httpd.shutdown()
print(f"{ok} contrôles réussis")
