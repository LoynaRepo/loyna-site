// Fond uni d'un logo retiré à l'envoi (Ewan, 2026-11-01) : un logo sur fond blanc ou crème formait un bloc clair sur une carte
// foncée. Seul un fond sûr est retiré : bord de l'image opaque et d'une seule couleur. Une photo, un dégradé ou un logo déjà
// transparent restent tels quels. Les contreforts des lettres (l'intérieur d'un O) partent aussi, pas une grande forme
// intérieure de la couleur du fond (un rond blanc dans un badge), qui fait partie du dessin.

/** Écart maximal (par canal) entre un pixel du fond et la couleur du fond, compression JPG comprise. */
const FOND = 20;
/** Au-delà de cet écart, un pixel du contour reste entièrement opaque. */
const CONTOUR = 90;
/** Épaisseur en pixels du contour adouci. */
const ADOUCI = 2;
/** Le bord doit être opaque et de la couleur du fond sur cette part de sa longueur. */
const BORD_UNI = 0.9;
/** Au-dessus de cette part de l'image, une zone intérieure de la couleur du fond fait partie du dessin. */
const CONTREFORT_MAX = 0.05;
/** Part minimale de l'image qui doit rester visible : en dessous, le logo était son fond. */
const VISIBLE_MIN = 0.005;

const mediane = (valeurs: number[]) => valeurs.sort((a, b) => a - b)[valeurs.length >> 1];

/** Retire le fond de `px` (RGBA, modifié sur place). Renvoie true si un fond a été retiré, sinon l'image est intacte. */
export function retirerFondUni(px: Uint8ClampedArray, w: number, h: number): boolean {
  const n = w * h;
  if (w < 8 || h < 8) return false;
  const bord: number[] = [];
  for (let x = 0; x < w; x++) bord.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) bord.push(y * w, y * w + w - 1);
  const opaques = bord.filter((i) => px[i * 4 + 3] >= 250);
  if (opaques.length < bord.length * BORD_UNI) return false;
  const fond = [0, 1, 2].map((c) => mediane(opaques.map((i) => px[i * 4 + c])));
  const ecart = (i: number) => Math.max(Math.abs(px[i * 4] - fond[0]), Math.abs(px[i * 4 + 1] - fond[1]), Math.abs(px[i * 4 + 2] - fond[2]));
  if (opaques.filter((i) => ecart(i) <= FOND).length < bord.length * BORD_UNI) return false;

  // Zones de la couleur du fond : 1 = à retirer, 2 = gardée (grande forme intérieure)
  const zone = new Uint8Array(n);
  const vu = new Uint8Array(n);
  const estFond = (i: number) => px[i * 4 + 3] >= 250 && ecart(i) <= FOND;
  const parcourir = (depart: number[]) => {
    const pile = depart;
    const cases: number[] = [];
    while (pile.length) {
      const i = pile.pop() as number;
      cases.push(i);
      const x = i % w;
      for (const v of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (v >= 0 && v < n && !vu[v] && estFond(v)) {
          vu[v] = 1;
          pile.push(v);
        }
      }
    }
    return cases;
  };
  const departs = opaques.filter((i) => ecart(i) <= FOND);
  for (const i of departs) vu[i] = 1;
  for (const i of parcourir(departs)) zone[i] = 1;
  for (let i = 0; i < n; i++) {
    if (vu[i] || !estFond(i)) continue;
    vu[i] = 1;
    const cases = parcourir([i]);
    const garde = cases.length > n * CONTREFORT_MAX;
    for (const c of cases) zone[c] = garde ? 2 : 1;
  }

  let retires = 0;
  for (let i = 0; i < n; i++) if (zone[i] === 1) retires++;
  if (n - retires < n * VISIBLE_MIN) return false;

  // Contour : à côté du fond retiré, le pixel mêle la couleur du logo et celle du fond. On retrouve la première et sa transparence.
  let front: number[] = [];
  for (let i = 0; i < n; i++) if (zone[i] === 1) front.push(i);
  const adoucis = new Float32Array(n).fill(1);
  for (let tour = 0; tour < ADOUCI; tour++) {
    const suivant: number[] = [];
    for (const i of front) {
      const x = i % w;
      for (const v of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (v < 0 || v >= n || zone[v] || adoucis[v] < 1) continue;
        const a = Math.min(1, Math.max(0.004, (ecart(v) - FOND) / (CONTOUR - FOND)));
        if (a >= 1) continue;
        adoucis[v] = a;
        suivant.push(v);
      }
    }
    front = suivant;
  }
  for (let i = 0; i < n; i++) {
    const a = adoucis[i];
    if (a >= 1) continue;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = (px[i * 4 + c] - (1 - a) * fond[c]) / a;
    px[i * 4 + 3] = px[i * 4 + 3] * a;
  }
  for (let i = 0; i < n; i++) if (zone[i] === 1) px[i * 4 + 3] = 0;
  return true;
}

/** Part (0 à 1) des pixels visibles d'un logo qui se confondent avec le fond de la carte : du texte foncé sur une carte foncée. */
export function partConfondue(px: Uint8ClampedArray, fond: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const lf = lum(fond[0], fond[1], fond[2]);
  let visibles = 0;
  let confondus = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    visibles++;
    const l = lum(px[i], px[i + 1], px[i + 2]);
    if ((Math.max(l, lf) + 0.05) / (Math.min(l, lf) + 0.05) < 1.5) confondus++;
  }
  return visibles ? confondus / visibles : 0;
}
