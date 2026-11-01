// « Préparer une carte » de bout en bout (panel commercial → 2 liens → panier et essai), sur le serveur de développement (port 4322) :
// données fictives d'abord (python "<coffre>/_systeme/panel.py" publier --local --exemple), serveur local des cartes lancé ici.
//   node tools/qa-preparer.mjs [largeur…]    captures dans out/qa-preparer/
// Rien n'est soumis sur /essai/ ni sur le panier : pas de compte, pas de paiement ; `GET trial` est simulé ici, sans réseau. QA_BASE :
// autre adresse du site ; QA_DONNEES : autre jeu de données chiffré. TRIAL.open faux (src/data/site.ts) : seul le paiement est attendu.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import qrcode from 'qrcode-generator';
import {TRIAL} from '../src/data/site.ts';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PYTHON = process.env.PYTHON ?? 'C:/Users/vaiko/AppData/Local/Programs/Python/Python313/python.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const LOGO = process.env.QA_LOGO ?? 'C:/Users/vaiko/Documents/LOYNA-Motion/hyperframes/la-fusion/assets/logo-light.png';
const SORTIE = 'out/qa-preparer';
const STOCK = 'out/notes-local';
const ANCIENNE = '19k93n5985n294gn'; // même identifiant que la fiche de La Fusion en ligne : offre premium, periode mensuel
const largeurs = process.argv.slice(2).map(Number).filter(Boolean);
if (!largeurs.length) largeurs.push(1440, 390);
fs.mkdirSync(SORTIE, {recursive: true});
const acces = JSON.parse(fs.readFileSync('tools/commercial/acces-local.exemple.json', 'utf8'));
// Ancienne fiche, telle qu'écrite avant la grille Starter + Pro : le serveur la garde et le panel doit toujours l'ouvrir
fs.mkdirSync(`${STOCK}/cartes`, {recursive: true});
fs.writeFileSync(
  `${STOCK}/cartes/${ANCIENNE}.json`,
  JSON.stringify({nom: 'Ancienne Fiche', activite: 'Restaurant', recompense: 'Dessert offert', fond: '#0d131a', tampons: '#e9a03d', passages: 8, offre: 'premium', periode: 'mensuel', qr: {unit: 0, pack5: 0, pack10: 0}, prospect: '', cree_le: '2026-10-30T13:33:00Z', modifie_le: '2026-10-30T13:33:00Z'}),
);
const serveur = spawn(PYTHON, ['-B', 'tools/commercial/notes_local.py', '--port', '4330', '--dossier', STOCK], {stdio: 'ignore'});
await new Promise((r) => setTimeout(r, 1200));
const navigateur = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--no-sandbox']});
let echecs = 0;
const verifie = (nom, ok) => {
  console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${nom}`);
  if (!ok) echecs++;
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const debordement = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
// Tracé du QR code d'un lien, comme qrSvg(lien, couleur, 2) de src/app/util.ts
function traceQr(lien) {
  const q = qrcode(0, 'M');
  q.addData(lien);
  q.make();
  let d = '';
  for (let r = 0; r < q.getModuleCount(); r++) for (let c = 0; c < q.getModuleCount(); c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return d;
}
// QA_DONNEES : autre fichier chiffré (identifiants de test), servi à la page à la place de public/espace-commercial/donnees.enc
async function servirDonnees(page) {
  if (!process.env.QA_DONNEES) return;
  const contenu = fs.readFileSync(process.env.QA_DONNEES);
  await page.setRequestInterception(true);
  page.on('request', (r) => (new URL(r.url()).pathname === '/espace-commercial/donnees.enc' ? r.respond({status: 200, contentType: 'application/octet-stream', body: contenu}) : r.continue()));
}

try {
  for (const largeur of largeurs) {
    const page = await navigateur.newPage();
    await servirDonnees(page);
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
    const offres = await page.$$eval('.pc-offre strong', (l) => l.map((x) => x.textContent));
    verifie(`2 offres seulement : ${offres.join(', ')}`, offres.join() === 'Starter,Pro');
    verifie('engagement : 2 choix, sans engagement par défaut', (await page.$$eval('.pc-periode button', (l) => l.map((b) => `${b.textContent.trim()}|${b.getAttribute('aria-checked')}`))).join() === 'Sans engagement|true,Avec 12 mois d’engagement, −15 %|false');
    const prixOffres = () => page.$$eval('.pc-offre-p', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' · '));
    verifie(`prix sans engagement (${await prixOffres()})`, /^29 € \/ mois · 49 € \/ mois$/.test(await prixOffres()));
    await page.evaluate(() => [...document.querySelectorAll('.pc-periode button')][1].click());
    await dormir(200);
    verifie(`prix avec engagement (${await prixOffres()})`, /^24,65 € \/ mois · 41,65 € \/ mois$/.test(await prixOffres()));
    verifie('récapitulatif avec engagement', /avec 12 mois d’engagement/.test(await page.$eval('.pc-recap', (e) => e.textContent)) && /24,65/.test(await page.$eval('.pc-total dd', (e) => e.textContent)));
    await page.evaluate(() => [...document.querySelectorAll('.pc-offre')].find((b) => b.textContent.includes('Pro')).click());
    await dormir(200);
    verifie('Pro avec engagement : 41,65 €', /41,65/.test(await page.$eval('.pc-total dd', (e) => e.textContent)));
    await page.evaluate(() => [...document.querySelectorAll('.pc-periode button')][0].click());
    await page.evaluate(() => [...document.querySelectorAll('.pc-offre')].find((b) => b.textContent.includes('Starter')).click());
    await page.evaluate(() => [...document.querySelectorAll('.pc-pas button')][1].click());
    await dormir(300);
    const recap = await page.$eval('.pc-total dd', (e) => e.textContent);
    verifie(`récapitulatif : 29 € + 1 QR à 9,99 € (${recap})`, /38,99/.test(recap));
    verifie('aperçu : carte au nom du commerce', (await page.$eval('.cw-a-n', (e) => e.textContent)) === 'La Fusion');
    verifie('panel : pas de débordement horizontal', !(await debordement(page)));
    await page.screenshot({path: `${SORTIE}/panel-${largeur}.png`, fullPage: true});
    await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0].click());
    await page.waitForSelector('.pc-lien--paiement a', {timeout: 15000}).catch(async (e) => {
      await page.screenshot({path: `${SORTIE}/echec-${largeur}.png`, fullPage: true});
      console.log('Message du panel :', await page.$eval('.pc-form .form-err', (x) => x.textContent).catch(() => '(aucun)'), '| adresse :', page.url(), '| erreurs :', erreurs.join(' | '));
      throw e;
    });
    const lien = await page.$eval('.pc-lien--paiement a', (a) => a.href);
    verifie(`lien de paiement créé (${lien})`, /\/panier\/\?carte=[a-z0-9]{16}$/.test(lien));
    const trace = await page.$eval('.pc-qr-lien path', (p) => p.getAttribute('d'));
    const lienEssai = TRIAL.open ? await page.$eval('.pc-lien--essai a', (a) => a.href) : '';
    if (TRIAL.open) {
      verifie(`lien d’essai, même carte (${lienEssai})`, lienEssai === lien.replace('/panier/', '/essai/'));
      // Règle provisoire du plan : le QR code à l'écran mène à l'essai
      verifie('QR code à l’écran : le lien d’essai, pas celui du paiement', trace === traceQr(lienEssai) && trace !== traceQr(lien));
    } else {
      verifie('essai fermé : aucun lien d’essai, QR code du paiement', !(await page.$('.pc-lien--essai')) && trace === traceQr(lien));
    }
    await page.waitForSelector('.pc-liste li', {timeout: 5000}).catch(() => {});
    if (!(await page.$('.pc-liste li'))) console.log('Réponses cartes.php :', reponses.join(' '));
    verifie('carte listée', (await page.$$('.pc-liste li')).length > 0);
    verifie('liens : pas de débordement horizontal', !(await debordement(page)));
    await page.screenshot({path: `${SORTIE}/panel-lien-${largeur}.png`, fullPage: true});

    // Carte de plus de 15 passages : l'essai n'en accepte pas tant, le panel le dit
    if (TRIAL.open) {
      await saisir('Passages pour la récompense', '20');
      await dormir(200);
      await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0]?.click());
      await page.waitForFunction(() => document.body.innerText.includes('l’essai en accepte de 4 à 15'), {timeout: 10000}).then(() => verifie('20 passages : avertissement pour le lien d’essai', true), () => verifie('20 passages : avertissement pour le lien d’essai', false));
      await saisir('Passages pour la récompense', '8');
      await dormir(200);
      await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0]?.click());
      await page.waitForFunction(() => !document.body.innerText.includes('l’essai en accepte de 4 à 15') && !!document.querySelector('.pc-lien--paiement a'), {timeout: 10000});
    }

    const client = await navigateur.createBrowserContext();
    const p2 = await client.newPage();
    p2.on('pageerror', (e) => erreurs.push(e.message));
    // `GET trial` simulé : l'essai ouvert, sans appeler le serveur
    await p2.setRequestInterception(true);
    p2.on('request', (r) => (new URL(r.url()).pathname.endsWith('/functions/v1/trial') ? r.respond({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'}, body: JSON.stringify({open: true})}) : r.continue()));
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
    verifie('panier : pas de débordement horizontal', !(await debordement(p2)));
    await p2.screenshot({path: `${SORTIE}/panier-${largeur}.png`, fullPage: true});
    await p2.evaluate(() => [...document.querySelectorAll('.pn-prep .pn-link')][0].click());
    await dormir(200);
    verifie('panier : « changer d’offre » rouvre les étapes', !!(await p2.$('input[name=offre]')));
    await p2.goto(`${BASE}/merci/?offre=starter-mensuel&compte=1`, {waitUntil: 'networkidle2'});
    await p2.waitForSelector('#preparee:not([hidden])', {timeout: 8000});
    verifie('/merci/ : carte déjà préparée, formulaire masqué', await p2.$eval('#elements-form', (f) => f.hidden));
    await p2.screenshot({path: `${SORTIE}/merci-${largeur}.png`});

    // Même lien, carte passée en Pro avec engagement : 41,65 € + 1 QR à 9,99 €, sans mise en service
    await page.evaluate(() => [...document.querySelectorAll('.pc-periode button')][1].click());
    await page.evaluate(() => [...document.querySelectorAll('.pc-offre')].find((b) => b.textContent.includes('Pro')).click());
    await dormir(200);
    await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0]?.click());
    await page.waitForFunction(() => !!document.querySelector('.pc-lien--paiement a'), {timeout: 10000});
    await p2.goto(lien.replace(/^https?:\/\/[^/]+/, BASE), {waitUntil: 'networkidle2'});
    await p2.waitForSelector('.pn-prep', {timeout: 20000});
    const texteEngage = await p2.$eval('.pn-sum', (e) => e.textContent);
    verifie('panier : Pro avec engagement repris de la carte', /Pro/.test(texteEngage) && /51,64/.test(texteEngage));
    // Puis retour à l'état de départ, pour la suite
    await page.evaluate(() => [...document.querySelectorAll('.pc-periode button')][0].click());
    await page.evaluate(() => [...document.querySelectorAll('.pc-offre')].find((b) => b.textContent.includes('Starter')).click());
    await dormir(200);
    await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0]?.click());
    await page.waitForFunction(() => !!document.querySelector('.pc-lien--paiement a'), {timeout: 10000});

    // Lien d'essai : ouvert seulement, jamais soumis
    if (TRIAL.open) {
      await p2.goto(lienEssai.replace(/^https?:\/\/[^/]+/, BASE), {waitUntil: 'networkidle2'});
      await p2.waitForFunction(() => document.body.innerText.includes('La Fusion'), {timeout: 15000}).then(() => verifie('/essai/?carte= : la carte préparée est reprise', true), () => verifie('/essai/?carte= : la carte préparée est reprise', false));
      verifie('/essai/ : pas de débordement horizontal', !(await debordement(p2)));
      await p2.screenshot({path: `${SORTIE}/essai-${largeur}.png`, fullPage: true});
    }

    // Ancienne fiche (Premium, mensuel) : toujours lisible, jamais de page blanche
    await p2.goto(`${BASE}/panier/?carte=${ANCIENNE}`, {waitUntil: 'networkidle2'});
    await p2.waitForSelector('.pn-prep', {timeout: 20000}).catch(() => {});
    verifie('panier, ancienne fiche Premium : la carte s’ouvre', !!(await p2.$('.pn-prep')) && (await p2.$eval('#pn-prep-t', (e) => e.textContent)).includes('Ancienne Fiche'));
    verifie('panier, ancienne fiche Premium : Starter dans le récapitulatif', /Starter/.test(await p2.$eval('.pn-sum', (e) => e.textContent).catch(() => '')));
    await client.close();
    await page.evaluate((a) => (location.hash = `#/preparer/${a}`), ANCIENNE);
    await page.waitForFunction(() => document.body.innerText.includes('Ancienne Fiche'), {timeout: 10000});
    await dormir(300);
    verifie('panel, ancienne fiche : ouverte en Starter sans engagement', (await page.$eval('.pc-offre.on strong', (e) => e.textContent)) === 'Starter' && (await page.$eval('.pc-periode button.on', (e) => e.textContent.trim())) === 'Sans engagement');
    verifie('panel, ancienne fiche : le panel dit de vérifier puis de mettre à jour', (await page.$eval('.pc-form', (e) => e.innerText)).includes('préparée en Premium, offre qui n’est plus proposée') && !!(await page.$('.pc-form .b--gold')));
    verifie('panel, ancienne fiche : dans la liste', (await page.$$eval('.pc-liste li small', (l) => l.map((x) => x.textContent).join(' '))).includes('ancienne fiche Premium'));
    await page.screenshot({path: `${SORTIE}/panel-ancienne-${largeur}.png`, fullPage: true});
    await page.evaluate(() => [...document.querySelectorAll('.pc-form .b--gold')][0].click());
    await page.waitForSelector('.pc-lien--paiement a', {timeout: 15000});
    const reecrite = JSON.parse(fs.readFileSync(`${STOCK}/cartes/${ANCIENNE}.json`, 'utf8'));
    verifie('panel, ancienne fiche : mise à jour au format neuf, même identifiant', reecrite.offre === 'starter' && reecrite.engagement === 'sans' && !('periode' in reecrite));
    // Ancienne fiche remise pour la largeur suivante
    fs.writeFileSync(`${STOCK}/cartes/${ANCIENNE}.json`, JSON.stringify({...reecrite, offre: 'premium', periode: 'mensuel', engagement: undefined}));

    verifie(`aucune erreur JavaScript (${erreurs.join(' | ')})`, !erreurs.length);
    await page.close();
  }
} finally {
  await navigateur.close();
  serveur.kill();
  fs.rmSync(`${STOCK}/cartes/${ANCIENNE}.json`, {force: true});
}
console.log(echecs ? `${echecs} échec(s)` : 'Tout est bon');
process.exit(echecs ? 1 : 0);
