// Version PDF du guide de démarrage, publiée à côté de la page : Microsoft Edge sans fenêtre imprime
// /espace-client/guide/ en A4 (styles @media print de la page), dans public/espace-client/guide/ et, s'il existe,
// dans dist/ (le site déjà construit part alors avec le nouveau PDF, sans reconstruction).
//
//   npx astro build && npx astro preview        puis, dans un autre terminal :
//   node tools/guide-pdf.mjs http://127.0.0.1:4321
// (le serveur de développement convient aussi : guide.astro pose déjà la typographie française de ses textes)
//
// À refaire après chaque modification du texte ou des captures du guide (le PDF est versionné avec le site).
// Les captures WebP de la page sont remplacées, pour le PDF seulement, par leur version JPEG : le navigateur
// recopie un JPEG tel quel dans le PDF, alors qu'il réenregistre une image WebP sans compression (PDF 4 fois plus lourd).
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = (process.argv[2] ?? 'http://127.0.0.1:4321').replace(/\/$/, '');
const NOM = 'guide-demarrage-loyna.pdf';
const SORTIES = ['public/espace-client/guide', 'dist/espace-client/guide'].map((d) => path.resolve(d));

const browser = await puppeteer.launch({executablePath: EDGE, headless: 'new', args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check']});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`${r.url()} : ${r.failure()?.errorText}`));
await page.goto(`${BASE}/espace-client/guide/`, {waitUntil: 'networkidle0'});
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
});
// Captures en JPEG (fond crème de la page sous les coins arrondis), le temps de l'impression
for (const src of await page.evaluate(() => [...new Set([...document.images].map((i) => i.getAttribute('src')))])) {
  const f = path.resolve('public', src.replace(/^\//, ''));
  if (!src.endsWith('.webp') || !fs.existsSync(f)) continue;
  const jpg = await sharp(f).resize({width: 600}).flatten({background: '#f7f1e6'}).jpeg({quality: 80, mozjpeg: true}).toBuffer(); // ~300 dpi à 50 mm
  await page.evaluate(
    (s, d) =>
      Promise.all(
        [...document.images]
          .filter((i) => i.getAttribute('src') === s)
          .map((i) => new Promise((r) => ((i.onload = i.onerror = r), (i.src = d)))),
      ),
    src,
    `data:image/jpeg;base64,${jpg.toString('base64')}`,
  );
}
const vides = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
if (vides.length) throw new Error(`Captures non chargées : ${vides.join(', ')}`);
const pdf = await page.pdf({preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: true});
await browser.close();

const pages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
for (const d of SORTIES) {
  if (!fs.existsSync(path.dirname(d))) continue; // dist/ absent : site pas encore construit
  fs.mkdirSync(d, {recursive: true});
  fs.writeFileSync(path.join(d, NOM), pdf);
  console.log(`${path.relative(process.cwd(), path.join(d, NOM))}  ${pages} page(s)  ${Math.round(pdf.length / 1024)} Ko`);
}
if (pages < 2 || pages > 4) console.log(`ATTENTION : ${pages} pages (2 à 4 attendues).`);
if (errors.length) console.log('Erreurs :\n' + errors.join('\n'));
