// Essai de bout en bout du bouton « Envoyer mail perso » du panel commercial, avec les données fictives et le serveur
// local des notes (lancé et arrêté par ce script ; le serveur de développement d'Astro, port 4322, lui transmet
// /espace-commercial/notes.php et sert /visuel-carte/). Captures dans out/qa-commercial/ :
//   node tools/qa-mail-perso.mjs [1366]
// Préparer d'abord : python "<coffre>/_systeme/panel.py" publier --local --exemple
// Vérifie : compositeur prérempli (adresse, objet, prénom, activité et couleurs de la carte), aperçu du mail rempli
// comme le coffre, visuel en direct dans l'iframe (changement d'activité sans recharger), note « [MAIL] » chiffrée
// enregistrée sur le serveur et relue par le coffre (mail_perso.py), état « en attente » dans la fiche, annulation.
// Rien n'est envoyé : le coffre n'est pas appelé pour envoyer, seulement pour relire la note.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import {execFileSync, spawn} from 'node:child_process';
import {deriverAcces, lireEnveloppe, ouvrir} from '../src/commercial/crypto.ts';
import {dechiffrerBloc, importerCleNotes} from '../src/commercial/notes-crypto.ts';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const SYSTEME = process.env.COFFRE_SYSTEME ?? 'C:/Users/vaiko/Documents/Loyna Prospection/_systeme';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const NOTES_DIRECT = 'http://127.0.0.1:4330/espace-commercial/notes.php';
const STOCK = 'out/notes-local';
const largeur = Number(process.argv[2]) || 1366;
fs.mkdirSync('out/qa-commercial', {recursive: true});
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
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
if (!donnees.ressources.mail_perso) throw new Error('données publiées sans le modèle du mail perso : relancer test_suivi.py --exporter puis panel.py publier --local --exemple');
const cleNotes = await importerCleNotes(donnees.notes_panel.cle);
const cible = donnees.prospects.find((p) => p.nom === 'Ongles Azur');

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

const browser = await puppeteer.launch({executablePath: EDGE, headless: true, args: ['--disable-gpu']});
const erreurs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.setViewport({width: largeur, height: 900, deviceScaleFactor: 1});
  const capture = async (nom) => {
    await attendre(700);
    await page.screenshot({path: `out/qa-commercial/${nom}.png`});
    console.log(`  ${nom}.png`);
  };
  const cliquer = (texte) => page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)?.click(), texte);
  // champ du compositeur, retrouvé par son libellé
  const taper = async (libelle, texte, effacer = false) => {
    const h = await page.evaluateHandle(
      (l) => [...document.querySelectorAll('dialog[open] label.fld')].find((x) => x.querySelector('.fld-l')?.textContent.trim() === l)?.querySelector('input, textarea, select'),
      libelle,
    );
    if (effacer) await h.evaluate((e) => (e.value = ''));
    await h.type(texte);
  };

  await page.goto(`${BASE}/espace-commercial/`, {waitUntil: 'networkidle0'});
  await page.waitForSelector('input[name=password]');
  await page.type('input[name=username]', acces.identifiant);
  await page.type('input[name=password]', acces.mot_de_passe);
  await page.click('button[type=submit]');
  await page.waitForSelector('.app');

  await page.evaluate((id) => (location.hash = `#/prospect/${id}`), cible.id);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Envoyer mail perso' && !b.disabled), {timeout: 15000, polling: 200});
  await cliquer('Envoyer mail perso');
  await page.waitForSelector('dialog[open] .mp-grille', {timeout: 10000});
  const valeurs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('dialog[open] label.fld')].map((l) => [l.querySelector('.fld-l')?.textContent.trim(), l.querySelector('input, textarea, select')?.value])));
  verifier(valeurs['À'] === cible.email && valeurs['Objet'] === `Suite à notre échange – ${cible.nom}` && valeurs['Prénom de l’interlocuteur'] === (cible.prenom || ''),
    `prérempli : à ${valeurs['À']}, objet, prénom « ${valeurs['Prénom de l’interlocuteur']} »`);
  verifier(valeurs['Activité'] === cible.activite_carte && valeurs['Signataire'] === 'Ewan', `activité de la carte : ${valeurs['Activité']} ; signataire Ewan`);

  await cliquer('Envoyer');
  await attendre(300);
  verifier(await page.evaluate(() => document.querySelector('dialog[open] .cp-notes-err')?.textContent.includes('récapitulatif')), 'récap vide : message clair, rien d’enregistré');

  await taper('Récap de l’appel', 'Vous avez déjà une carte papier, mais vos clientes l’oublient\nVous voulez relancer celles qui ne reviennent plus\nDémarrage souhaité avant les fêtes');
  await page.select('dialog[open] .mp-form > label.fld select', 'premium');
  await taper('Prochaine étape (facultatif)', 'je vous rappelle jeudi en fin de matinée');
  await page.waitForFunction(() => document.querySelector('.mp-corps')?.innerText.includes('Démarrage souhaité avant les fêtes'), {timeout: 5000});
  const corps = await page.evaluate(() => document.querySelector('.mp-corps').innerText);
  verifier(corps.includes(`Bonjour ${cible.prenom},`) && corps.includes('LOYNA Premium, 39,99') && corps.includes('Prochaine étape : je vous rappelle jeudi en fin de matinée.'),
    'aperçu du mail : bonjour, puces, offre et prix, étape');
  // le visuel de l'iframe a bien reçu les réglages (même origine : lecture de son document)
  const visuel = async () => {
    const f = await (await page.$('.mp-visuel iframe')).contentFrame();
    return f.evaluate(() => ({nom: document.querySelector('#vc-nom')?.textContent, sur: document.querySelector('#vc-sur')?.textContent, pret: document.querySelector('#vc')?.dataset.pret,
      amb: getComputedStyle(document.querySelector('#vc')).getPropertyValue('--amb').trim()}));
  };
  await page.waitForFunction(() => document.querySelector('.mp-visuel iframe')?.contentDocument?.querySelector('#vc')?.dataset.pret === '1', {timeout: 15000, polling: 200});
  let v = await visuel();
  verifier(v.nom === cible.nom && v.sur.startsWith(cible.activite_carte) && v.amb === '#fbe4ec', `visuel en direct : ${v.nom}, ${v.sur}, ambiance ${v.amb}`);
  await capture(`mail-perso-compositeur-${largeur}`);

  await page.select('dialog[open] .mp-visuel-reglages select', 'Boulangerie');
  await attendre(500);
  v = await visuel();
  verifier(v.sur.startsWith('Boulangerie') && v.amb === '#f5ead8', 'activité changée : visuel mis à jour sans recharger (postMessage)');
  await page.select('dialog[open] .mp-visuel-reglages select', cible.activite_carte);

  await cliquer('Envoyer');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), {timeout: 15000, polling: 200});
  const notes = await lireNotes(cible.id);
  const n = notes.find((x) => x.texte.startsWith('[MAIL] '));
  verifier(n && n.texte.length < 4000, `note « [MAIL] » chiffrée enregistrée (${n?.texte.length} caractères)`);
  // le coffre relit la note et construit le même mail (mail_perso.py), sans rien envoyer
  const py = JSON.parse(
    execFileSync(PYTHON, ['-B', '-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(SYSTEME)})\nimport mail_perso\nn = json.loads(sys.stdin.read())\nd = mail_perso.lire_demande(n)\no, h, t = mail_perso.construire(mail_perso.COFFRE_DEFAUT, ${JSON.stringify(cible.nom)}, d)\nprint(json.dumps({"d": d, "objet": o}, ensure_ascii=False))`], {
      input: JSON.stringify(n),
      encoding: 'utf8',
      env: {...process.env, PYTHONIOENCODING: 'utf-8'},
    }),
  );
  verifier(py.d.to === cible.email && py.d.offre === 'premium' && py.d.recap.length === 3 && py.d.activite === cible.activite_carte && py.objet === `Suite à notre échange – ${cible.nom}`,
    'le coffre relit la note : adresse, offre, 3 puces, activité, objet');
  await page.waitForFunction(() => document.body.innerText.includes('Mail perso en attente d’envoi'), {timeout: 10000});
  verifier(!(await page.evaluate(() => document.querySelector('.cp-notes-liste')?.innerText.includes('[MAIL]') ?? false)), 'la note [MAIL] n’apparaît pas comme une note libre illisible');
  await page.evaluate(() => document.querySelector('.mp-etats')?.scrollIntoView({block: 'center'}));
  await capture(`mail-perso-fiche-en-attente-${largeur}`);
  await cliquer('Annuler l’envoi');
  await page.waitForFunction(() => !document.body.innerText.includes('Mail perso en attente d’envoi'), {timeout: 10000});
  verifier(!(await lireNotes(cible.id)).some((x) => x.texte.startsWith('[MAIL]')), 'annulation : note retirée du serveur (le mail ne partira pas)');
} finally {
  await browser.close();
  serveur.kill();
}
verifier(!erreurs.length, `aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`);
console.log(ok ? 'TOUT EST BON' : 'DES TESTS ÉCHOUENT');
process.exit(ok ? 0 : 1);
