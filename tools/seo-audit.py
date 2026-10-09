"""Audit SEO des pages construites (dist/) : titre, description, H1, mots, données structurées, liens internes.

python tools/seo-audit.py            (après npx astro build)
"""
import glob
import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

inbound = Counter()
pages = []
for f in sorted(glob.glob(os.path.join(DIST, "**", "index.html"), recursive=True)):
    h = open(f, encoding="utf-8").read()
    path = "/" + os.path.relpath(os.path.dirname(f), DIST).replace(os.sep, "/") + "/"
    path = "/" if path == "/./" else path
    t = re.search(r"<title>(.*?)</title>", h, re.S)
    d = re.search(r'<meta name="description" content="(.*?)"', h)
    h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", h, re.S)
    robots = re.search(r'<meta name="robots" content="(.*?)"', h)
    types = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        types += re.findall(r'"@type":\s*"(\w+)"', block)
    body = re.sub(r"<script.*?</script>|<style.*?</style>|<header.*?</header>|<footer.*?</footer>", " ", h, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", body)
    words = len(text.split())
    for href in set(re.findall(r'href="(/[^"#?]*)', body)):
        inbound[href] += 1
    pages.append((path, t.group(1) if t else "", d.group(1) if d else "", re.sub("<[^>]+>", "", h1[0]).strip() if h1 else "", words, robots.group(1) if robots else "index", sorted(set(types))))

for path, t, d, h1, words, robots, types in pages:
    print(f"{path}  [{robots}]  {words} mots  liens entrants {inbound.get(path, 0)}")
    print(f"  title ({len(t)}) : {t}")
    print(f"  desc  ({len(d)}) : {d[:170]}")
    print(f"  h1 : {h1[:100]}")
    print(f"  schema : {', '.join(types) or '—'}")
