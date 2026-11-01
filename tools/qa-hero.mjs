// Haut de l'accueil : aucune pastille flottante ne doit toucher une autre pastille, la notification du téléphone, la carte
// (nom, passages, tampons, récompense), la colonne de gauche ou la courbe du bas, à aucun moment de leurs animations.
//   node tools/qa-hero.mjs <base> [largeur min=700] [largeur max=1280] [pas=1]
// Pour chaque largeur, chaque animation est parcourue sur tout son cycle (arrêtée, puis réglée image par image), et l'on garde
// la zone balayée par chaque élément : si deux zones ne se touchent pas, les éléments ne se touchent à aucun moment, quel que soit
// leur décalage. La notification est mesurée avec tous les noms du défilé et un nom de 40 caractères, le plus long possible.
import puppeteer from 'puppeteer-core';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const [BASE = 'http://127.0.0.1:4329', min = '700', max = '1280', pas = '1'] = process.argv.slice(2);
const MARGE = 4; // écart minimal entre deux zones, en pixels

const b = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu', '--hide-scrollbars']});
const page = await b.newPage();
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('loyna-consent', JSON.stringify({ok: false, t: Date.now()}));
  } catch {}
  // défilé des cartes arrêté : la mesure règle elle-même les noms
  const si = window.setInterval;
  window.setInterval = (f, t, ...a) => (t === 3400 ? 0 : si(f, t, ...a));
});
await page.setViewport({width: Number(max), height: 900, deviceScaleFactor: 1});
await page.goto(BASE + '/', {waitUntil: 'networkidle0', timeout: 90000});
await page.evaluate(() => document.fonts.ready);

let echecs = 0;
let nb = 0;
const premiers = new Map();
for (let w = Number(min); w <= Number(max); w += Number(pas)) {
  await page.setViewport({width: w, height: 900, deviceScaleFactor: 1});
  const r = await page.evaluate((marge) => {
    const hero = document.getElementById('hero');
    const vu = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const boite = (e) => {
      const q = e.getBoundingClientRect();
      return {l: q.left, t: q.top + scrollY, r: q.right, b: q.bottom + scrollY};
    };
    const union = (a, c) => (a ? {l: Math.min(a.l, c.l), t: Math.min(a.t, c.t), r: Math.max(a.r, c.r), b: Math.max(a.b, c.b)} : c);
    const coupe = (a, c, m = marge) => a && c && a.l < c.r + m && c.l < a.r + m && a.t < c.b + m && c.t < a.b + m;
    const texte = (q) => `${Math.round(q.l)},${Math.round(q.t)} à ${Math.round(q.r)},${Math.round(q.b)}`;
    /** Zone balayée par un élément sur tout le cycle de son animation (seulement là où il est visible). */
    function balayage(e, pas = 48) {
      const anim = e.getAnimations()[0];
      if (!anim) return boite(e);
      const t = anim.effect.getComputedTiming();
      anim.pause();
      let z = null;
      for (let i = 0; i < pas; i++) {
        anim.currentTime = t.delay + (t.duration * i) / pas;
        if (Number(getComputedStyle(e).opacity) > 0.01) z = union(z, boite(e));
      }
      return z;
    }
    const pills = [...hero.querySelectorAll('.pill')].filter(vu);
    const zones = pills.map((p) => ({nom: p.className.split(' ').find((c) => c.startsWith('pill-')), z: balayage(p)}));
    const pb = [];
    // pastilles entre elles
    for (let i = 0; i < zones.length; i++) for (let k = i + 1; k < zones.length; k++) if (coupe(zones[i].z, zones[k].z)) pb.push(`${zones[i].nom} touche ${zones[k].nom}`);
    // pastilles et bords de l'écran
    for (const {nom, z} of zones) if (z.l < 0 || z.r > innerWidth) pb.push(`${nom} coupée par le bord de l'écran (${texte(z)})`);

    const toast = hero.querySelector('.toast');
    if (vu(toast)) {
      // notification : tout son mouvement, puis sa position d'arrêt avec chaque nom
      let zt = balayage(toast);
      const noms = [...new Set(JSON.parse(hero.dataset.demos).map((d) => d.name)), 'Boulangerie du Vieux Moulin de la Mosson'.slice(0, 40)];
      const champs = [...hero.querySelectorAll('[data-name]')];
      const avant = champs.map((c) => c.textContent);
      const anim = toast.getAnimations()[0];
      const t = anim.effect.getComputedTiming();
      anim.currentTime = t.delay + t.duration * 0.3;
      let hMax = 0;
      for (const n of noms) {
        champs.forEach((c) => (c.textContent = n));
        const q = boite(toast);
        hMax = Math.max(hMax, q.b - q.t);
        zt = union(zt, q);
      }
      champs.forEach((c, i) => (c.textContent = avant[i]));
      for (const {nom, z} of zones) if (coupe(z, zt)) pb.push(`${nom} touche la notification (${texte(z)} / ${texte(zt)})`);

      // carte du téléphone : ni le nom, ni les passages, ni les tampons, ni la récompense, ni le QR code sous une pastille
      const carte = hero.querySelector('.phone-wrap .wcard');
      for (const s of ['.wc-name', '.wc-count', '.wc-stamps', '.wc-reward', '.wc-qr svg']) {
        const q = boite(carte.querySelector(s));
        for (const {nom, z} of zones) if (coupe(z, q, 0)) pb.push(`${nom} couvre ${s}`);
      }
      // colonne de gauche
      for (const s of ['h1', '.h-copy .lead', '.try-row', '.hero-alt', '.hero-essai', '.hero-points']) {
        const q = boite(hero.querySelector(s));
        for (const {nom, z} of zones) if (coupe(z, q, 0)) pb.push(`${nom} touche ${s}`);
      }
      // courbe du bas : la plus haute des deux tracés, à l'aplomb de chaque pastille
      const j = document.querySelector('main .jonction');
      const rj = j.getBoundingClientRect();
      const path = j.querySelector('.j-voile');
      const retourne = j.classList.contains('jonction--retournee');
      const L = path.getTotalLength();
      const courbe = [];
      for (let i = 0; i < 400; i++) {
        const p = path.getPointAtLength((L * i) / 400);
        if (p.y >= 120) continue;
        const x = (retourne ? 1440 - p.x : p.x) * (rj.width / 1440);
        courbe.push([rj.left + x, rj.top + scrollY + p.y * (rj.height / 120)]);
      }
      for (const {nom, z} of zones) {
        const yMin = Math.min(...courbe.filter(([x]) => x >= z.l && x <= z.r).map(([, y]) => y));
        if (z.b > yMin - marge) pb.push(`${nom} passe sous la courbe (bas ${Math.round(z.b)}, courbe ${Math.round(yMin)})`);
      }
      return {pb, hMax: Math.round(hMax), toast: texte(zt), zones: zones.map(({nom, z}) => `${nom} ${texte(z)}`)};
    }
    return {pb, zones: zones.map(({nom, z}) => `${nom} ${texte(z)}`)};
  }, MARGE);
  nb++;
  if (r.pb.length) {
    echecs++;
    for (const p of r.pb) {
      const cle = p.replace(/\(.*\)/, '').trim();
      if (!premiers.has(cle)) premiers.set(cle, {de: w, a: w, ex: p});
      else premiers.get(cle).a = w;
    }
  }
}
await b.close();
for (const [, v] of premiers) console.log(`${v.de} à ${v.a} px : ${v.ex}`);
console.log(`${nb} largeurs de ${min} à ${max} px, pas de ${pas} : ${echecs ? `${echecs} à revoir` : 'aucun recouvrement, à aucun moment du cycle'}`);
process.exit(echecs ? 1 : 0);
