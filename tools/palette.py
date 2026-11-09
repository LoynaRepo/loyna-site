"""Palette du site (Ewan, 09/11/2026) : 60 % #E9ECEF (fonds clairs), 30 % #111316 (texte, sections sombres), 10 % #7B4DFF (accent).
Remplace les couleurs de l'ancienne charte crème / encre / or dans les feuilles de style et les styles des pages (.css, .astro).
Les couleurs des cartes des commerçants (données .ts/.tsx) ne sont pas touchées. Lisibilité : #7B4DFF en fond avec texte blanc
(4,8:1) ; texte violet sur fond clair en #5A2FE0 ou #6A3BF0 (> 4,5:1) ; texte violet sur fond sombre en #A487FF (6,6:1).
    python tools/palette.py            -> applique
    python tools/palette.py --essai    -> compte seulement"""
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1] / 'src'
# couleurs des cartes des commerçants, pas celles du site : visuel des mails perso et nuancier du configurateur
EXCLUS = {'pages/visuel-carte.astro', 'pages/creer-ma-carte.astro'}
HEX = {
    # fonds clairs (60 %)
    'f7f1e6': 'E9ECEF', 'faf7f0': 'E9ECEF', 'f8f4ec': 'EEF0F2', 'fbf6ec': 'EEF0F2', 'fffdf8': 'F7F8FA', 'fff7f6': 'FBF7F7',
    'ede2cf': 'DDE1E6', 'e9e5dc': 'DDE1E6', 'f3e3c3': 'E4DCFF',
    # filets
    'e3d7c2': 'CDD2D8', 'dccfb8': 'C9CED5', 'd9cbb2': 'C9CED5', 'c9c2b4': 'B8BEC6', 'b9b3a7': 'A9B0B8',
    # sombres (30 %)
    '121216': '111316', '1c1b21': '181B1F', '1d1c22': '111316', '16161a': '15171B', '17151a': '15171B', '1f1c17': '1A1D21',
    '17140f': '15171B', '16130e': '15171B', '120d08': '0E1013', '26231d': '1F2328',
    # gris de texte
    '5d5850': '5B6168', '4f4a42': '4A5057', '8f887c': '868C93',
    # or -> violet (10 %)
    'c9963f': '7B4DFF', 'e6c27a': 'A487FF', 'a87530': '5A2FE0', 'd9b27a': '9471FF', 'f0d49a': 'C2AEFF',
    '7a5418': '5A2FE0', '6b4a14': '4B25C9',
}
RGBA = {(201, 150, 63): (123, 77, 255), (230, 194, 122): (164, 135, 255), (18, 18, 22): (17, 19, 22),
        (250, 247, 240): (233, 236, 239), (248, 244, 236): (233, 236, 239)}


def convertir(t):
    n = 0
    def h(m):
        nonlocal n
        v = HEX.get(m.group(1).lower())
        if v:
            n += 1
            return '#' + v
        return m.group(0)
    t = re.sub(r'#([0-9a-fA-F]{6})\b', h, t)
    def r(m):
        nonlocal n
        c = tuple(int(x) for x in m.group(2).split(','))
        if c in RGBA:
            n += 1
            return f'{m.group(1)}({", ".join(map(str, RGBA[c]))}, {m.group(3)})'
        return m.group(0)
    t = re.sub(r'(rgba)\(\s*(\d+\s*,\s*\d+\s*,\s*\d+)\s*,\s*([\d.]+)\s*\)', lambda m: r(type('M', (), {'group': lambda s, i: [m.group(0), m.group(1), m.group(2).replace(' ', ''), m.group(3)][i]})()), t)
    return t, n


def main():
    essai = '--essai' in sys.argv
    total = 0
    for p in sorted(list(RACINE.rglob('*.css')) + list(RACINE.rglob('*.astro'))):
        if p.relative_to(RACINE).as_posix() in EXCLUS:
            continue
        t = p.read_text(encoding='utf-8')
        u, n = convertir(t)
        if n:
            total += n
            print(f'{n:4d}  {p.relative_to(RACINE)}')
            if not essai:
                p.write_text(u, encoding='utf-8', newline='')
    print(f'{total} couleurs {"à remplacer" if essai else "remplacées"}')


if __name__ == '__main__':
    main()
