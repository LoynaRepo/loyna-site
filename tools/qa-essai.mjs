// Essai gratuit, de bout en bout, sur /essai/ :
//   node tools/qa-essai.mjs <base> [dossier de captures]
//     Sans réseau vers le produit : les réponses de la fonction trial, de cartes.php et de l'API des entreprises sont simulées. Vérifie le
//     formulaire, le corps envoyé (contrat du cahier des charges 4.1, sans SIRET depuis le 2026-11-05), chaque code d'erreur, les écrans
//     de fin, essai fermé ou complet, et les deux parcours du funnel (2026-11-07, une question par écran) : /essai/ (métier, nom,
//     récompense, coordonnées, mot de passe) et /essai/?carte=<id> (carte préparée : coordonnées, mot de passe, « Démarrer mon essai gratuit »).
//     Avec un dossier : une capture de chaque écran à 1366, 390 et 360 px (funnel-<largeur>-<écran>.png).
//     Toute autre requête vers Supabase est bloquée : rien ne peut partir vers la production. L'API des entreprises ne doit plus être appelée.
//   ESSAI_URL=https://<projet d'essai>.supabase.co ESSAI_ANON=… ESSAI_SERVICE=… node tools/qa-essai.mjs --pile <base du site> [dossier]
//     Scénarios S1 et S2 du cahier des charges contre la pile d'essai (2e projet Supabase, site lancé avec PUBLIC_LOYNA_SUPABASE_URL et
//     PUBLIC_LOYNA_SUPABASE_KEY dans .env.local), valeurs générées, adresses @example.com. Refuse de tourner sur le projet de production.
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PROD = 'alfxnoaxcmnbrqhlmmqq';
const args = process.argv.slice(2);
const pile = args[0] === '--pile';
if (pile) args.shift();
const [BASE = 'http://127.0.0.1:4329', DOSSIER] = args;
if (DOSSIER) fs.mkdirSync(DOSSIER, {recursive: true});
const SITE = fs.readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const OUVERT = /export const TRIAL = \{open: true/.test(SITE);
const CGV = /export const CGV_VERSION = '([^']+)'/.exec(SITE)[1];

const b = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu', '--hide-scrollbars']});
let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
};
const nbsp = (s) => String(s ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
const json = (r, status, corps) => r.respond({status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corps)});
const erreur = (code, message) => ({error: {code, message}});

const VISITEUR = () => {
  const n = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {prenom: 'Camille', nom: 'Essai', email: `essai-${n}@example.com`, tel: `06 39 98 ${n.slice(-2)} ${n.slice(-4, -2)}`, mdp: `Essai-${n.slice(-6)}Aa1`, commerce: `Le Fournil ${n.slice(-5)}`};
};

// Funnel (2026-11-07) : un écran par question. Clique sur un métier (qui passe à l'écran suivant), « Continuer », envoi au dernier écran.
const choisirMetier = async (page, nom) => {
  await page.evaluate((n) => [...document.querySelectorAll('.es-choix button')].find((x) => x.textContent.trim() === n).click(), nom);
  await pause(120);
};
const continuer = async (page) => {
  await page.evaluate(() => document.querySelector('.es-form button[type=submit]').click());
  await pause(150);
};
const retour = async (page) => {
  await page.evaluate(() => document.querySelector('.es-retour').click());
  await pause(120);
};
const champ = async (page, sel, val) => {
  await page.$eval(sel, (e) => {
    e.focus();
    e.select?.();
  });
  await page.type(sel, val);
};
// Remplit depuis l'écran affiché jusqu'au dernier, sans envoyer (carte préparée : il commence aux coordonnées)
async function remplir(page, v) {
  if (await page.$('.es-choix')) {
    await choisirMetier(page, 'Boulangerie');
    await champ(page, '#es-name', v.commerce);
    await continuer(page);
    await continuer(page); // récompense proposée pour le métier
  }
  await champ(page, '#es-first_name', v.prenom);
  await champ(page, '#es-last_name', v.nom);
  await champ(page, '#es-email', v.email);
  await champ(page, '#es-phone', v.tel);
  if (!(await page.$eval('#es-cgv', (e) => e.checked))) await page.click('#es-cgv');
}
const envoyer = (page) => page.evaluate(() => document.querySelector('.es-envoi').click());
// Écran affiché : question, « Étape n sur N », bouton principal
const ecran = (page) =>
  page.evaluate(() => ({
    etape: document.querySelector('.es-prog-n')?.textContent.replace(/\s+/g, ' ').trim(),
    question: document.querySelector('.es-form h2')?.textContent.replace(/\s+/g, ' ').trim(),
  }));

// --- Pile d'essai ----------------------------------------------------------------------------------------------------------
if (pile) {
  const {ESSAI_URL, ESSAI_ANON, ESSAI_SERVICE} = process.env;
  if (!ESSAI_URL || !ESSAI_ANON || !ESSAI_SERVICE) throw new Error('ESSAI_URL, ESSAI_ANON et ESSAI_SERVICE sont obligatoires.');
  if (ESSAI_URL.includes(PROD)) throw new Error('Projet de production : jamais de compte de test ici.');
  const rest = (chemin) => fetch(`${ESSAI_URL}/rest/v1/${chemin}`, {headers: {apikey: ESSAI_SERVICE, authorization: `Bearer ${ESSAI_SERVICE}`}}).then((r) => r.json());
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({width: 1280, height: 900});
  await page.evaluateOnNewDocument(() => localStorage.setItem('loyna-consent', JSON.stringify({ok: false, t: Date.now()})));
  page.on('pageerror', (e) => console.log('  erreur de page :', String(e)));

  // S1 : configurateur, /essai/, confirmation par lien, activation
  const v = VISITEUR();
  await page.goto(`${BASE}/creer-ma-carte/?nom=${encodeURIComponent(v.commerce)}&activite=Boulangerie`, {waitUntil: 'networkidle0', timeout: 90000});
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0'}), page.evaluate(() => document.querySelector('#go-essai').click())]);
  await page.waitForSelector('.es-choix', {timeout: 20000});
  await continuer(page);
  verifier('S1 : le configurateur remplit la carte', await page.$eval('#es-name', (e) => e.value), v.commerce);
  await retour(page);
  await remplir(page, v);
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 30000});
  verifier('S1 : écran « Vérifiez votre boîte mail »', nbsp(await page.$eval('.es-fin h2', (e) => e.textContent)), 'Vérifiez votre boîte mail');
  verifier('S1 : rien de créé avant la confirmation', (await rest(`merchants?select=id&name=eq.${encodeURIComponent(v.commerce)}`)).length, 0);
  const lien = await fetch(`${ESSAI_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {apikey: ESSAI_SERVICE, authorization: `Bearer ${ESSAI_SERVICE}`, 'content-type': 'application/json'},
    body: JSON.stringify({type: 'recovery', email: v.email}), // même lien que l'e-mail « Activez votre essai » (LOYNA_MAIL_DRY_RUN : pas d'envoi)
  }).then((r) => r.json());
  const jeton = lien.properties?.hashed_token ?? lien.hashed_token;
  await page.goto(`${BASE}/espace-client/mot-de-passe/?token_hash=${jeton}&type=recovery&essai=1`, {waitUntil: 'networkidle0', timeout: 90000});
  await page.waitForSelector('input[autocomplete=new-password]', {timeout: 30000});
  const [mdp1, mdp2] = await page.$$('input[autocomplete=new-password]');
  await mdp1.type(v.mdp);
  await mdp2.type(v.mdp);
  await page.evaluate(() => document.querySelector('form button[type=submit]').click());
  // Dashboard retire ?bienvenue=1 de l'adresse dès qu'il l'a lu : on attend la page, pas le paramètre.
  await page.waitForFunction(() => location.pathname === '/espace-client/', {timeout: 30000});
  const [m] = await rest(`merchants?select=id,slug,status,subscription_plan,trial_started_at,trial_ends_at&name=eq.${encodeURIComponent(v.commerce)}`);
  verifier('S1 : commerce STARTER actif', [m?.subscription_plan, m?.status], ['STARTER', 'ACTIVE']);
  const duree = (Date.parse(m.trial_ends_at) - Date.parse(m.trial_started_at)) / 86400000;
  verifier('S1 : essai d’un mois calendaire', duree >= 28 && duree <= 31, true);
  // Inscription d'un client, comme la page /join/, puis scan par le propriétaire. Le QR de la carte n'est gardé qu'en empreinte : la pile
  // d'essai reçoit ici un jeton connu pour ce client (table wallet_qr_tokens, clé de service du projet d'essai).
  const fiche = await fetch(`${ESSAI_URL}/functions/v1/customer-enroll?slug=${m.slug}`, {headers: {apikey: ESSAI_ANON}}).then((r) => r.json());
  const inscrit = await fetch(`${ESSAI_URL}/functions/v1/customer-enroll`, {
    method: 'POST',
    headers: {apikey: ESSAI_ANON, 'content-type': 'application/json'},
    body: JSON.stringify({merchant_slug: m.slug, first_name: 'Léa', last_name: null, phone: null, email: null, birthday: null, consents: {loyalty_terms: true, marketing_wallet: false}, consent_version: fiche.legal?.consent_version ?? null, website: ''}),
  }).then(async (r) => ({status: r.status, corps: await r.json().catch(() => null)}));
  verifier('S1 : /join/ inscrit un client', inscrit.status, 201);
  const session = await fetch(`${ESSAI_URL}/auth/v1/token?grant_type=password`, {method: 'POST', headers: {apikey: ESSAI_ANON, 'content-type': 'application/json'}, body: JSON.stringify({email: v.email, password: v.mdp})}).then((r) => r.json());
  const qr = `loyna:v1:${randomBytes(24).toString('base64url')}`;
  const [jeton2] = await rest(`wallet_qr_tokens?select=id&merchant_id=eq.${m.id}&limit=1`);
  await fetch(`${ESSAI_URL}/rest/v1/wallet_qr_tokens?id=eq.${jeton2.id}`, {method: 'PATCH', headers: {apikey: ESSAI_SERVICE, authorization: `Bearer ${ESSAI_SERVICE}`, 'content-type': 'application/json'}, body: JSON.stringify({token_hash: createHash('sha256').update(qr).digest('hex')})});
  const scan = await fetch(`${ESSAI_URL}/functions/v1/validate-visit`, {
    method: 'POST',
    headers: {apikey: ESSAI_ANON, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json'},
    body: JSON.stringify({action: 'validate', qr, idempotency_key: randomUUID(), override_cooldown: false, amount: null, points: null}),
  }).then((r) => r.json());
  verifier('S1 : scan crédité', scan.status, 'OK');

  // S2 : anti-abus, rien de créé
  const refus = async (nom, corps, codeAttendu) => {
    const r = await fetch(`${ESSAI_URL}/functions/v1/trial`, {method: 'POST', headers: {apikey: ESSAI_ANON, 'content-type': 'application/json'}, body: JSON.stringify(corps)});
    const d = await r.json().catch(() => null);
    verifier(`S2 : ${nom}`, d?.error?.code ?? d?.status, codeAttendu);
  };
  const demande = (x, plus = {}) => ({
    action: 'start',
    account: {email: x.email, password: x.mdp, first_name: x.prenom, last_name: x.nom, phone: x.tel},
    business: {name: x.commerce, activity: 'Boulangerie'},
    card: {bg: '#7a3d1c', accent: '#f2c879', total: 10, reward: 'Viennoiserie offerte'},
    cgv_version: CGV,
    website: '',
    ...plus,
  });
  const autre = () => VISITEUR();
  // 1 essai par personne (e-mail et téléphone, CGV 4.9) ; ils ne se comparent qu'après le mot de passe : sans lui, seul le compte se voit, comme au panier.
  await refus('même e-mail, autre mot de passe', demande({...autre(), email: v.email}), 'ACCOUNT_EXISTS');
  await refus('même e-mail, bon mot de passe', demande({...autre(), email: v.email, mdp: v.mdp}), 'TRIAL_ALREADY_USED');
  // Ces refus vont jusqu'au compte : ils comptent dans la limite de 3 par heure.
  const videLimites = await fetch(`${ESSAI_URL}/rest/v1/rpc/essai_exec`, {method: 'POST', headers: {apikey: ESSAI_SERVICE, authorization: `Bearer ${ESSAI_SERVICE}`, 'content-type': 'application/json'}, body: JSON.stringify({q: 'delete from private.rate_limits where true'})});
  await videLimites.arrayBuffer();
  await refus('même téléphone', demande({...autre(), tel: v.tel}), 'TRIAL_ALREADY_USED');
  const avantRobot = (await rest('trial_requests?select=id')).length;
  const robot = autre();
  const r = await fetch(`${ESSAI_URL}/functions/v1/trial`, {method: 'POST', headers: {apikey: ESSAI_ANON, 'content-type': 'application/json'}, body: JSON.stringify(demande(robot, {website: 'https://robot.example'}))});
  await r.arrayBuffer();
  verifier('S2 : champ piège, rien de créé', (await rest('trial_requests?select=id')).length, avantRobot);
  console.log('À FAIRE À LA MAIN (secrets du projet d’essai) : LOYNA_TRIAL_OPEN=false → TRIAL_CLOSED ; LOYNA_TRIAL_MAX_ACTIVE atteint → TRIAL_FULL.');
  // S3 puis S4 dans le navigateur, même commerce : fin d'essai simulée en SQL (tests/faux-stripe/sql-essai.sql du dépôt LOYNA), bandeau, /join/, panier,
  // paiement chez le faux Stripe, reprise. Le détail en base est dans tests/integration/scenarios.test.ts.
  const sqlEssai = async (nom, q) => {
    const x = await fetch(`${ESSAI_URL}/rest/v1/rpc/${nom}`, {method: 'POST', headers: {apikey: ESSAI_SERVICE, authorization: `Bearer ${ESSAI_SERVICE}`, 'content-type': 'application/json'}, body: JSON.stringify({q})});
    if (!x.ok) throw new Error(`${nom} : ${x.status} ${await x.text()}`);
    return x.json().catch(() => null);
  };
  const texte = () => page.evaluate(() => document.body.innerText).then(nbsp);
  await sqlEssai('essai_exec', `update public.merchants set trial_ends_at = now() - interval '1 minute' where id = '${m.id}'`);
  await sqlEssai('essai_sql', 'select private.run_service_lifecycle() as r');
  await page.goto(`${BASE}/espace-client/`, {waitUntil: 'networkidle0', timeout: 90000});
  await page.waitForSelector('.banner', {timeout: 30000});
  const bandeau = nbsp(await page.$eval('.banner', (e) => e.innerText));
  verifier('S3 : bandeau de fin d’essai', /^Votre essai est terminé : votre carte est en pause\. Vos clients et leurs soldes sont conservés jusqu’au /.test(bandeau), true);
  const lienOffre = await page.$eval('.banner a', (a) => a.getAttribute('href'));
  verifier('S3 : bouton Choisir mon offre', lienOffre, `/panier/?offre=starter&engagement=0&commerce=${m.id}`);
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/s3-bandeau.png`});
  await page.goto(`${BASE}/join/?slug=${m.slug}`, {waitUntil: 'networkidle0', timeout: 90000});
  await page.waitForFunction(() => /est en pause/.test(document.body.innerText), {timeout: 30000});
  verifier('S3 : /join/ dit « en pause », pas « introuvable »', (await texte()).includes('Si vous avez déjà la carte, votre solde est conservé.'), true);
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/s3-join.png`});
  const panierUrl = {};
  await page.setRequestInterception(true);
  page.on('request', (x) => {
    if (x.url().includes('faux-stripe.test')) {
      panierUrl.url = x.url();
      return x.respond({status: 200, contentType: 'text/html', body: 'Page de paiement du faux Stripe'});
    }
    return x.continue();
  });
  await page.goto(`${BASE}${lienOffre}`, {waitUntil: 'networkidle0', timeout: 90000});
  await page.waitForSelector('#pn-cgv', {timeout: 30000});
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/s4-panier.png`, fullPage: true});
  await page.$eval('#pn-cgv', (e) => e.click());
  await page.$eval('#pn-cgv', (e) => e.closest('form').requestSubmit());
  for (let i = 0; i < 60 && !panierUrl.url; i++) await pause(500);
  verifier('S4 : le panier part vers le paiement', Boolean(panierUrl.url), true);
  const FS = `${ESSAI_URL}/functions/v1/faux-stripe/_essai`;
  const fauxStripe = (route, corps) => fetch(`${FS}/${route}`, {method: 'POST', headers: {authorization: 'Bearer faux', 'content-type': 'application/json'}, body: JSON.stringify(corps)}).then((x) => x.json());
  await fauxStripe('payer-session', {session: new URL(panierUrl.url).pathname.split('/').pop(), client: {email: v.email, name: 'Gérant Essai', business: v.commerce}});
  for (let i = 0; i < 8; i++) if (!(await fauxStripe('remettre', {})).length) break;
  const [apres] = await rest(`merchants?select=status,subscription_plan,service_stop_source&id=eq.${m.id}`);
  verifier('S4 : reprise, offre appliquée', [apres.status, apres.subscription_plan, apres.service_stop_source], ['ACTIVE', 'STARTER', null]);
  await page.goto(`${BASE}/espace-client/`, {waitUntil: 'networkidle0', timeout: 90000});
  await pause(3000);
  verifier('S4 : plus de bandeau dans l’espace client', await page.$('.banner') === null, true);
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/s4-espace.png`});
  await page.goto(`${BASE}/join/?slug=${m.slug}`, {waitUntil: 'networkidle0', timeout: 90000});
  await pause(2000);
  verifier('S4 : /join/ rouvert', (await texte()).includes('est en pause'), false);
  await ctx.close();
  await b.close();
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les essais passent.');
  process.exit(echecs ? 1 : 0);
}

// --- Réponses simulées -----------------------------------------------------------------------------------------------------
async function ouvrir({w = 1280, h = 900, chemin = '/essai/', ouverture = {open: true}, trial, carte, recherche, avant, auth} = {}) {
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({width: w, height: h, isMobile: w < 600, hasTouch: w < 600});
  const appels = {get: 0, posts: [], recherche: []};
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('loyna-consent', JSON.stringify({ok: false, t: Date.now()}));
    } catch {}
  });
  if (avant) await page.evaluateOnNewDocument(avant);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (r.method() === 'OPTIONS') return r.respond({status: 204, headers: CORS});
    if (u.includes('/functions/v1/trial')) {
      if (r.method() === 'GET') {
        appels.get++;
        return ouverture === 'panne' ? r.abort() : json(r, 200, ouverture);
      }
      appels.posts.push(JSON.parse(r.postData()));
      const reponse = trial ? trial(appels.posts.at(-1)) : {status: 200, corps: {status: 'CONFIRM_EMAIL', confirmation_sent: true}};
      return json(r, reponse.status, reponse.corps);
    }
    if (auth && u.includes('/auth/v1/')) return auth(r);
    if (u.includes('.supabase.co')) return r.abort(); // rien vers le produit
    if (u.includes('/espace-commercial/cartes.php')) return json(r, carte ? 200 : 404, carte ? {carte} : {});
    if (u.includes('recherche-entreprises.api.gouv.fr')) {
      appels.recherche.push(u);
      return recherche === 'panne' ? r.abort() : json(r, 200, recherche ?? {results: []});
    }
    return r.continue();
  });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(BASE + chemin, {waitUntil: 'networkidle0', timeout: 120000});
  return {page, ctx, appels, erreurs};
}
const attendreForm = (page) => page.waitForSelector('.es-choix', {timeout: 20000});
// Carte préparée lue dans cartes.php : le funnel ne garde que les coordonnées et le mot de passe
const attendrePreparee = (page) => page.waitForFunction(() => document.querySelector('.es-envoi')?.textContent.trim() === 'Démarrer mon essai gratuit', {timeout: 20000});

if (!OUVERT) {
  // TRIAL.open = false : la page dit que l'essai n'est pas ouvert, sans appeler le serveur
  const {page, ctx, appels, erreurs} = await ouvrir();
  await page.waitForSelector('.es-fin', {timeout: 20000});
  verifier('essai fermé au build : aucun appel, pas de formulaire', [appels.get, !!(await page.$('.es-form'))], [0, false]);
  verifier('essai fermé au build : liens', await page.$$eval('.es-fin a', (l) => l.map((a) => a.getAttribute('href'))), ['/tarifs/?carte=1', '/creer-ma-carte/#send-preview']);
  verifier('essai fermé au build : sans erreur', erreurs, []);
  await ctx.close();
  await b.close();
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les essais passent.');
  process.exit(echecs ? 1 : 0);
}

// 1. Essai fermé, complet, serveur en panne : l'abonnement et « Recevoir un aperçu »
for (const [nom, ouverture, titre] of [
  ['fermé', {open: false, reason: 'CLOSED'}, 'L’essai n’est pas ouvert pour le moment'],
  ['complet', {open: false, reason: 'FULL'}, 'Tous les essais sont pris pour le moment'],
  ['panne', 'panne', 'L’essai ne répond pas pour le moment'],
]) {
  const {page, ctx} = await ouvrir({ouverture});
  await page.waitForSelector('.es-fin', {timeout: 20000});
  verifier(`GET trial ${nom} : titre, pas de formulaire`, [nbsp(await page.$eval('.es-fin h2', (e) => e.textContent)), !!(await page.$('.es-form'))], [titre, false]);
  verifier(`GET trial ${nom} : liens`, await page.$$eval('.es-fin a', (l) => l.map((a) => a.getAttribute('href'))), ['/tarifs/?carte=1', '/creer-ma-carte/#send-preview']);
  await ctx.close();
}

// 2. Le brouillon du configurateur et le logo passent à l'essai ; la carte de l'aperçu suit les réponses
{
  const {page, ctx, erreurs} = await ouvrir({
    avant: () => {
      localStorage.setItem('loyna-config', JSON.stringify({name: 'Chez Nina', activity: 'Pizzeria', bg: '#14532d', accent: '#ffd166', total: 8, filled: 3, reward: 'Pizza offerte', variant: 'apple', touche: {reward: true, bg: true, accent: false}}));
      const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      sessionStorage.setItem('loyna-config-logo', JSON.stringify({logo_png: pixel, icon_png: pixel, nom: 'logo.png'}));
    },
  });
  await attendreForm(page);
  const metier = await page.$eval('.es-choix button[aria-pressed=true]', (e) => e.textContent.trim());
  await continuer(page);
  const nom = await page.$eval('#es-name', (e) => e.value);
  await continuer(page);
  const v = await page.evaluate(() => ({rec: document.querySelector('#es-reward').value, passages: document.querySelector('#es-total').value, apercu: document.querySelector('.es-apercu .cw-a-n').textContent, logo: !!document.querySelector('.es-apercu .cw-logo img')}));
  verifier('brouillon du configurateur repris, logo compris', {metier, nom, ...v}, {metier: 'Pizzeria', nom: 'Chez Nina', rec: 'Pizza offerte', passages: '8', apercu: 'Chez Nina', logo: true});
  await retour(page);
  await champ(page, '#es-name', 'Roma');
  verifier('l’aperçu suit le nom', await page.$eval('.es-apercu .cw-a-n', (e) => e.textContent), 'Roma');
  await page.evaluate(() => document.querySelector('.es-sum .pn-prep-sys button:last-child').click());
  await pause(100);
  verifier('aperçu Android', !!(await page.$('.es-apercu .cw--google')), true);
  verifier('pas d’erreur de page', erreurs, []);
  await ctx.close();
}

// 3. Un clic sur le métier passe à la suite et apporte son modèle, sauf ce que le visiteur a modifié ; retour arrière ; Entrée valide
{
  const {page, ctx} = await ouvrir();
  await attendreForm(page);
  await choisirMetier(page, 'Boulangerie');
  verifier('métier : un clic passe au nom, focus dans le champ', [(await ecran(page)).question, await page.evaluate(() => document.activeElement?.id)], ['Comment s’appelle votre commerce ?', 'es-name']);
  await page.type('#es-name', 'Le Fournil');
  await page.keyboard.press('Enter');
  await pause(150);
  const a = await page.evaluate(() => ({rec: document.querySelector('#es-reward')?.value, fond: getComputedStyle(document.querySelector('.es-apercu .cw')).getPropertyValue('--cw-fond')}));
  verifier('Entrée valide ; récompense et couleur du métier', a, {rec: 'Viennoiserie offerte', fond: '#7a3d1c'});
  await champ(page, '#es-reward', 'Un pain offert');
  await retour(page);
  await retour(page);
  await choisirMetier(page, 'Fleuriste');
  await continuer(page);
  verifier('récompense modifiée : gardée', await page.$eval('#es-reward', (e) => e.value), 'Un pain offert');
  await retour(page);
  await retour(page);
  await choisirMetier(page, 'Autre');
  verifier('métier « Autre » : champ libre, on reste sur l’écran', [!!(await page.$('#es-activity-autre')), (await ecran(page)).etape], [true, 'Étape 1 sur 4']);
  await ctx.close();
}

// 4. Contrôles écran par écran, sans appel au serveur
{
  const {page, ctx, appels} = await ouvrir();
  await attendreForm(page);
  verifier('métier : pas de « Continuer » avant le choix', !!(await page.$('.es-form button[type=submit]')), false);
  await choisirMetier(page, 'Autre');
  await continuer(page);
  verifier('métier « Autre » vide : refusé', !!(await page.$('#es-activity-err')), true);
  await champ(page, '#es-activity-autre', 'Tatoueur');
  await continuer(page);
  await continuer(page);
  verifier('nom vide : signalé, focus', [await page.$$eval('.pn-err', (l) => l.map((e) => e.id)), await page.evaluate(() => document.activeElement?.id)], [['es-name-err'], 'es-name']);
  await page.keyboard.type('🍕🍕');
  await continuer(page);
  verifier('nom sans lettre : refusé', /lettre de notre alphabet/.test(await page.$eval('#es-name-err', (e) => e.textContent)), true);
  await champ(page, '#es-name', 'Encre Noire');
  await continuer(page);
  await page.$eval('#es-reward', (e) => e.select());
  await page.keyboard.press('Backspace');
  await continuer(page);
  verifier('récompense vide : refusée', !!(await page.$('#es-reward-err')), true);
  await page.type('#es-reward', 'Retouche offerte');
  await continuer(page);
  await continuer(page);
  verifier('dernier écran : tout est signalé, focus sur le prénom, rien ne part', [await page.$$eval('.pn-err', (l) => l.map((e) => e.id.replace(/^es-|-err$/g, ''))), await page.evaluate(() => document.activeElement?.id), appels.posts.length], [['first_name', 'last_name', 'email', 'phone', 'cgv'], 'es-first_name', 0]);
  await remplir(page, VISITEUR());
  await page.click('#es-cgv');
  await envoyer(page);
  await pause(150);
  verifier('dernier écran : CGV non cochées, rien ne part', [await page.$$eval('.pn-err', (l) => l.map((e) => e.id.replace(/^es-|-err$/g, ''))), appels.posts.length], [['cgv'], 0]);
  verifier('aucun champ mot de passe', !!(await page.$('input[type=password], #es-password')), false);
  await ctx.close();
}

// 5. Parcours sans carte préparée : 5 écrans, une question chacun ; ni logo ni SIRET ; parrainage replié ; 1 essai par personne
{
  const {page, ctx} = await ouvrir();
  await attendreForm(page);
  const vus = [await ecran(page)];
  await choisirMetier(page, 'Boulangerie');
  vus.push(await ecran(page));
  await champ(page, '#es-name', 'Le Fournil');
  await continuer(page);
  vus.push(await ecran(page));
  await continuer(page);
  vus.push(await ecran(page));
  verifier('/essai/ : les 4 écrans', vus, [
    {etape: 'Étape 1 sur 4', question: 'Quel est votre commerce ?'},
    {etape: 'Étape 2 sur 4', question: 'Comment s’appelle votre commerce ?'},
    {etape: 'Étape 3 sur 4', question: 'Que gagnent vos clients fidèles ?'},
    {etape: 'Étape 4 sur 4', question: 'Votre carte est prête. À qui envoie-t-on l’accès ?'},
  ]);
  verifier('dernier écran : bouton, parrainage replié, sans logo ni SIRET', await page.evaluate(() => ({bouton: document.querySelector('.es-envoi').textContent.trim(), parrain: !!document.querySelector('.es-parrain'), logo: !!document.querySelector('input[type=file]'), siret: /siret/i.test(document.querySelector('.es-funnel').innerHTML)})), {bouton: 'Essayer 1 mois gratuitement', parrain: true, logo: false, siret: false});
  verifier('/essai/ : 1 essai par personne annoncé (CGV 4.9)', nbsp(await page.$eval('.pn-cgv', (e) => e.textContent)).includes('1 essai par personne'), true);
  await ctx.close();
}

// 6. Envoi : corps du contrat, écran de confirmation, mesure
{
  const v = VISITEUR();
  const {page, ctx, appels} = await ouvrir({chemin: '/essai/?parrain=loyna-abc234'});
  await attendreForm(page);
  // Consent.astro définit loynaTrack au chargement : la mesure est remplacée une fois la page prête
  await page.evaluate(() => {
    window.__mesures = [];
    window.loynaTrack = (n, p) => window.__mesures.push([n, p]);
  });
  await remplir(page, v);
  verifier('code de parrainage du lien : champ déplié et rempli', await page.$eval('#es-referral', (e) => e.value), 'loyna-abc234');
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 20000});
  const c = appels.posts[0];
  verifier('corps : action, compte', [c.action, c.account], ['start', {email: v.email, first_name: v.prenom, last_name: v.nom, phone: v.tel}]);
  verifier('corps : commerce sans SIRET, carte', [c.business, c.card], [{name: v.commerce, activity: 'Boulangerie'}, {bg: '#7a3d1c', accent: '#f2c879', total: 10, reward: 'Viennoiserie offerte'}]);
  verifier('aucun appel à l’API des entreprises', appels.recherche, []);
  verifier('corps : parrainage normalisé, CGV, champ piège, pas de logo', [c.referral_code, c.cgv_version, c.website, 'logo_png' in c], ['LOYNA-ABC234', CGV, '', false]);
  const t = nbsp(await page.$eval('.es-fin', (e) => e.textContent));
  verifier('écran « Vérifiez votre boîte mail »', [/^Vérifiez votre boîte mail/.test(t), t.includes(v.email), t.includes(v.commerce)], [true, true, true]);
  verifier('mesure trial_start', await page.evaluate(() => window.__mesures.map((m) => m[0])), ['trial_start']);
  verifier('code gardé pour le panier', await page.evaluate(() => localStorage.getItem('loyna-essai-parrain')), 'LOYNA-ABC234');
  await pause(1200); // défilement doux jusqu'au message
  verifier('l’écran de fin vient sous les yeux', await page.evaluate(() => {
    const r = document.querySelector('.es-fin').getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight && document.activeElement === document.querySelector('.es-fin');
  }), true);
  verifier('renvoi : vrai bouton, conseil spam et Promotions', [await page.$eval('.es-renvoi-b', (e) => e.textContent.trim()), /Promotions/.test(t)], ['Renvoyer le lien par e-mail', true]);
  await page.click('.es-renvoi-b');
  await page.waitForSelector('.es-renvoi-ok', {timeout: 10000});
  const r = await page.evaluate(() => ({ok: document.querySelector('.es-renvoi-ok').textContent, b: document.querySelector('.es-renvoi-b').textContent.trim(), off: document.querySelector('.es-renvoi-b').disabled}));
  verifier('renvoi : même circuit (trial resend, adresse saisie), confirmation, bouton bloqué avec compte à rebours', [appels.posts.at(-1), nbsp(r.ok).startsWith(`Nouveau lien envoyé à ${v.email}`), /^Renvoyer le lien \((60|59) s\)$/.test(r.b), r.off], [{action: 'resend', email: v.email}, true, true, true]);
  await page.click('.es-renvoi-b').catch(() => {});
  await pause(200);
  verifier('renvoi : pas de second envoi pendant l’attente', appels.posts.filter((c) => c.action === 'resend').length, 1);
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/essai-confirmer.png`, fullPage: true});
  await ctx.close();
}

// 7. Confirmation non partie ; compte existant, essai activé tout de suite
{
  const v = VISITEUR();
  const {page, ctx} = await ouvrir({trial: () => ({status: 200, corps: {status: 'CONFIRM_EMAIL', confirmation_sent: false}})});
  await attendreForm(page);
  await remplir(page, v);
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 20000});
  verifier('e-mail non parti : on le dit, avec le contact', nbsp(await page.$eval('.es-fin', (e) => e.textContent)).includes('n’a pas pu partir'), true);
  await ctx.close();
}
{
  const v = VISITEUR();
  const {page, ctx} = await ouvrir({trial: () => ({status: 200, corps: {status: 'ACTIVATED', merchant_id: 'm1', slug: 'le-fournil', join_url: 'https://loyna.fr/join/le-fournil', trial_ends_at: '2026-12-01T10:00:00Z'}})});
  await attendreForm(page);
  await remplir(page, v);
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 20000});
  const t = nbsp(await page.$eval('.es-fin', (e) => e.textContent));
  verifier('compte existant : carte prête, date, lien d’inscription', [/^Votre carte est prête/.test(t), t.includes('1 décembre 2026'), t.includes('https://loyna.fr/join/le-fournil')], [true, true, true]);
  verifier('compte existant : lien vers l’espace client', await page.$eval('.es-fin a.btn', (e) => e.getAttribute('href')), '/espace-client/?bienvenue=1');
  await ctx.close();
}

// 8. Chaque code d'erreur du contrat ; une erreur de coordonnées ramène à leur écran
for (const [code, attendu] of [
  ['TRIAL_ALREADY_USED', {zone: 'alerte', texte: '1 essai par personne', lien: '/tarifs/'}],
  ['ACCOUNT_EXISTS', {zone: 'alerte', texte: 'indiquez son mot de passe', lien: '/espace-client/?oubli=1'}],
  ['ACCOUNT_HAS_MERCHANT', {zone: 'alerte', texte: 'a déjà un commerce', lien: '/espace-client/'}],
  ['RATE_LIMITED', {zone: 'alerte', texte: 'réessayez dans une heure', lien: null}],
  ['INVALID_REQUEST', {zone: 'alerte', texte: 'Demande refusée', lien: null}],
  ['REFERRAL_INVALID', {zone: 'referral', texte: 'Code inconnu'}],
  ['INVALID_PHONE', {zone: 'phone', texte: 'numéro de téléphone valide'}],
  ['INVALID_EMAIL', {zone: 'email', texte: 'Adresse refusée'}],
  ['TRIAL_CLOSED', {zone: 'fin', texte: 'n’est pas ouvert'}],
  ['TRIAL_FULL', {zone: 'fin', texte: 'Tous les essais sont pris'}],
]) {
  const v = VISITEUR();
  const messages = {INVALID_REQUEST: 'Demande refusée.', REFERRAL_INVALID: 'Code inconnu.', WEAK_PASSWORD: 'Mot de passe trop faible.', INVALID_PHONE: 'Numéro refusé.', INVALID_EMAIL: 'Adresse refusée.'};
  const {page, ctx} = await ouvrir({trial: () => ({status: 400, corps: erreur(code, messages[code] ?? `Message du serveur pour ${code}`)})});
  await attendreForm(page);
  await remplir(page, v);
  await envoyer(page);
  await pause(350);
  if (attendu.zone === 'alerte') {
    const r = await page.evaluate(() => ({t: document.querySelector('.pn-alert')?.textContent ?? '', l: document.querySelector('.pn-alert a')?.getAttribute('href') ?? null}));
    verifier(`${code} : alerte et lien`, [nbsp(r.t).includes(attendu.texte), r.l], [true, attendu.lien]);
  } else if (attendu.zone === 'fin') {
    verifier(`${code} : écran de fin`, nbsp(await page.$eval('.es-fin', (e) => e.textContent)).includes(attendu.texte), true);
  } else {
    const r = await page.evaluate((z) => ({t: document.querySelector(`#es-${z}-err`)?.textContent ?? '', f: document.activeElement?.id}), attendu.zone);
    verifier(`${code} : au bon champ, avec le focus`, [nbsp(r.t).includes(attendu.texte), r.f], [true, `es-${attendu.zone}`]);
  }
  await ctx.close();
}

// 9. Carte préparée dans le panel (/essai/?carte=<id>) : coordonnées puis mot de passe, aperçu « Votre carte », « Démarrer mon essai gratuit ».
//    Ni réglage de la carte ni parrainage ; ancienne fiche en premium comprise : nombre de passages ramené à 15 dans le corps envoyé.
{
  const carte = {nom: 'La Fusion', activite: 'Restaurant', recompense: 'Dessert offert', fond: '#14532d', tampons: '#d9b27a', passages: 20, logo: null, offre: 'premium', periode: 'mensuel', qr: {unit: 1, pack5: 0, pack10: 0}};
  const v = VISITEUR();
  const {page, ctx, appels, erreurs} = await ouvrir({chemin: '/essai/?carte=19k93n5985n294gn', carte});
  await attendrePreparee(page);
  verifier('carte préparée : coordonnées d’abord, l’aperçu montre la carte', [await ecran(page), await page.$eval('.es-apercu .cw-a-n', (e) => e.textContent), !!(await page.$('.es-choix, #es-name, #es-reward'))], [{etape: undefined, question: 'Votre carte est prête. À qui envoie-t-on l’accès ?'}, 'La Fusion', false]);
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/essai-carte-preparee.png`, fullPage: true});
  await continuer(page);
  verifier('carte préparée : coordonnées et CGV contrôlées, rien ne part', [await page.$$eval('.pn-err', (l) => l.map((e) => e.id.replace(/^es-|-err$/g, ''))), appels.posts.length], [['first_name', 'last_name', 'email', 'phone', 'cgv'], 0]);
  await remplir(page, v);
  verifier('carte préparée : dernier écran, Démarrer, sans parrainage', await page.evaluate(() => ({bouton: document.querySelector('.es-envoi').textContent.trim(), parrain: !!document.querySelector('.es-parrain, #es-referral')})), {bouton: 'Démarrer mon essai gratuit', parrain: false});
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 20000});
  const c = appels.posts[0];
  verifier('carte préparée : corps envoyé', [c.account.email, c.business, c.card, 'referral_code' in c, 'logo_png' in c], [v.email, {name: 'La Fusion', activity: 'Restaurant'}, {bg: '#14532d', accent: '#d9b27a', total: 15, reward: 'Dessert offert'}, false, false]);
  verifier('carte préparée : écran « Vérifiez votre boîte mail »', nbsp(await page.$eval('.es-fin', (e) => e.textContent)).includes('La Fusion'), true);
  verifier('carte préparée : aucun appel à l’API des entreprises, sans erreur', [appels.recherche, erreurs], [[], []]);
  await ctx.close();
}
{
  const carte = {nom: 'La Fusion', activite: 'Restaurant', recompense: 'Dessert offert', fond: '#14532d', tampons: '#d9b27a', passages: 10, logo: null, offre: 'starter', qr: {unit: 0, pack5: 0, pack10: 0}};
  const {page, ctx} = await ouvrir({chemin: '/essai/?carte=19k93n5985n294gn', carte, trial: () => ({status: 409, corps: erreur('TRIAL_ALREADY_USED', 'Déjà utilisé.')})});
  await attendrePreparee(page);
  await remplir(page, VISITEUR());
  await envoyer(page);
  await pause(350);
  const r = await page.evaluate(() => ({t: document.querySelector('.pn-alert')?.textContent ?? '', l: document.querySelector('.pn-alert a')?.getAttribute('href') ?? null}));
  verifier('carte préparée, essai déjà pris : 1 essai par personne, choisir son offre', [nbsp(r.t).includes('1 essai par personne'), r.l], [true, '/tarifs/']);
  await ctx.close();
}
{
  // Carte introuvable (lien périmé) : le parcours complet reste disponible
  const {page, ctx} = await ouvrir({chemin: '/essai/?carte=19k93n5985n294gn'});
  await attendreForm(page);
  await pause(300);
  verifier('carte introuvable : parcours complet', (await ecran(page)).etape, 'Étape 1 sur 4');
  await ctx.close();
}

// 9 bis. Deux cartes préparées à la suite dans le même onglet : la seconde, sans logo, ne garde pas celui de la première
{
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const carte = {nom: 'Avec Logo', activite: 'Fleuriste', recompense: 'Bouquet offert', fond: '#14532d', tampons: '#d9b27a', passages: 8, logo: `data:image/png;base64,${pixel}`, offre: 'starter', qr: {unit: 0, pack5: 0, pack10: 0}};
  const {page, ctx} = await ouvrir({chemin: '/essai/?carte=19k93n5985n294gn', carte, avant: () => sessionStorage.setItem('loyna-config-logo', JSON.stringify({logo_png: 'AAAA', icon_png: 'AAAA', nom: 'ancien.png'}))});
  await attendrePreparee(page);
  await pause(400);
  verifier('carte préparée avec logo : le sien', await page.evaluate(() => JSON.parse(sessionStorage.getItem('loyna-config-logo')).nom), 'Logo préparé avec vous');
  await ctx.close();
  const {page: p2, ctx: c2} = await ouvrir({chemin: '/essai/?carte=19k93n5985n294gn', carte: {...carte, logo: null}, avant: () => sessionStorage.setItem('loyna-config-logo', JSON.stringify({logo_png: 'AAAA', icon_png: 'AAAA', nom: 'ancien.png'}))});
  await attendrePreparee(p2);
  await pause(400);
  verifier('carte préparée sans logo : l’ancien est retiré', await p2.evaluate(() => sessionStorage.getItem('loyna-config-logo')), null);
  await c2.close();
}

// 9 ter. Aperçu aux couleurs de la vraie carte ; noms longs (plus d'étape logo depuis le 2026-11-07 : le logo se met dans l'espace client)
{
  const {page, ctx} = await ouvrir();
  await attendreForm(page);
  await choisirMetier(page, 'Café');
  await champ(page, '#es-name', 'Le Comptoir');
  await continuer(page);
  await page.evaluate(() => {
    const i = document.querySelector('input[type=color][aria-label="Couleur de carte personnalisée"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '#ffffff');
    i.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await pause(200);
  const couleurs = () => page.evaluate(() => getComputedStyle(document.querySelector('.es-apercu .cw')).getPropertyValue('--cw-texte'));
  verifier('fond blanc, tampons lisibles : texte dans leur couleur, comme la carte', await couleurs(), '#7a3d1c');
  await retour(page);
  await retour(page);
  await choisirMetier(page, 'Barbier');
  await champ(page, '#es-name', 'L’Été & Cie');
  await pause(100);
  verifier('barbier : cachets aux initiales de la carte', await page.$eval('.es-apercu .cw-sceau', (e) => e.textContent), 'EC');
  // Noms longs : le nom entier dans sa boîte, sur iPhone et sur Android, cadeau sur le dernier tampon
  verifier('dernier tampon : le cadeau', !!(await page.$('.es-apercu .cw-tampons span.fin svg')), true);
  for (const nom of ['Boulangerie Saint Antoine.', 'Coiffure et barbier du vieux port de Sète', 'Salon de coiffure et barbier du Grand Boulevard Saint Anto', 'A'.repeat(60)]) {
    await champ(page, '#es-name', nom);
    await pause(120);
    const mesure = () =>
      page.evaluate(() => {
        const carte = document.querySelector('.es-apercu .cw');
        const n = carte.querySelector('.cw-dessine > span') ?? carte.querySelector('.cw-a-n, .cw-g-n');
        const boite = carte.querySelector('.cw-dessine') ?? n;
        const ok = boite.scrollHeight <= boite.clientHeight + 1 && boite.scrollWidth <= boite.clientWidth + 1;
        return {entier: n.textContent, ok, avertissement: /Nom long/.test(document.body.textContent), debord: carte.scrollWidth - carte.clientWidth};
      });
    verifier(`nom de ${nom.length} caractères, iPhone : entier et dans sa boîte`, await mesure(), {entier: nom, ok: true, avertissement: false, debord: 0});
    if (DOSSIER) await (await page.$('.es-apercu .cw')).screenshot({path: `${DOSSIER}/apercu-apple-${nom.length}.png`});
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Android/.test(x.textContent))?.click());
    await pause(120);
    verifier(`nom de ${nom.length} caractères, Android : entier et dans sa boîte`, await mesure(), {entier: nom, ok: true, avertissement: false, debord: 0});
    if (DOSSIER) await (await page.$('.es-apercu .cw')).screenshot({path: `${DOSSIER}/apercu-google-${nom.length}.png`});
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /iPhone/.test(x.textContent))?.click());
    await pause(80);
  }
  await ctx.close();
}

// 9 quater. Lien de l'e-mail « Activez votre essai » : la page fait choisir le mot de passe, active l'essai et ouvre l'espace client.
//           Auth simulé : /verify (jeton à usage unique), PUT /user (mot de passe) ; rien ne part vers le produit.
for (const [w, h] of [[1366, 900], [390, 844]]) {
  const auth = [];
  const utilisateur = {id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'camille@example.com', email_confirmed_at: new Date().toISOString()};
  const {page, ctx, appels, erreurs} = await ouvrir({
    w,
    h,
    chemin: '/espace-client/mot-de-passe/?token_hash=jeton-essai-123456&type=recovery&essai=1',
    trial: (corps) => (corps.action === 'activate' ? {status: 200, corps: {status: 'ACTIVATED', merchant_id: 'm1', slug: 'le-fournil', join_url: 'https://loyna.fr/join/le-fournil', trial_ends_at: '2026-12-07T10:00:00Z'}} : {status: 400, corps: erreur('INVALID_REQUEST', 'x')}),
    auth: (r) => {
      const chemin = new URL(r.url()).pathname;
      auth.push(`${r.method()} ${chemin}`);
      if (chemin.endsWith('/verify')) return json(r, 200, {access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: utilisateur});
      if (chemin.endsWith('/user')) return json(r, 200, utilisateur);
      return r.abort();
    },
  });
  await page.waitForSelector('input[autocomplete=new-password]', {timeout: 20000});
  verifier(`${w} px : page d'activation, titre et bouton de l'essai`, await page.evaluate(() => [document.querySelector('h1').textContent.trim(), document.querySelector('form button[type=submit]').textContent.trim(), location.search]), ['Choisissez votre mot de passe pour démarrer votre essai', 'Démarrer mon essai', '']);
  const [mdp1, mdp2] = await page.$$('input[autocomplete=new-password]');
  await mdp1.type('Essai-Lien2026');
  await mdp2.type('Essai-Lien2026');
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/activation-${w}.png`, fullPage: w < 980});
  await page.evaluate(() => document.querySelector('form button[type=submit]').click());
  await page.waitForFunction(() => location.pathname === '/espace-client/', {timeout: 20000});
  verifier(`${w} px : jeton vérifié, mot de passe enregistré, essai activé, espace client`, [auth.filter((a) => /verify|PUT/.test(a)), appels.posts.map((c) => c.action)], [['POST /auth/v1/verify', 'PUT /auth/v1/user'], ['activate']]);
  verifier(`${w} px : sans erreur de page`, erreurs, []);
  await ctx.close();
}

// 10. Chaque écran, sur ordinateur et sur téléphone : pas de débordement ; sur téléphone, la carte dans l'écran (nom, récompense)
for (const [w, h] of [[1366, 900], [390, 844], [360, 740]]) {
  const {page, ctx} = await ouvrir({w, h});
  await attendreForm(page);
  const v = VISITEUR();
  const noms = ['1-metier', '2-nom', '3-recompense', '4-coordonnees'];
  const debords = [];
  const minis = [];
  const photo = async (i) => {
    debords.push(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    minis.push(await page.evaluate(() => !!document.querySelector('.es-mini') && document.querySelector('.es-mini').getClientRects().length > 0));
    if (DOSSIER) {
      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo(0, 0); // ce que voit le commerçant en arrivant
      });
      await pause(150);
      await page.screenshot({path: `${DOSSIER}/funnel-${w}-${noms[i]}.png`, fullPage: w < 980});
    }
  };
  await photo(0);
  await choisirMetier(page, 'Boulangerie');
  await page.type('#es-name', v.commerce);
  await photo(1);
  await continuer(page);
  await photo(2);
  await continuer(page);
  for (const [s, x] of [['#es-first_name', v.prenom], ['#es-last_name', v.nom], ['#es-email', v.email], ['#es-phone', v.tel]]) await champ(page, s, x);
  await page.click('#es-cgv');
  await photo(3);
  verifier(`${w} px : aucun écran ne déborde`, debords, [0, 0, 0, 0]);
  verifier(`${w} px : carte dans l’écran (téléphone seulement)`, minis, w < 980 ? [false, true, true, false] : [false, false, false, false]);
  await ctx.close();
}

await b.close();
console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les essais passent.');
process.exit(echecs ? 1 : 0);
