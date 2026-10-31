// « Préparer une carte » de bout en bout (panel commercial → lien → panier), sur le serveur de développement (port 4322) :
// données fictives d'abord (python "<coffre>/_systeme/panel.py" publier --local --exemple), serveur local des cartes lancé ici.
//   node tools/qa-preparer.mjs [largeur…]    captures dans out/qa-preparer/
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import {spawn} from 'node:child_process';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const LOGO = process.env.QA_LOGO ?? 'C:/Users/vaiko/Documents/LOYNA-Motion/hyperframes/la-fusion/assets/logo-light.png';
const SORTIE = 'out/qa-preparer';
const largeurs = process.argv.slice(2).map(Number).filter(Boolean);
if (!largeurs.length) largeurs.push(1440, 390);
fs.mkdirSync(SORTIE, {recursive: true});
const acces = JSON.parse(fs.readFileSync('tools/commercial/acces-local.exemple.json', 'utf8'));
const serveur = spawn('python', ['tools/commercial/notes_local.py', '--port', '4330'], {stdio: 'ignore'});
await new Promise((r) => setTimeout(r, 1200));
const navigateur = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--no-sandbox']});
let echecs = 0;
const verifie = (nom, ok) => {
  console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${nom}`);
  if (!ok) echecs++;
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (const largeur of largeurs) {
    const page = await navigateur.newPage();
    const erreurs = [];
    const reponses = [];
    page.on('response', (r) => r.url().includes('cartes.php') && reponses.push(`${r.request().method()}:${r.status()}`));
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.setViewport({width: largeur, height: largeur < 700 ? 844 : 900});
    await page.goto(`${BASE}/espace-commercial/#/preparer`, {waitUntil: 'networkidle2'});
    await page.waitForSelector('input[name=username]');
    await page.type('input[name=username]', acces.identifiant);
    await page.type('input[name=password]', acces.mot_de_passe);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.pc-grille', {timeout: 30000});
    const saisir = async (etiquette, valeur) => {
      const h = await page.evaluateHandle((e) => [...document.querySelectorAll('.fld')].find((f) => f.querySelector('.fld-l')?.textContent === e)?.querySelector('input'), etiquette);
      await h.focus(); // pas de clic : sur téléphone, la barre du bas peut recouvrir le champ
      await h.evaluate((i) => i.select());
      await h.type(valeur);
    };
    await saisir('Nom du commerce', 'La Fusion');
    await saisir('Activité', 'Restaurant');
    verifie('activité connue : récompense proposée', (await page.$eval('input[placeholder^="Dessert"]', (i) => i.value)).length > 0);
    await saisir('Récompense', 'Dessert offert');
    await saisir('Passages pour la récompense', '8');
    const fichier = await page.$('.pc-logo input[type=file]');
    await fichier.uploadFile(LOGO);
    await page.waitForSelector('.pc-logo-v img', {timeout: 10000}).catch(async (e) => {
      await page.screenshot({path: `${SORTIE}/echec-logo-${largeur}.png`, fullPage: true});
      console.log('Logo :', await page.$eval('.pc-logo + .fld-err', (x) => x.textContent).catch(() => '(aucun message)'), '| erreurs :', erreurs.join(' | '));
      throw e;
    });
    verifie('logo : couleurs proposées', (await page.$$('.pc-pastille--logo')).length > 0);
    await page.$$eval('.pc-hex', ([a, b]) => {
      const poser = (i, v) => {
        i.value = v;
        i.dispatchEvent(new Event('input', {bubbles: true}));
      };
      poser(a, '#0d131a');
      poser(b, '#e9a03d');
    });
    await page.evaluate(() => [...document.querySelectorAll('.pc-offre')].find((b) => b.textContent.includes('Starter')).click());
    await page.evaluate(() => [...document.querySelectorAll('.pc-pas button')][1].click());
    await dormir(300);
    const recap = await page.$eval('.pc-total dd', (e) => e.textContent);
    verifie(`récapitulatif : 29 € + 1 QR à 9,99 € (${recap})`, /38,99/.test(recap));
    verifie('aperçu : carte au nom du commerce', (await page.$eval('.cw-a-n', (e) => e.textContent)) === 'La Fusion');
    await page.screenshot({path: `${SORTIE}/panel-${largeur}.png`, fullPage: true});
    await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0].click());
    await page.waitForSelector('.pc-lien a', {timeout: 15000}).catch(async (e) => {
      await page.screenshot({path: `${SORTIE}/echec-${largeur}.png`, fullPage: true});
      console.log('Message du panel :', await page.$eval('.pc-form .form-err', (x) => x.textContent).catch(() => '(aucun)'), '| adresse :', page.url(), '| erreurs :', erreurs.join(' | '));
      throw e;
    });
    const lien = await page.$eval('.pc-lien a', (a) => a.href);
    verifie(`lien créé (${lien})`, /\/panier\/\?carte=[a-z0-9]{16}$/.test(lien));
    await page.waitForSelector('.pc-liste li', {timeout: 5000}).catch(() => {});
    if (!(await page.$('.pc-liste li'))) console.log('Réponses cartes.php :', reponses.join(' '));
    verifie('carte listée', (await page.$$('.pc-liste li')).length > 0);
    await page.screenshot({path: `${SORTIE}/panel-lien-${largeur}.png`, fullPage: true});

    const client = await navigateur.createBrowserContext();
    const p2 = await client.newPage();
    p2.on('pageerror', (e) => erreurs.push(e.message));
    await p2.setViewport({width: largeur, height: largeur < 700 ? 844 : 900});
    await p2.goto(lien.replace(/^https?:\/\/[^/]+/, BASE), {waitUntil: 'networkidle2'});
    await p2.waitForSelector('.pn-prep', {timeout: 20000});
    verifie('panier : carte préparée', (await p2.$eval('#pn-prep-t', (e) => e.textContent)).includes('La Fusion'));
    verifie('panier : logo affiché', !!(await p2.$('.pn-prep .cw-logo img')));
    verifie('panier : étapes offre et QR repliées', !(await p2.$('input[name=offre]')));
    const texte = await p2.$eval('.pn-sum', (e) => e.textContent);
    verifie('panier : Starter et 1 QR dans le récapitulatif', /Starter/.test(texte) && /1 × QR code/.test(texte) && /38,99/.test(texte));
    verifie('panier : nom du commerce prérempli', (await p2.$eval('#pn-business_name', (i) => i.value)) === 'La Fusion');
    verifie('panier : réglages gardés pour /merci/', await p2.evaluate(() => !!JSON.parse(localStorage.getItem('loyna-config')).preparee));
    verifie('panier : pas de débordement horizontal', await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p2.screenshot({path: `${SORTIE}/panier-${largeur}.png`, fullPage: true});
    await p2.evaluate(() => [...document.querySelectorAll('.pn-prep .pn-link')][0].click());
    await dormir(200);
    verifie('panier : « changer d’offre » rouvre les étapes', !!(await p2.$('input[name=offre]')));
    await p2.goto(`${BASE}/merci/?offre=starter-mensuel&compte=1`, {waitUntil: 'networkidle2'});
    await p2.waitForSelector('#preparee:not([hidden])', {timeout: 8000});
    verifie('/merci/ : carte déjà préparée, formulaire masqué', await p2.$eval('#elements-form', (f) => f.hidden));
    await p2.screenshot({path: `${SORTIE}/merci-${largeur}.png`});
    await client.close();
    verifie(`aucune erreur JavaScript (${erreurs.join(' | ')})`, !erreurs.length);
    await page.close();
  }
} finally {
  await navigateur.close();
  serveur.kill();
}
console.log(echecs ? `${echecs} échec(s)` : 'Tout est bon');
process.exit(echecs ? 1 : 0);
