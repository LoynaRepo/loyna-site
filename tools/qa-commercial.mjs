// Captures du panel commercial (serveur de développement sur le port 4322, données chiffrées locales) :
//   node tools/qa-commercial.mjs 390 [1366 …]        captures pleine page dans out/qa-commercial/
// Préparer d'abord les données fictives : python "<coffre>/_systeme/panel.py" publier --local --exemple
// Connexion avec les identifiants de TEST (tools/commercial/acces-local.exemple.json, localhost uniquement).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const URL_PANEL = `${BASE}/espace-commercial/`;
const SUFFIXE = process.env.QA_SUFFIX ?? '';
const acces = JSON.parse(fs.readFileSync(new URL('./commercial/acces-local.exemple.json', import.meta.url), 'utf8'));
const largeurs = process.argv.slice(2).map(Number).filter(Boolean);
if (!largeurs.length) largeurs.push(390, 1366);
fs.mkdirSync('out/qa-commercial', {recursive: true});
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const erreurs = [];
for (const largeur of largeurs) {
  const mobile = largeur < 700;
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && erreurs.push(`${largeur}px : ${m.text()}`));
  page.on('pageerror', (e) => erreurs.push(`${largeur}px : ${e}`));
  await page.setViewport({width: largeur, height: mobile ? 844 : 860, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
  const capture = async (nom) => {
    await attendre(500);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({path: `out/qa-commercial/${nom}_${largeur}${SUFFIXE}.png`, fullPage: true});
    console.log(`${nom}_${largeur}${SUFFIXE}.png${debord > 0 ? `  DÉBORDEMENT HORIZONTAL ${debord}px` : ''}`);
  };

  // 1. écran de connexion, puis identifiants faux, puis connexion
  await page.goto(URL_PANEL, {waitUntil: 'networkidle0'});
  await page.waitForSelector('input[name=password]');
  await capture('connexion');
  await page.type('input[name=username]', acces.identifiant);
  await page.type('input[name=password]', 'mot-de-passe-faux');
  await page.click('button[type=submit]');
  await page.waitForSelector('.form-err', {timeout: 15000});
  console.log('  identifiants faux :', await page.$eval('.form-err', (e) => e.textContent.trim()));
  await capture('connexion-erreur');
  await page.$eval('input[name=password]', (e) => (e.value = ''));
  await page.click('input[name=password]', {clickCount: 3});
  await page.keyboard.press('Backspace');
  await page.type('input[name=password]', acces.mot_de_passe);
  await page.click('button[type=submit]');
  await page.waitForSelector('.app', {timeout: 15000});

  // 2. onglets
  for (const vue of ['tableau', 'prospects', 'appeler', 'tarifs', 'questions', 'aide']) {
    await page.evaluate((v) => (location.hash = `#/${v}`), vue);
    await attendre(300);
    await capture(vue);
  }
  // 3. fiche d'un prospect (le premier de la liste « À appeler »)
  await page.evaluate(() => (location.hash = '#/appeler'));
  await attendre(300);
  const lien = await page.$eval('.cp-appel-nom', (a) => a.getAttribute('href'));
  await page.evaluate((h) => (location.hash = h), lien);
  await capture('fiche');
  // 4. filtres de la liste (téléphone : panneau ouvert)
  await page.evaluate(() => (location.hash = '#/prospects'));
  await attendre(300);
  if (mobile) {
    await page.click('.cp-filtres-btn');
    await capture('prospects-filtres');
  }
  // 5. verrouillage : retour à l'écran de connexion, données effacées de la page
  if (mobile) {
    await page.click('.tabbar button[aria-expanded]'); // « Plus », puis « Verrouiller le panel »
    await attendre(300);
    await capture('menu-plus');
    await page.evaluate(() => [...document.querySelectorAll('.sheet button')].find((b) => /Verrouiller/.test(b.textContent))?.click());
  } else {
    await page.click('.side-out');
  }
  await page.waitForSelector('input[name=password]', {timeout: 5000});
  const reste = await page.evaluate(() => document.body.innerText.includes('À appeler') && !!document.querySelector('.app'));
  console.log('  verrouillage :', reste ? 'ÉCHEC (le panel est encore affiché)' : 'ok');
  await page.close();
}
if (erreurs.length) console.log('Erreurs console :\n' + erreurs.join('\n'));
await browser.close();
