// Essai de bout en bout des notes du panel commercial, avec les données fictives et le serveur local des notes
// (tools/commercial/notes_local.py, lancé et arrêté par ce script ; le serveur de développement d'Astro, port 4322,
// lui transmet /espace-commercial/notes.php). Captures dans out/qa-commercial/ :
//   node tools/qa-notes.mjs 390 1366
// Préparer d'abord : python "<coffre>/_systeme/panel.py" publier --local --exemple
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {deriverAcces, lireEnveloppe, ouvrir} from '../src/commercial/crypto.ts';
import {chiffrerBloc, dechiffrerBloc, importerCleNotes} from '../src/commercial/notes-crypto.ts';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const NOTES_DIRECT = 'http://127.0.0.1:4330/espace-commercial/notes.php'; // « autre appareil » : sans passer par la page
const STOCK = 'out/notes-local';
const largeurs = process.argv.slice(2).map(Number).filter(Boolean);
if (!largeurs.length) largeurs.push(390, 1366);
fs.mkdirSync('out/qa-commercial', {recursive: true});
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const verifier = (cond, message) => {
  console.log((cond ? '  OK    ' : '  ÉCHEC ') + message);
  ok &&= !!cond;
};

// accès de test : jeton dérivé du donnees.enc local, clé des notes de test
const acces = JSON.parse(fs.readFileSync('tools/commercial/acces-local.exemple.json', 'utf8'));
const env = lireEnveloppe(fs.readFileSync('public/espace-commercial/donnees.enc', 'utf8'));
const a = await deriverAcces(acces.identifiant, acces.mot_de_passe, env);
const donnees = await ouvrir(env, a.cle);
if (!donnees.exemple) throw new Error('public/espace-commercial/donnees.enc doit contenir le jeu fictif (panel.py publier --local --exemple)');
const cleNotes = await importerCleNotes(donnees.notes_panel.cle);
const cible = donnees.prospects.find((p) => p.nom === 'Maison Lumière');
const appel = donnees.prospects.find((p) => p.appel?.rang === 1);

async function api(methode, corps) {
  const r = await fetch(NOTES_DIRECT, {method: methode, headers: {'X-Panel-Jeton': a.jeton, 'Content-Type': 'application/json'}, body: corps ? JSON.stringify(corps) : undefined});
  return {statut: r.status, corps: await r.json()};
}
async function ecrireNotes(prospect, notes) {
  const {corps} = await api('GET');
  const actuel = corps.blocs[prospect];
  const bloc = await chiffrerBloc(cleNotes, prospect, notes);
  return api('POST', {prospect, ...bloc, modifie_le_precedent: actuel?.modifie_le ?? null});
}
async function lireNotes(prospect) {
  const {corps} = await api('GET');
  return corps.blocs[prospect] ? dechiffrerBloc(cleNotes, prospect, corps.blocs[prospect]) : [];
}
function remiseAZero() {
  for (const f of ['notes.json', 'essais.json']) fs.rmSync(`${STOCK}/${f}`, {force: true});
  fs.rmSync(`${STOCK}/sauvegardes`, {recursive: true, force: true});
}
async function semer() {
  remiseAZero();
  const r1 = await ecrireNotes(cible.id, cible.notes ?? []);
  const r2 = await ecrireNotes(appel.id, [{id: 'e5e5e5e5e5e5e5e5', cree_le: '2026-10-23T07:50:00.000Z', modifie_le: '2026-10-23T07:50:00.000Z', texte: 'Ouvre à 9 h 30 : appeler en fin de matinée.'}]);
  if (r1.statut !== 200 || r2.statut !== 200) throw new Error(`semis des notes impossible (${r1.statut}, ${r2.statut})`);
}

// serveur local des notes
if (!fs.existsSync(`${STOCK}/jeton.sha256`)) throw new Error(`${STOCK}/jeton.sha256 absent : lancer panel.py publier --local --exemple`);
const serveur = spawn(PYTHON, ['-B', 'tools/commercial/notes_local.py', '--port', '4330', '--dossier', STOCK], {stdio: ['ignore', 'pipe', 'pipe']});
await new Promise((resolve, reject) => {
  serveur.stdout.on('data', (d) => String(d).includes('Notes locales') && resolve());
  serveur.on('exit', (c) => reject(new Error(`serveur local des notes arrêté (${c})`)));
});

const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const erreurs = [];
try {
  for (const largeur of largeurs) {
    console.log(`— ${largeur} px`);
    await semer();
    const mobile = largeur < 700;
    const page = await browser.newPage();
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && erreurs.push(`${largeur}px : ${m.text()}`));
    page.on('pageerror', (e) => erreurs.push(`${largeur}px : ${e}`));
    await page.setViewport({width: largeur, height: mobile ? 844 : 900, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
    let coupure = false;
    await page.setRequestInterception(true);
    page.on('request', (req) => (coupure && req.url().includes('notes.php') && req.method() === 'POST' ? req.abort('failed') : req.continue()));
    const capture = async (nom, plein = true) => {
      await attendre(400);
      await page.screenshot({path: `out/qa-commercial/${nom}_${largeur}.png`, fullPage: plein});
      console.log(`  ${nom}_${largeur}.png`);
    };

    await page.goto(`${BASE}/espace-commercial/`, {waitUntil: 'networkidle0'});
    await page.waitForSelector('input[name=password]');
    await page.type('input[name=username]', acces.identifiant);
    await page.type('input[name=password]', acces.mot_de_passe);
    await page.click('button[type=submit]');
    await page.waitForSelector('.app');

    // 1. fiche avec ses notes (la plus récente en haut)
    await page.evaluate((id) => (location.hash = `#/prospect/${id}`), cible.id);
    await page.waitForSelector('.cp-note');
    const dates = await page.$$eval('.cp-note time', (t) => t.map((x) => x.getAttribute('datetime')));
    verifier(dates.length === 2 && dates[0] > dates[1], 'fiche : 2 notes, la plus récente en haut');
    await capture('notes-fiche');

    // 2. ajout au clavier (Ctrl+Entrée)
    const zone = `#note-${cible.id}`;
    await page.type(zone, 'Rappelée ce matin : rendez-vous proposé jeudi à 10 h, elle confirme par mail.');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await page.waitForFunction(() => document.querySelectorAll('.cp-note').length === 3, {timeout: 10000});
    verifier((await page.$eval(zone, (t) => t.value)) === '', 'ajout : zone vidée, note en tête de liste');
    verifier((await lireNotes(cible.id)).some((n) => n.texte.startsWith('Rappelée ce matin')), 'ajout : note chiffrée enregistrée sur le serveur');
    await capture('notes-ajout');

    // 3. erreur réseau : le texte reste, message et « Réessayer »
    coupure = true;
    const texteCoupure = 'Note tapée pendant une coupure de réseau.';
    await page.type(zone, texteCoupure);
    await page.click('.cp-notes-ajout button[type=submit]');
    await page.waitForSelector('.cp-notes-err', {timeout: 10000});
    verifier((await page.$eval(zone, (t) => t.value)) === texteCoupure, 'erreur réseau : texte conservé dans la zone');
    await page.evaluate(() => document.querySelector('.cp-notes-err')?.scrollIntoView({block: 'center'}));
    await capture('notes-erreur', false);
    coupure = false;
    await page.evaluate(() => [...document.querySelectorAll('.cp-notes-err button')].find((b) => /Réessayer/.test(b.textContent))?.click());
    await page.waitForFunction(() => document.querySelectorAll('.cp-note').length === 4 && !document.querySelector('.cp-notes-err'), {timeout: 10000});
    verifier((await lireNotes(cible.id)).filter((n) => n.texte === texteCoupure).length === 1, 'Réessayer : note enregistrée une seule fois');

    // 4. conflit : la note est modifiée sur un « autre appareil » pendant la modification
    const premiere = await page.$eval('.cp-note', (li) => li.querySelector('time').getAttribute('datetime'));
    await page.evaluate(() => [...document.querySelectorAll('.cp-note button')].find((b) => /Modifier/.test(b.title || b.textContent))?.click());
    await page.waitForSelector('.cp-note.is-active textarea');
    await page.$eval('.cp-note.is-active textarea', (t) => {
      t.value = '';
    });
    await page.type('.cp-note.is-active textarea', 'Ma version : RDV confirmé jeudi 10 h.');
    const serveur = await lireNotes(cible.id);
    const autre = serveur.map((n) => (n.cree_le === premiere ? {...n, texte: 'Version de l’autre appareil : RDV déplacé à vendredi.', modifie_le: new Date().toISOString()} : n));
    verifier((await ecrireNotes(cible.id, autre)).statut === 200, 'autre appareil : note modifiée sur le serveur');
    await page.evaluate(() => [...document.querySelectorAll('.cp-note.is-active button')].find((b) => /Enregistrer/.test(b.textContent))?.click());
    await page.waitForSelector('.cp-conflit', {timeout: 10000});
    verifier((await page.$eval('.cp-conflit', (c) => c.textContent)).includes('Version de l’autre appareil'), 'conflit : les deux versions proposées');
    await page.evaluate(() => document.querySelector('.cp-conflit')?.scrollIntoView({block: 'center'}));
    await capture('notes-conflit', false);
    await page.evaluate(() => [...document.querySelectorAll('.cp-conflit button')].find((b) => /Garder ma version/.test(b.textContent))?.click());
    await page.waitForFunction(() => !document.querySelector('.cp-conflit') && !document.querySelector('.cp-note.is-active'), {timeout: 10000});
    verifier((await lireNotes(cible.id)).some((n) => n.texte === 'Ma version : RDV confirmé jeudi 10 h.'), 'conflit résolu : ma version enregistrée');

    // 5. ajout pendant qu'un autre appareil ajoute : fusion automatique, aucune note perdue
    const ailleurs = [...(await lireNotes(cible.id)), {id: 'f6f6f6f6f6f6f6f6', cree_le: new Date().toISOString(), modifie_le: new Date().toISOString(), texte: 'Ajoutée sur un autre appareil.'}];
    await ecrireNotes(cible.id, ailleurs);
    await page.type(zone, 'Ajoutée ici en même temps.');
    await page.click('.cp-notes-ajout button[type=submit]');
    await page.waitForFunction(() => [...document.querySelectorAll('.cp-note-t')].some((p) => p.textContent.includes('Ajoutée ici')), {timeout: 10000});
    const finales = await lireNotes(cible.id);
    verifier(finales.some((n) => n.texte === 'Ajoutée sur un autre appareil.') && finales.some((n) => n.texte === 'Ajoutée ici en même temps.'), 'ajouts simultanés : fusion automatique, les deux notes gardées');

    // 6. suppression confirmée dans l'interface (pas de window.confirm)
    page.on('dialog', () => verifier(false, 'aucune boîte de dialogue du navigateur'));
    const avant = (await lireNotes(cible.id)).length;
    await page.evaluate(() => [...document.querySelectorAll('.cp-note button')].find((b) => /Supprimer/.test(b.title || b.textContent))?.click());
    await page.waitForSelector('.cp-confirm');
    await page.evaluate(() => document.querySelector('.cp-confirm')?.scrollIntoView({block: 'center'}));
    await capture('notes-suppression', false);
    await page.evaluate(() => [...document.querySelectorAll('.cp-confirm button')].find((b) => /^Supprimer$/.test(b.textContent.trim()))?.click());
    await page.waitForFunction((n) => document.querySelectorAll('.cp-note').length === n, {timeout: 10000}, avant - 1);
    verifier((await lireNotes(cible.id)).length === avant - 1, 'suppression : note retirée du serveur');

    // 7. bouton « Note » d'une carte « À appeler »
    await page.evaluate(() => (location.hash = '#/appeler'));
    await page.waitForSelector('.cp-appel-carte');
    await page.evaluate(() => [...document.querySelectorAll('.cp-appel-carte button')].find((b) => /^Note/.test(b.textContent.trim()))?.click());
    await page.waitForSelector('dialog[open] .cp-notes');
    verifier(await page.$eval('dialog[open] textarea', (t) => t === document.activeElement), 'À appeler : la zone de note s’ouvre, prête à écrire');
    await capture('notes-appeler', false);
    await page.keyboard.press('Escape');

    // 8. marques « n notes » et recherche dans le texte des notes
    await page.evaluate(() => (location.hash = '#/prospects'));
    await page.waitForSelector('.cp-marque-notes');
    verifier((await page.$$('.cp-marque-notes')).length >= 2, 'liste : marques « n notes »');
    await page.type('input[type=search]', 'vendredi');
    await attendre(400);
    const compte = await page.$eval('.ph-count', (e) => e.textContent);
    await page.$eval('input[type=search]', (i) => {
      i.value = '';
      i.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await page.type('input[type=search]', 'confirmé jeudi');
    await attendre(400);
    verifier((await page.$eval('.ph-count', (e) => e.textContent)).startsWith('1 sur'), `recherche dans les notes : « confirmé jeudi » → ${await page.$eval('.ph-count', (e) => e.textContent)} (avant : ${compte})`);
    await capture('notes-liste');
    await page.close();
  }
} finally {
  await browser.close();
  serveur.kill();
}
if (erreurs.length) console.log('Erreurs console :\n' + erreurs.join('\n'));
console.log(ok && !erreurs.length ? 'TOUT EST BON' : 'DES CONTRÔLES ÉCHOUENT');
process.exit(ok && !erreurs.length ? 0 : 1);
