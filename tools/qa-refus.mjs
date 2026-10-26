// Essai de bout en bout du bouton « Supprimer le prospect (a refusé) » du panel commercial, avec les données fictives
// et le serveur local des notes (lancé et arrêté par ce script ; le serveur de développement d'Astro, port 4322,
// lui transmet /espace-commercial/notes.php). Captures dans out/qa-commercial/ :
//   node tools/qa-refus.mjs
// Préparer d'abord : python "<coffre>/_systeme/panel.py" publier --local --exemple
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {deriverAcces, lireEnveloppe, ouvrir} from '../src/commercial/crypto.ts';
import {dechiffrerBloc, importerCleNotes} from '../src/commercial/notes-crypto.ts';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const NOTES_DIRECT = 'http://127.0.0.1:4330/espace-commercial/notes.php';
const STOCK = 'out/notes-local';
fs.mkdirSync('out/qa-commercial', {recursive: true});
let ok = true;
const verifier = (cond, message) => {
  console.log((cond ? '  OK    ' : '  ÉCHEC ') + message);
  ok &&= !!cond;
};

const acces = JSON.parse(fs.readFileSync('tools/commercial/acces-local.exemple.json', 'utf8'));
const env = lireEnveloppe(fs.readFileSync('public/espace-commercial/donnees.enc', 'utf8'));
const a = await deriverAcces(acces.identifiant, acces.mot_de_passe, env);
const donnees = await ouvrir(env, a.cle);
if (!donnees.exemple) throw new Error('public/espace-commercial/donnees.enc doit contenir le jeu fictif (panel.py publier --local --exemple)');
const cleNotes = await importerCleNotes(donnees.notes_panel.cle);
const cible = donnees.prospects.find((p) => p.nom === 'Maison Lumière');

async function lireNotes(prospect) {
  const r = await fetch(NOTES_DIRECT, {headers: {'X-Panel-Jeton': a.jeton}});
  const corps = await r.json();
  return corps.blocs[prospect] ? dechiffrerBloc(cleNotes, prospect, corps.blocs[prospect]) : [];
}

for (const f of ['notes.json', 'essais.json']) fs.rmSync(`${STOCK}/${f}`, {force: true});
const serveur = spawn(PYTHON, ['-B', 'tools/commercial/notes_local.py', '--port', '4330', '--dossier', STOCK], {stdio: ['ignore', 'pipe', 'pipe']});
await new Promise((resolve, reject) => {
  serveur.stdout.on('data', (d) => String(d).includes('Notes locales') && resolve());
  serveur.on('exit', (c) => reject(new Error(`serveur local des notes arrêté (${c})`)));
});

const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const erreurs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.setViewport({width: 1366, height: 900, deviceScaleFactor: 1});
  const capture = async (nom) => {
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({path: `out/qa-commercial/${nom}.png`});
    console.log(`  ${nom}.png`);
  };
  const cliquer = (texte) => page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), texte);
  const dansListe = async () => {
    await page.evaluate(() => (location.hash = '#/prospects'));
    await new Promise((r) => setTimeout(r, 600));
    return page.evaluate((nom) => [...document.querySelectorAll('.cp-carte, tbody tr')].some((x) => x.innerText.includes(nom)), cible.nom);
  };

  await page.goto(`${BASE}/espace-commercial/`, {waitUntil: 'networkidle0'});
  await page.waitForSelector('input[name=password]');
  await page.type('input[name=username]', acces.identifiant);
  await page.type('input[name=password]', acces.mot_de_passe);
  await page.click('button[type=submit]');
  await page.waitForSelector('.app');
  verifier(await dansListe(), 'avant : le prospect est dans la liste');

  await page.evaluate((id) => (location.hash = `#/prospect/${id}`), cible.id);
  await page.waitForFunction(() => document.body.innerText.includes('Il a refusé ?'));
  // le bouton n'est actif qu'une fois les notes chargées
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Supprimer le prospect (a refusé)') && !b.disabled), {timeout: 15000, polling: 200});
  await cliquer('Supprimer le prospect (a refusé)');
  await page.waitForSelector(`#refus-${cible.id}`);
  await page.waitForSelector('dialog[open]', {timeout: 10000});
  await page.type(`#refus-${cible.id}`, 'Déjà équipée chez un concurrent.');
  await capture('refus-fenetre');
  const boutons = await page.$$('dialog[open] button');
  let confirme = false;
  for (const h of boutons) if ((await h.evaluate((b) => b.textContent.trim())) === 'Supprimer le prospect') {
    await h.click();
    confirme = true;
  }
  verifier(confirme, 'fenêtre de confirmation ouverte, bouton « Supprimer le prospect » cliqué');
  try {
    await page.waitForFunction(() => location.hash === '#/prospects', {timeout: 15000, polling: 200});
  } catch (e) {
    console.log('  dialogue :', await page.evaluate(() => [document.querySelector('dialog')?.open, location.hash, document.body.innerText.includes('Refus noté'), document.querySelector('.cp-notes-err')?.innerText, document.querySelector('#refus-' + CSS.escape(location.hash.split('/')[2] || ''))?.value]), (await lireNotes(cible.id)).map((n) => n.texte));
    throw e;
  }
  const notes = await lireNotes(cible.id);
  verifier(notes.some((n) => n.texte === '[REFUS] Déjà équipée chez un concurrent.'), 'note de refus chiffrée enregistrée sur le serveur');
  verifier(!(await dansListe()), 'après : le prospect a disparu de la liste');
  await capture('refus-liste');

  await page.evaluate((id) => (location.hash = `#/prospect/${id}`), cible.id);
  await page.waitForFunction(() => document.body.innerText.includes('Refus noté'));
  await capture('refus-fiche');
  await cliquer('Annuler la suppression');
  await page.waitForFunction(() => document.body.innerText.includes('Supprimer le prospect (a refusé)'), {timeout: 10000});
  verifier(!(await lireNotes(cible.id)).some((n) => n.texte.startsWith('[REFUS]')), 'annulation : note de refus retirée du serveur');
  verifier(await dansListe(), 'annulation : le prospect revient dans la liste');
} finally {
  await browser.close();
  serveur.kill();
}
verifier(!erreurs.length, `aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`);
console.log(ok ? 'TOUT EST BON' : 'DES TESTS ÉCHOUENT');
process.exit(ok ? 0 : 1);
