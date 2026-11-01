// Captures du panel commercial (serveur de développement sur le port 4322, données chiffrées locales) :
//   node tools/qa-commercial.mjs 390 [1366 …]        captures pleine page dans out/qa-commercial/
// Préparer d'abord les données fictives : python "<coffre>/_systeme/panel.py" publier --local --exemple
// Connexion avec les identifiants de TEST (tools/commercial/acces-local.exemple.json, localhost uniquement).
// QA_BASE : autre adresse du site ; QA_DONNEES : autre jeu de données chiffré (avec des clients : fiches capturées aussi).
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
// QA_DONNEES : autre fichier chiffré (identifiants de test), servi à la page à la place de public/espace-commercial/donnees.enc
async function servirDonnees(page) {
  if (!process.env.QA_DONNEES) return;
  const contenu = fs.readFileSync(process.env.QA_DONNEES);
  await page.setRequestInterception(true);
  page.on('request', (r) => (new URL(r.url()).pathname === '/espace-commercial/donnees.enc' ? r.respond({status: 200, contentType: 'application/octet-stream', body: contenu}) : r.continue()));
}

const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const erreurs = [];
for (const largeur of largeurs) {
  const mobile = largeur < 700;
  const page = await browser.newPage();
  await servirDonnees(page);
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
  for (const vue of ['tableau', 'prospects', 'appeler', 'preparer', 'clients', 'tarifs', 'questions', 'aide']) {
    await page.evaluate((v) => (location.hash = `#/${v}`), vue);
    await attendre(300);
    await capture(vue);
  }
  // Tarifs : 2 offres, 2 prix par offre, 4 liens de secours
  await page.evaluate(() => (location.hash = '#/tarifs'));
  await attendre(300);
  const tarifs = await page.evaluate(() => ({
    offres: document.querySelectorAll('.cp-plan').length,
    liens: document.querySelectorAll('.cp-liens-paiement .cp-lien-row').length,
    prix: [...document.querySelectorAll('.cp-prix b')].map((b) => b.textContent.replace(/\s/g, ' ')).join(' · '),
  }));
  const tarifsOk = tarifs.offres === 2 && tarifs.liens === 4 && tarifs.prix === '29 € · 24,65 € · 49 € · 41,65 €';
  console.log(`  tarifs : ${tarifsOk ? 'ok' : 'ÉCHEC'} (${tarifs.offres} offres, ${tarifs.liens} liens de secours, ${tarifs.prix})`);
  if (!tarifsOk) erreurs.push(`${largeur}px : tarifs inattendus`);
  // 3. fiche d'un prospect (le premier de la liste « À appeler »)
  await page.evaluate(() => (location.hash = '#/appeler'));
  await attendre(300);
  const lien = await page.$eval('.cp-appel-nom', (a) => a.getAttribute('href'));
  await page.evaluate((h) => (location.hash = h), lien);
  await capture('fiche');
  // fiches des clients, s'il y en a : chaque état (essai, carte suspendue, Pro, offre historique…)
  await page.evaluate(() => (location.hash = '#/clients'));
  await attendre(300);
  const clients = await page.$$eval('a[href^="#/client/"]', (l) => [...new Set(l.map((a) => [a.getAttribute('href'), a.textContent.trim()].join('|')))]);
  for (const c of clients) {
    const [href, nom] = c.split('|');
    await page.evaluate((h) => (location.hash = h), href);
    await capture(`client-${nom.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-')}`);
  }
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
