"""Contenus Builder.io (FAQ, articles, secteurs) alignés sur les fichiers de secours relus du dépôt.

    python tools/builder_texte.py              # essai à blanc : montre ce qui changerait, n'écrit rien
    python tools/builder_texte.py --appliquer  # écrit dans Builder (clé privée de secrets/builder.env)

Règle (offres Starter, Premium, Pro du 2026-10-25, dépôt LOYNA docs/OFFRES.md) : les fichiers de secours
(src/content-seed/) sont la version relue. Pour chaque entrée Builder qui a un équivalent dans le dépôt (même slug
pour les articles et les secteurs, même question pour la FAQ), les champs qui diffèrent sont remplacés par ceux du
dépôt ; les autres champs de l'entrée Builder ne bougent pas. Une question de FAQ renommée est retrouvée grâce à
RENOMMEES ; une question du dépôt absente de Builder y est créée et publiée (le site prend toute la FAQ dans Builder
dès qu'il en a une). Rien n'est jamais supprimé : une entrée Builder sans équivalent est seulement signalée. Les
réglages du site (site-settings) ne sont pas recopiés, seulement contrôlés.

Contrôle final : aucun terme retiré (SMS, anciennes offres et anciens prix, « HT », API et webhooks, double tampon, -50 % du parrainage) ne doit rester
dans Builder. La clé privée n'est jamais affichée. Après --appliquer : construire et publier le site (les contenus
Builder sont lus au build).
"""
import glob
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "src" / "content-seed"
LIRE = "https://cdn.builder.io/api/v3/content"
ECRIRE = "https://builder.io/api/v1/write"

# Questions de FAQ renommées : ancienne question (dans Builder) → question du dépôt
RENOMMEES = {
    "Quelle différence entre une notification Wallet et un SMS ?": "Qu’est-ce que la notification de proximité ?",
    # campagnes par semaine au lieu du quota mensuel de notifications (décision d'Ewan du 2026-10-30)
    "Que comptent les quotas de cartes et de notifications ?": "Que comptent les quotas de cartes et de campagnes ?",
    # 1 mois offert au parrain et au filleul au lieu de -50 % (décision d'Ewan du 2026-10-31)
    "Les remises du parrainage se cumulent-elles ?": "Les mois offerts du parrainage se cumulent-ils ?",
}
# Champs « liste de textes » de Builder, stockés sous la forme [{"value": …}]
LISTES = {"secteur": {"recompenses", "messages"}, "article": {"tags"}}
# Termes qui ne doivent plus apparaître nulle part (décision d'Ewan du 2026-10-25)
E = r"[\s  ]?"
RETIRES = [
    ("SMS", re.compile(r"\bSMS\b|smsmode", re.I)),
    ("Essentiel", re.compile(r"\bEssentiel\b|\bESSENTIEL\b")),
    ("Growth", re.compile(r"\bgrowth\b", re.I)),
    ("79 €", re.compile(rf"\b79{E}€")),
    ("49 € par mois", re.compile(rf"\b49{E}€{E}(?:par mois|/{E}mois)")),
    ("ancien prix annuel", re.compile(r"499,80|805,80")),
    ("HT", re.compile(r"\bHT\b")),
    ("API et webhooks", re.compile(r"webhooks", re.I)),
    # double tampon aux heures creuses : retiré des offres le 2026-10-27 (décision d'Ewan)
    ("double tampon", re.compile(r"double tampon|compter double|compte double", re.I)),
    # quota mensuel de notifications remplacé par des campagnes par semaine, délai de 48 h passé à 24 h (2026-10-30)
    ("quota mensuel de notifications", re.compile(rf"notifications par mois|volume mensuel de notifications|quota de notifications|\b24{E}000\b|décompté\w* (?:de vos|des) notifications", re.I)),
    ("48 h entre deux messages", re.compile(rf"toutes les 48{E}(?:h\b|heures)", re.I)),
    # Parrainage LOYNA : -50 % remplacé par 1 mois offert au parrain et au filleul (2026-10-31)
    ("-50 % du parrainage", re.compile(rf"[-−]{E}50{E}%|50{E}%{E}de remise|remises? du parrainage", re.I)),
]


def cles():
    env = dict(l.split("=", 1) for l in (ROOT / "secrets" / "builder.env").read_text(encoding="utf-8").splitlines() if "=" in l)
    publique = env.get("BUILDER_PUBLIC_KEY", "").strip() or re.search(r"[0-9a-f]{32}", (ROOT / "src/lib/builder.ts").read_text(encoding="utf-8")).group(0)
    return publique, env.get("BUILDER_PRIVATE_KEY", "").strip()


def norm(s) -> str:
    return " ".join(str(s).replace(" ", " ").replace(" ", " ").replace("’", "'").split())


def termes(valeur) -> list[str]:
    texte = json.dumps(valeur, ensure_ascii=False)
    return [nom for nom, rx in RETIRES if rx.search(texte)]


def depuis_builder(modele, data):
    d = dict(data or {})
    for k in LISTES.get(modele, ()):
        if isinstance(d.get(k), list):
            d[k] = [x["value"] if isinstance(x, dict) and "value" in x else x for x in d[k]]
    return d


def vers_builder(modele, data):
    d = dict(data)
    for k in LISTES.get(modele, ()):
        if isinstance(d.get(k), list):
            d[k] = [{"value": v} for v in d[k]]
    return d


def lire_builder(modele, publique):
    url = f"{LIRE}/{modele}?apiKey={publique}&limit=100&cachebust=true&includeUnpublished=true"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r).get("results", [])


def ecrire_builder(methode, url, corps, privee):
    req = urllib.request.Request(url, data=json.dumps(corps).encode("utf-8"), method=methode,
                                 headers={"Authorization": f"Bearer {privee}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as err:  # le corps de la réponse ne contient pas la clé
        raise SystemExit(f"   Builder a refusé l'écriture ({err.code}) : {err.read()[:300].decode('utf-8', 'replace')}")


def graines():
    articles = [json.loads(Path(f).read_text(encoding="utf-8")) for f in sorted(glob.glob(str(SEED / "articles" / "*.json")))]
    return {
        "faq": json.loads((SEED / "faq.json").read_text(encoding="utf-8")),
        "article": articles,
        "secteur": json.loads((SEED / "sectors.json").read_text(encoding="utf-8")),
    }


def plan(modele, entrees, graine):
    """Liste des opérations : (action, entrée Builder ou None, données du dépôt, champs modifiés)."""
    ops = []
    if modele == "faq":
        par_q = {norm(e["data"].get("q", "")): e for e in entrees}
        renommees = {norm(n): norm(a) for a, n in RENOMMEES.items()}
        vues = set()
        for g in graine:
            e = par_q.get(norm(g["q"])) or par_q.get(renommees.get(norm(g["q"]), ""))
            if e is None:
                ops.append(("créer", None, g, list(g)))
                continue
            vues.add(e["id"])
            avant = e.get("data") or {}
            champs = [k for k in g if avant.get(k) != g[k]]
            if champs or e.get("name") != g["q"] or e.get("published") != "published":
                ops.append(("modifier", e, g, champs))
        for e in entrees:
            if e["id"] not in vues:
                ops.append(("signaler", e, None, []))
    else:
        par_slug = {g["slug"]: g for g in graine}
        for e in entrees:
            g = par_slug.get((e.get("data") or {}).get("slug"))
            if g is None:
                ops.append(("signaler", e, None, []))
                continue
            avant = depuis_builder(modele, e.get("data"))
            champs = [k for k in g if avant.get(k) != g[k]]
            if champs:
                ops.append(("modifier", e, g, champs))
    return ops


def main():
    appliquer = "--appliquer" in sys.argv
    publique, privee = cles()
    if appliquer and not privee:
        raise SystemExit("Clé privée absente de secrets/builder.env : rien n'est écrit.")
    g = graines()
    total = 0
    for modele in ("faq", "article", "secteur"):
        entrees = lire_builder(modele, publique)
        for action, e, cible, champs in plan(modele, entrees, g[modele]):
            nom = (cible or {}).get("q") or (e or {}).get("name") or (cible or {}).get("slug")
            if action == "signaler":
                print(f"{modele} · {e.get('name')} : sans équivalent dans le dépôt, laissée telle quelle")
                continue
            total += 1
            retires = termes(depuis_builder(modele, e["data"])) if e else []
            print(f"{modele} · {nom} : {action}" + (f" ({', '.join(champs)})" if action == "modifier" else "")
                  + (f" ; retire : {', '.join(retires)}" if retires else ""))
            if e and modele == "faq" and norm(e.get("name", "")) != norm(cible["q"]):
                print(f"   ancienne question : {e.get('name')}")
            if not appliquer:
                continue
            if action == "créer":
                statut = ecrire_builder("POST", f"{ECRIRE}/{modele}", {"name": cible["q"], "published": "published", "data": cible}, privee)
            else:
                data = {**(e.get("data") or {}), **vers_builder(modele, {k: cible[k] for k in champs})}
                corps = {"data": data}
                if modele == "faq":
                    corps.update(name=cible["q"], published="published")
                statut = ecrire_builder("PATCH", f"{ECRIRE}/{modele}/{e['id']}", corps, privee)
            print(f"   écrit dans Builder : {statut}")
    print(f"{total} entrée(s) {'écrite(s)' if appliquer else 'à écrire (relancer avec --appliquer)'}")

    # Contrôle : plus aucun terme retiré dans Builder (lu à nouveau, sans cache)
    restes = 0
    for modele in ("faq", "article", "secteur", "site-settings"):
        for e in lire_builder(modele, publique):
            t = termes(e.get("data"))
            if t:
                restes += 1
                print(f"contrôle · {modele} · {e.get('name')} : contient encore {', '.join(t)}")
    print("contrôle : aucun terme retiré dans Builder" if not restes else f"contrôle : {restes} entrée(s) à revoir"
          + ("" if appliquer else " (normal avant --appliquer)"))


if __name__ == "__main__":
    main()
