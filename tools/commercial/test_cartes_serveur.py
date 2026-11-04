"""Cartes préparées (cartes.php, reproduit par notes_local.py) : droits, validation, lecture publique, mise à jour, suppression,
anciennes fiches (offre « premium », champ « periode ») toujours lisibles, valeurs permises identiques des deux côtés.
    python tools/commercial/test_cartes_serveur.py
"""
import base64
import hashlib
import json
import re
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
         "offre": "starter", "engagement": "sans", "qr": {"unit": 1, "pack5": 0, "pack10": 0}, "prospect": "abc123", "logo": PNG}
# Fiche écrite avant la grille Starter + Pro, comme celle de La Fusion sur le serveur
ANCIENNE = {"nom": "La Fusion", "activite": "Restaurant", "recompense": "Dessert offert", "fond": "#0d131a", "tampons": "#e9a03d", "passages": 8,
            "offre": "premium", "periode": "mensuel", "qr": {"unit": 0, "pack5": 0, "pack10": 0}, "prospect": "abc123",
            "cree_le": "2026-10-30T13:33:00Z", "modifie_le": "2026-10-30T13:33:00Z"}
ID_ANCIENNE = "19k93n5985n294gn"
PHP = (Path(__file__).parents[2] / "public" / "espace-commercial" / "cartes.php").read_text(encoding="utf-8")


def appel(base, chemin="", jeton=JETON, corps=None):
    req = urllib.request.Request(base + chemin, method="POST" if corps is not None else "GET",
                                 data=json.dumps(corps).encode() if corps is not None else None,
                                 headers={"Content-Type": "application/json", **({"X-Panel-Jeton": jeton} if jeton else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def liste_php(nom):
    """Valeurs d'une constante de cartes.php : ce PC n'a pas PHP, le fichier est seulement relu."""
    return tuple(re.findall(r"'([a-z]+)'", re.search(rf"^const {nom} = \[(.*?)\];$", PHP, re.M).group(1)))


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

    verifie("cartes.php et notes_local.py : mêmes offres", liste_php("OFFRES") == notes_local.OFFRES == ("starter", "pro"))
    verifie("cartes.php et notes_local.py : mêmes engagements", liste_php("ENGAGEMENTS") == notes_local.ENGAGEMENTS == ("sans", "engage"))
    verifie("cartes.php lit et écrit le champ engagement", "$c['engagement']" in PHP and "$c['periode']" not in PHP)
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
    verifie("lecture publique : offre et engagement relus", r["carte"]["offre"] == "starter" and r["carte"]["engagement"] == "sans" and "periode" not in r["carte"])
    code, r = appel(B)
    verifie("liste sans logo, avec le repère", code == 200 and len(r["cartes"]) == 1 and "logo" not in r["cartes"][0] and r["cartes"][0]["a_logo"] and r["cartes"][0]["prospect"] == "abc123")
    code, r = appel(B, corps={"id": cid, "carte": {**CARTE, "passages": 10, "offre": "pro", "engagement": "engage", "logo": None}})
    verifie("mise à jour : même identifiant", code == 200 and r["id"] == cid)
    code, r = appel(B, f"?id={cid}", jeton="")
    verifie("mise à jour relue, logo retiré", r["carte"]["passages"] == 10 and r["carte"]["logo"] is None and r["carte"]["offre"] == "pro" and r["carte"]["engagement"] == "engage")
    verifie("carte aux passages : pas de montant", r["carte"].get("montant") is None)
    appel(B, corps={"id": cid, "carte": {**CARTE, "montant": 150}})
    code, r = appel(B, f"?id={cid}", jeton="")
    verifie("carte au montant dépensé relue", code == 200 and r["carte"]["montant"] == 150)
    for nom, champ in (("couleur", {"fond": "red"}), ("offre", {"offre": "gratuit"}), ("offre plus vendue", {"offre": "premium"}), ("engagement", {"engagement": "annuel"}),
                       ("nom vide", {"nom": "  "}), ("passages", {"passages": 500}), ("montant trop bas", {"montant": 10}),
                       ("montant trop haut", {"montant": 5000}), ("montant à virgule", {"montant": 99.5}), ("QR", {"qr": {"unit": 99, "pack5": 0, "pack10": 0}})):
        verifie(f"refus : {nom}", appel(B, corps={"carte": {**CARTE, **champ}})[0] == 400)
    sans_engagement = {k: v for k, v in CARTE.items() if k != "engagement"}
    verifie("refus : ancien format, periode sans engagement", appel(B, corps={"carte": {**sans_engagement, "periode": "mensuel"}})[0] == 400)
    verifie("refus : logo SVG", appel(B, corps={"carte": {**CARTE, "logo": "data:image/svg+xml;base64,PHN2Zz4="}})[0] == 400)
    verifie("refus : faux PNG", appel(B, corps={"carte": {**CARTE, "logo": "data:image/png;base64,PHN2Zz4="}})[0] == 400)
    verifie("mise à jour d'une carte inconnue : 404", appel(B, corps={"id": "aaaaaaaaaaaaaaaa", "carte": CARTE})[0] == 404)
    verifie("suppression", appel(B, corps={"supprimer": cid})[0] == 200)
    verifie("carte supprimée : 404", appel(B, f"?id={cid}", jeton="")[0] == 404)

    # Ancienne fiche déjà sur le serveur : lue telle quelle (normalizeOffer côté site), jamais perdue ni refusée
    (Path(tmp) / "cartes" / f"{ID_ANCIENNE}.json").write_text(json.dumps(ANCIENNE), encoding="utf-8")
    code, r = appel(B, f"?id={ID_ANCIENNE}", jeton="")
    verifie("ancienne fiche : lecture publique inchangée", code == 200 and r["carte"]["offre"] == "premium" and r["carte"]["periode"] == "mensuel" and r["carte"]["logo"] is None and "prospect" not in r["carte"])
    code, r = appel(B)
    verifie("ancienne fiche : dans la liste du panel", code == 200 and [c["id"] for c in r["cartes"]] == [ID_ANCIENNE] and r["cartes"][0]["offre"] == "premium" and r["cartes"][0]["periode"] == "mensuel")
    code, r = appel(B, corps={"id": ID_ANCIENNE, "carte": {**CARTE, "logo": None}})
    verifie("ancienne fiche : mise à jour au nouveau format, même lien", code == 200 and r["id"] == ID_ANCIENNE)
    code, r = appel(B, f"?id={ID_ANCIENNE}", jeton="")
    verifie("ancienne fiche mise à jour : plus de periode, date de création gardée", r["carte"]["offre"] == "starter" and r["carte"]["engagement"] == "sans" and "periode" not in r["carte"] and r["carte"]["cree_le"] == ANCIENNE["cree_le"])
    httpd.shutdown()
print(f"{ok} contrôles réussis")
