// Comparaison au pixel entre deux constructions du site (référence et refonte) : pages qui ne doivent pas bouger.
//   node tools/qa-comparer.mjs <base référence> <base refonte> <dossier de sortie>
// 1. /visuel-carte/ capturée avec Microsoft Edge, exactement comme le fait _systeme/mail_perso.py (1200 × 630, échelle 2),
//    pour plusieurs jeux de paramètres ;
// 2. pages applicatives (« bare ») capturées en navigateur sans fenêtre, à l'ordinateur et sur téléphone.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const [ref, neuf, sortie] = process.argv.slice(2);
fs.mkdirSync(sortie, {recursive: true});
let echecs = 0;

async function ecart(a, b, nom) {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  if (ma.width !== mb.width || ma.height !== mb.height) {
    echecs++;
    console.log(`DIFFÉRENT ${nom} : tailles ${ma.width}×${ma.height} et ${mb.width}×${mb.height}`);
    return;
  }
  const [ra, rb] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer(), sharp(b).removeAlpha().raw().toBuffer()]);
  let n = 0;
  let max = 0;
  for (let i = 0; i < ra.length; i += 3) {
    const d = Math.max(Math.abs(ra[i] - rb[i]), Math.abs(ra[i + 1] - rb[i + 1]), Math.abs(ra[i + 2] - rb[i + 2]));
    if (d > 0) n++;
    if (d > max) max = d;
  }
  const total = ra.length / 3;
  const ok = n === 0;
  if (!ok) echecs++;
  console.log(`${ok ? 'IDENTIQUE' : 'DIFFÉRENT'} ${nom} : ${ma.width}×${ma.height}, ${n} pixels différents sur ${total}${n ? `, écart maximal ${max}` : ''}`);
}

// --- 1. Visuel des e-mails, capturé par Edge -----------------------------------------------------------------------
function captureEdge(url, fichier) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-'));
  spawnSync(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1200,630', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=8000', `--user-data-dir=${profil}`, `--screenshot=${fichier}`, url], {timeout: 120000});
  fs.rmSync(profil, {recursive: true, force: true, maxRetries: 3});
  return fs.existsSync(fichier);
}
const VISUELS = {
  defaut: '',
  fournil: '?nom=Le%20Fournil&activite=Boulangerie',
  onglerie: '?nom=Studio%20Nacre&activite=Onglerie&ville=Montpellier',
  couleurs: '?nom=Maison%20Lumi%C3%A8re&activite=Coiffure&recompense=Brushing%20offert&fond=5b3a21&tampons=d9b27a&ambiance=f5ead8',
  long: '?nom=La%20P%C3%A2tisserie%20des%20Marseillais%20de%20Montpellier&activite=P%C3%A2tisserie',
};
for (const [nom, q] of Object.entries(VISUELS)) {
  const a = path.resolve(sortie, `visuel-${nom}-reference.png`);
  const b = path.resolve(sortie, `visuel-${nom}-refonte.png`);
  const okA = captureEdge(`${ref}/visuel-carte/${q}`, a);
  const okB = captureEdge(`${neuf}/visuel-carte/${q}`, b);
  if (!okA || !okB) {
    echecs++;
    console.log(`ÉCHEC capture Edge : ${nom}`);
    continue;
  }
  await ecart(a, b, `/visuel-carte/ par Edge (${nom})`);
}

// --- 2. Pages applicatives ------------------------------------------------------------------------------------------
const PAGES = ['/visuel-carte/?nom=Le%20Fournil&activite=Boulangerie', '/espace-client/', '/espace-client/demo/?seed=268380', '/espace-client/demo/?seed=268380&offre=starter#/abonnement', '/espace-client/guide/', '/espace-client/mot-de-passe/', '/espace-client/confirmer/', '/espace-commercial/', '/join/', '/preferences/'];
const b = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu', '--hide-scrollbars']});
for (const [w, h] of [[1280, 900], [375, 812]]) {
  for (const p of PAGES) {
    const nom = p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + `_${w}`;
    const fichiers = [];
    for (const [base, suff] of [[ref, 'reference'], [neuf, 'refonte']]) {
      const page = await b.newPage();
      await page.setViewport({width: w, height: h, isMobile: w < 600, hasTouch: w < 600, deviceScaleFactor: 1});
      // même horloge et même hasard pour les deux pages : seul le code compte
      await page.evaluateOnNewDocument(() => {
        const t = 1793459000000;
        const D = Date;
        // eslint-disable-next-line no-global-assign
        Date = class extends D {
          constructor(...a) {
            super(...(a.length ? a : [t]));
          }
          static now() {
            return t;
          }
        };
        let s = 42;
        Math.random = () => {
          s = (s * 16807) % 2147483647;
          return s / 2147483647;
        };
      });
      await page.goto(base + p, {waitUntil: 'networkidle0', timeout: 90000});
      await page.addStyleTag({content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
      // images décodées avant la capture (sinon leur décodage asynchrone crée de fausses différences)
      await page.evaluate(async () => {
        document.querySelectorAll('img').forEach((i) => {
          i.loading = 'eager';
          i.decoding = 'sync';
        });
        await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      });
      await new Promise((r) => setTimeout(r, 700));
      const f = path.resolve(sortie, `${nom}-${suff}.png`);
      await page.screenshot({path: f, fullPage: true});
      fichiers.push(f);
      await page.close();
    }
    await ecart(fichiers[0], fichiers[1], `${p} (${w} px)`);
  }
}
await b.close();
console.log(echecs ? `\n${echecs} différence(s)` : '\nAucune différence');
