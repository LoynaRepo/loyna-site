// Captures d'écran du guide de démarrage (/espace-client/guide/) : la démonstration de LOYNA Business, sur
// téléphone, recadrée partie par partie, enregistrée en WebP léger dans public/espace-client/guide/.
//
//   node tools/guide-captures.mjs                         captures sur https://loyna.fr (démo publique)
//   node tools/guide-captures.mjs http://127.0.0.1:4321   captures sur le site local (npx astro preview)
//   node tools/guide-captures.mjs <adresse> aide           une seule capture (nom contenant « aide »)
//
// Les captures du 2026-10-28 viennent du site local (même démo que loyna.fr, avec le lien « Guide de démarrage » du
// menu, pas encore en ligne ce jour-là). Ensuite, refaire le PDF : node tools/guide-pdf.mjs <adresse>.
//
// Toujours le même commerce fictif (graine 268380 : « Boulangerie du Moulin Doré », noir et or) et l'offre Premium,
// pour que les images restent cohérentes d'une fois sur l'autre. Le bandeau « Démonstration » et les barres fixes
// du téléphone sont masqués (sauf sur la capture du menu « Plus »). Navigateur : Microsoft Edge, sans fenêtre.
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = (process.argv[2] ?? 'https://loyna.fr').replace(/\/$/, '');
const DEMO = `${BASE}/espace-client/demo/?seed=268380&offre=premium`;
const OUT = path.resolve('public/espace-client/guide');
const W = 390; // largeur d'un téléphone courant (CSS px)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Masques : bandeau de la démo, en-tête et barre du bas fixes (ils se superposeraient aux recadrages), animations
const CSS = `
.demobar, .toasts { display: none !important; }
html:not(.keep-bars) .top, html:not(.keep-bars) .tabbar { display: none !important; }
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
`;

/** Élément par sélecteur, et texte contenu (facultatif) ; n = rang parmi les correspondances. */
const pick = (sel, text = '', n = 0) => ({sel, text, n});

// Une capture : écran (#/…), élément attendu (`ready`), préparation (clics, saisies), puis zone du haut de `top`
// au bas de `bottom`, sur toute la largeur du téléphone.
const SHOTS = [
  {
    name: '01-connexion',
    route: '',
    session: 'out',
    prepare: async (p) => {
      await p.type('input[type=email]', 'vous@exemple.fr');
    },
    top: pick('.login-card'),
    bottom: pick('.login-card'),
    pad: 14,
  },
  {name: '02-reglages', route: 'reglages', top: pick('.fld-l', 'Logo'), bottom: pick('input[type=tel]'), pad: 16},
  {name: '03-qr-code', route: 'reglages', top: pick('.pnl', 'Affiche du comptoir'), bottom: pick('.pnl', 'Affiche du comptoir'), pad: 10},
  {
    name: '04-scanner',
    route: 'scanner',
    ready: '.scan-tools',
    prepare: async (p) => {
      await clickText(p, 'button', 'Simuler un scan');
      await p.waitForSelector('.result', {timeout: 8000});
      await wait(600);
    },
    top: pick('.result'),
    bottom: pick('.result'),
    pad: 14,
    skip: ['.scan-tools'], // « Simuler un scan » n'existe que dans la démonstration
  },
  {name: '05-programme', route: 'programme', top: pick('.pnl', 'Récompenses'), bottom: pick('.pnl', 'Récompenses'), pad: 10},
  {name: '06-automatisations', route: 'automatisations', top: pick('.auto-sec-h'), bottom: pick('.auto textarea'), pad: 14, padBottom: 3},
  {
    name: '07-campagnes',
    route: 'campagne/nouvelle',
    prepare: async (p) => {
      await p.type('input[maxlength="120"]', 'Offre de la semaine');
      await p.type('textarea', '{prenom}, cette semaine : une viennoiserie offerte pour 2 achetées chez {commerce} !');
      await wait(300);
    },
    top: pick('.fld', 'Message'),
    bottom: pick('button', 'Vérifier les destinataires'),
    pad: 14,
    skip: ['.quota-line'],
  },
  {name: '08-clients', route: 'clients', top: pick('.ph'), bottom: pick('.clist li', '', 2), pad: 12},
  {name: '09-equipe', route: 'equipe', top: pick('.ph'), bottom: pick('.team li', '', 0), pad: 12},
  {name: '10-rapport', route: 'rapport', top: pick('.ph'), bottom: pick('.kpi', '', 1), pad: 12},
  {
    name: '11-aide',
    route: 'accueil',
    ready: '.kpis',
    keepBars: true,
    prepare: async (p) => {
      await clickText(p, '.tabbar button', 'Plus');
      await p.waitForSelector('.sheet', {timeout: 8000});
      await wait(300);
    },
    viewport: true,
    top: pick('.sheet'),
    bottom: pick('.sheet a', 'Guide de démarrage'),
    pad: 10,
  },
];

async function clickText(p, sel, text) {
  const ok = await p.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t));
      el?.click();
      return !!el;
    },
    sel,
    text,
  );
  if (!ok) throw new Error(`Introuvable : ${sel} « ${text} »`);
}

/** Rectangle (coordonnées du document) d'un élément choisi par sélecteur et texte. */
async function rectOf(p, {sel, text, n}) {
  const r = await p.evaluate(
    (s, t, k) => {
      const all = [...document.querySelectorAll(s)].filter((e) => !t || e.textContent.includes(t));
      // le plus petit bloc qui contient le texte (un panneau, pas toute la page)
      const el = t ? all.filter((e) => !all.some((o) => o !== e && e.contains(o)))[k] : all[k];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height};
    },
    sel,
    text,
    n,
  );
  if (!r) throw new Error(`Introuvable : ${sel}${text ? ` « ${text} »` : ''} (${n})`);
  return r;
}

fs.mkdirSync(OUT, {recursive: true});
const browser = await puppeteer.launch({executablePath: EDGE, headless: 'new', args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check']});
const page = await browser.newPage();
await page.setViewport({width: W, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

for (const s of SHOTS) {
  if (process.argv[3] && !s.name.includes(process.argv[3])) continue;
  // session de la démonstration : « out » = écran de connexion
  await page.goto(`${DEMO}#/${s.route}`, {waitUntil: 'networkidle0'});
  await page.evaluate((v) => sessionStorage.setItem('demo-session', v), s.session ?? '1');
  await page.reload({waitUntil: 'networkidle0'});
  await page.addStyleTag({content: CSS + (s.skip ? `${s.skip.join(', ')} { display: none !important; }` : '')});
  await page.evaluate((k) => document.documentElement.classList.toggle('keep-bars', k), !!s.keepBars);
  await page.waitForSelector(s.ready ?? s.top.sel, {timeout: 10000});
  await wait(900);
  if (s.prepare) await s.prepare(page);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await wait(300);

  const a = await rectOf(page, s.top);
  const b = await rectOf(page, s.bottom);
  const y = Math.max(0, Math.floor(a.y - s.pad));
  const clip = {x: 0, y, width: W, height: Math.ceil(b.y + b.h + (s.padBottom ?? s.pad)) - y};
  // fenêtre de dialogue et menu « Plus » : posés sur l'écran, capturés dans la fenêtre telle qu'affichée
  const shot = await page.screenshot(
    s.viewport ? {clip: {...clip, y: clip.y - (await page.evaluate(() => scrollY))}, captureBeyondViewport: false} : {clip, captureBeyondViewport: true},
  );
  const file = path.join(OUT, `${s.name}.webp`);
  await sharp(shot).webp({quality: 78, effort: 6}).toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`${s.name}.webp  ${meta.width} × ${meta.height}  ${Math.round(fs.statSync(file).size / 1024)} Ko`);
}
if (errors.length) console.log('Erreurs de la page :\n' + errors.join('\n'));
await browser.close();
