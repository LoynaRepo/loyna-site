// Gros plan des ronds de couleur (roue des couleurs) sur les 4 pages qui en ont, en haute définition :
// node tools/qa-roue.mjs   (serveur de développement sur le port 4322) → out/qa/roue-*.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = 'http://127.0.0.1:4322';
fs.mkdirSync('out/qa', {recursive: true});
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width: 1280, height: 900, deviceScaleFactor: 3});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// Choisit une couleur libre dans le n-ième sélecteur, comme le ferait le sélecteur du système
async function couleurLibre(selecteur, valeur) {
  await page.evaluate(
    (s, v) => {
      const i = document.querySelector(s);
      i.value = v;
      i.dispatchEvent(new Event('input', {bubbles: true}));
    },
    selecteur,
    valeur,
  );
}
async function gros(nom, selecteur) {
  const el = await page.waitForSelector(selecteur, {visible: true, timeout: 15000});
  await el.evaluate((e) => e.scrollIntoView({block: 'center'}));
  await new Promise((r) => setTimeout(r, 900));
  await el.screenshot({path: `out/qa/roue-${nom}.png`});
  console.log('écrit', `out/qa/roue-${nom}.png`);
}

await page.goto(BASE + '/creer-ma-carte/', {waitUntil: 'networkidle0'});
await couleurLibre('#c-accent', '#2bb3a3');
await gros('configurateur', '#cfg fieldset:has(.swatches[data-target="accent"])');

await page.goto(BASE + '/', {waitUntil: 'networkidle0'});
await couleurLibre('.card-sw .swatches[data-target="bg"] input[type=color]', '#3a7d44');
await gros('accueil', '.card-sw');

await page.goto(BASE + '/merci/', {waitUntil: 'networkidle0'});
await couleurLibre('#el-accent', '#e0457b');
await gros('merci', '#elements-form .row:has(.swatches)');

await page.goto(BASE + '/espace-client/demo/#/reglages', {waitUntil: 'networkidle0'});
await new Promise((r) => setTimeout(r, 2500));
await gros('espace-client', '.swatch-row');

console.log(errors.length ? 'Erreurs : ' + errors.join(' | ') : 'Aucune erreur JavaScript');
await browser.close();
