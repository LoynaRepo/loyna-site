// Essai gratuit, de bout en bout, sur /essai/ :
//   node tools/qa-essai.mjs <base> [dossier de captures]
//     Sans réseau vers le produit : les réponses de la fonction trial, de cartes.php et de l'API des entreprises sont simulées. Vérifie le
//     formulaire, le corps envoyé (contrat du cahier des charges 4.1, sans SIRET depuis le 2026-11-05), chaque code d'erreur, les écrans
//     de fin, essai fermé ou complet, et les deux parcours : /essai/ (1. Votre carte, 2. Votre compte LOYNA) et /essai/?carte=<id>
//     (carte préparée : 1. Votre compte LOYNA, aperçu « 2. Votre carte », « Démarrer mon essai gratuit »).
//     Toute autre requête vers Supabase est bloquée : rien ne peut partir vers la production. L'API des entreprises ne doit plus être appelée.
//   ESSAI_URL=https://<projet d'essai>.supabase.co ESSAI_ANON=… ESSAI_SERVICE=… node tools/qa-essai.mjs --pile <base du site> [dossier]
//     Scénarios S1 et S2 du cahier des charges contre la pile d'essai (2e projet Supabase, site lancé avec PUBLIC_LOYNA_SUPABASE_URL et
//     PUBLIC_LOYNA_SUPABASE_KEY dans .env.local), valeurs générées, adresses @example.com. Refuse de tourner sur le projet de production.
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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

// carte = false : carte préparée, seul le compte est à remplir
async function remplir(page, v, {carte = true} = {}) {
  const champ = async (sel, val) => {
    await page.$eval(sel, (e) => {
      e.focus();
      e.select?.();
    });
    await page.type(sel, val);
  };
  if (carte) {
    await champ('#es-name', v.commerce);
    await page.select('#es-activity', 'Boulangerie');
    await pause(50);
  }
  await champ('#es-first_name', v.prenom);
  await champ('#es-last_name', v.nom);
  await champ('#es-email', v.email);
  await champ('#es-phone', v.tel);
  await champ('#es-password', v.mdp);
  await champ('#es-password2', v.mdp);
  if (!(await page.$eval('#es-cgv', (e) => e.checked))) await page.click('#es-cgv');
}
const envoyer = (page) => page.evaluate(() => document.querySelector('.es-sum button[type=submit]').click());
// Ce que voit le visiteur : titres des étapes dans l'ordre, titre de l'aperçu, bouton, champs présents
const parcours = (page) =>
  page.evaluate(() => ({
    etapes: [...document.querySelectorAll('.pn-step > legend')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()),
    apercu: document.querySelector('.es-sum h2')?.textContent.trim(),
    bouton: document.querySelector('.es-sum button[type=submit]')?.textContent.trim(),
    reglages: ['#es-name', '#es-activity', '#es-reward', '#es-total', 'input[type=file]'].filter((s) => document.querySelector(s)),
    parrainage: !!document.querySelector('#es-referral'),
    siret: /siret/i.test(document.querySelector('form.pn')?.innerHTML ?? ''),
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
  await page.waitForSelector('#es-name', {timeout: 20000});
  verifier('S1 : le configurateur remplit la carte', await page.$eval('#es-name', (e) => e.value), v.commerce);
  await remplir(page, v);
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 30000});
  verifier('S1 : écran « Vérifiez votre boîte mail »', nbsp(await page.$eval('.es-fin h2', (e) => e.textContent)), 'Vérifiez votre boîte mail');
  verifier('S1 : rien de créé avant la confirmation', (await rest(`merchants?select=id&name=eq.${encodeURIComponent(v.commerce)}`)).length, 0);
  const lien = await fetch(`${ESSAI_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {apikey: ESSAI_SERVICE, authorization: `Bearer ${ESSAI_SERVICE}`, 'content-type': 'application/json'},
    body: JSON.stringify({type: 'signup', email: v.email, password: v.mdp}),
  }).then((r) => r.json());
  const jeton = lien.properties?.hashed_token ?? lien.hashed_token;
  await page.goto(`${BASE}/espace-client/confirmer/?token_hash=${jeton}&type=signup`, {waitUntil: 'networkidle0', timeout: 90000});
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
async function ouvrir({w = 1280, h = 900, chemin = '/essai/', ouverture = {open: true}, trial, carte, recherche, avant} = {}) {
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
const attendreForm = (page) => page.waitForSelector('#es-name', {timeout: 20000});
// Carte préparée lue dans cartes.php : le formulaire ne garde que le compte
const attendrePreparee = (page) => page.waitForFunction(() => document.querySelector('.es-sum h2')?.textContent.trim() === '2. Votre carte' && !document.querySelector('#es-name'), {timeout: 20000});

if (!OUVERT) {
  // TRIAL.open = false : la page dit que l'essai n'est pas ouvert, sans appeler le serveur
  const {page, ctx, appels, erreurs} = await ouvrir();
  await page.waitForSelector('.es-fin', {timeout: 20000});
  verifier('essai fermé au build : aucun appel, pas de formulaire', [appels.get, !!(await page.$('#es-name'))], [0, false]);
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
  verifier(`GET trial ${nom} : titre, pas de formulaire`, [nbsp(await page.$eval('.es-fin h2', (e) => e.textContent)), !!(await page.$('#es-name'))], [titre, false]);
  verifier(`GET trial ${nom} : liens`, await page.$$eval('.es-fin a', (l) => l.map((a) => a.getAttribute('href'))), ['/tarifs/?carte=1', '/creer-ma-carte/#send-preview']);
  await ctx.close();
}

// 2. Le brouillon du configurateur et le logo passent à l'essai ; la carte de l'aperçu suit le formulaire
{
  const {page, ctx, erreurs} = await ouvrir({
    avant: () => {
      localStorage.setItem('loyna-config', JSON.stringify({name: 'Chez Nina', activity: 'Pizzeria', bg: '#14532d', accent: '#ffd166', total: 8, filled: 3, reward: 'Pizza offerte', variant: 'apple', touche: {reward: true, bg: true, accent: false}}));
      const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      sessionStorage.setItem('loyna-config-logo', JSON.stringify({logo_png: pixel, icon_png: pixel, nom: 'logo.png'}));
    },
  });
  await attendreForm(page);
  const v = await page.evaluate(() => ({nom: document.querySelector('#es-name').value, act: document.querySelector('#es-activity').value, rec: document.querySelector('#es-reward').value, passages: document.querySelector('#es-total').value, apercu: document.querySelector('.es-apercu .cw-a-n').textContent, logo: !!document.querySelector('.es-apercu .cw-logo img')}));
  verifier('brouillon du configurateur repris, logo compris', v, {nom: 'Chez Nina', act: 'Pizzeria', rec: 'Pizza offerte', passages: '8', apercu: 'Chez Nina', logo: true});
  await page.$eval('#es-name', (e) => e.select());
  await page.type('#es-name', 'Roma');
  verifier('l’aperçu suit le nom', await page.$eval('.es-apercu .cw-a-n', (e) => e.textContent), 'Roma');
  await page.evaluate(() => document.querySelector('.es-sum .pn-prep-sys button:last-child').click());
  await pause(100);
  verifier('aperçu Android', !!(await page.$('.es-apercu .cw--google')), true);
  verifier('pas d’erreur de page', erreurs, []);
  await ctx.close();
}

// 3. Un changement d'activité apporte le modèle du métier, sauf ce que le visiteur a modifié
{
  const {page, ctx} = await ouvrir();
  await attendreForm(page);
  await page.select('#es-activity', 'Boulangerie');
  await pause(80);
  const a = await page.evaluate(() => ({rec: document.querySelector('#es-reward').value, fond: getComputedStyle(document.querySelector('.es-apercu .cw')).getPropertyValue('--cw-fond')}));
  verifier('activité : récompense et couleur du métier', a, {rec: 'Viennoiserie offerte', fond: '#7a3d1c'});
  await page.$eval('#es-reward', (e) => e.select());
  await page.type('#es-reward', 'Un pain offert');
  await page.select('#es-activity', 'Fleuriste');
  await pause(80);
  verifier('récompense modifiée : gardée', await page.$eval('#es-reward', (e) => e.value), 'Un pain offert');
  await page.select('#es-activity', 'Autre');
  await pause(80);
  verifier('activité « Autre » : champ libre', !!(await page.$('#es-activity-autre')), true);
  await ctx.close();
}

// 4. Contrôles du formulaire, sans appel au serveur
{
  const {page, ctx, appels} = await ouvrir();
  await attendreForm(page);
  await envoyer(page);
  await pause(120);
  const champs = await page.$$eval('.pn-err', (l) => l.map((e) => e.id.replace(/^es-|-err$/g, '')));
  verifier('tout est signalé, rien ne part', [champs, appels.posts.length], [['name', 'activity', 'reward', 'first_name', 'last_name', 'email', 'phone', 'password', 'cgv'], 0]);
  verifier('le premier champ en erreur prend le focus', await page.evaluate(() => document.activeElement?.id), 'es-name');
  await ctx.close();
}

// 5. Parcours sans carte préparée : 1. Votre carte (tous les réglages), 2. Votre compte LOYNA, parrainage ; plus de SIRET
{
  const {page, ctx} = await ouvrir();
  await attendreForm(page);
  verifier('/essai/ : carte puis compte, réglages et parrainage, sans SIRET', await parcours(page), {
    etapes: ['1 Votre carte', '2 Votre compte LOYNA'],
    apercu: 'Votre carte',
    bouton: 'Essayer 1 mois gratuitement',
    reglages: ['#es-name', '#es-activity', '#es-reward', '#es-total', 'input[type=file]'],
    parrainage: true,
    siret: false,
  });
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
  await envoyer(page);
  await page.waitForSelector('.es-fin', {timeout: 20000});
  const c = appels.posts[0];
  verifier('corps : action, compte', [c.action, c.account], ['start', {email: v.email, password: v.mdp, first_name: v.prenom, last_name: v.nom, phone: v.tel}]);
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
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/essai-confirmer.png`});
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

// 8. Chaque code d'erreur du contrat
for (const [code, attendu] of [
  ['TRIAL_ALREADY_USED', {zone: 'alerte', texte: '1 essai par personne', lien: '/tarifs/'}],
  ['ACCOUNT_EXISTS', {zone: 'alerte', texte: 'indiquez son mot de passe', lien: '/espace-client/?oubli=1'}],
  ['ACCOUNT_HAS_MERCHANT', {zone: 'alerte', texte: 'a déjà un commerce', lien: '/espace-client/'}],
  ['RATE_LIMITED', {zone: 'alerte', texte: 'réessayez dans une heure', lien: null}],
  ['INVALID_REQUEST', {zone: 'alerte', texte: 'Demande refusée', lien: null}],
  ['REFERRAL_INVALID', {zone: 'referral', texte: 'Code inconnu'}],
  ['WEAK_PASSWORD', {zone: 'password', texte: 'trop faible'}],
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

// 9. Carte préparée dans le panel (/essai/?carte=<id>) : 1. Votre compte LOYNA, aperçu « 2. Votre carte », « Démarrer mon essai gratuit ».
//    Ni réglage de la carte ni parrainage ; ancienne fiche en premium comprise : nombre de passages ramené à 15 dans le corps envoyé.
{
  const carte = {nom: 'La Fusion', activite: 'Restaurant', recompense: 'Dessert offert', fond: '#14532d', tampons: '#d9b27a', passages: 20, logo: null, offre: 'premium', periode: 'mensuel', qr: {unit: 1, pack5: 0, pack10: 0}};
  const v = VISITEUR();
  const {page, ctx, appels, erreurs} = await ouvrir({chemin: '/essai/?carte=19k93n5985n294gn', carte});
  await attendrePreparee(page);
  verifier('carte préparée : compte seul, puis aperçu et Démarrer, sans SIRET', await parcours(page), {
    etapes: ['1 Votre compte LOYNA'],
    apercu: '2. Votre carte',
    bouton: 'Démarrer mon essai gratuit',
    reglages: [],
    parrainage: false,
    siret: false,
  });
  verifier('carte préparée : l’aperçu montre la carte', [await page.$eval('.es-apercu .cw-a-n', (e) => e.textContent), /Votre carte est prête/.test(await page.$eval('.pn-intro', (e) => e.textContent))], ['La Fusion', true]);
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/essai-carte-preparee.png`, fullPage: true});
  await envoyer(page);
  await pause(120);
  verifier('carte préparée : contrôles du compte seulement, rien ne part', [await page.$$eval('.pn-err', (l) => l.map((e) => e.id.replace(/^es-|-err$/g, ''))), appels.posts.length], [['first_name', 'last_name', 'email', 'phone', 'password', 'cgv'], 0]);
  await remplir(page, v, {carte: false});
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
  await remplir(page, VISITEUR(), {carte: false});
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
  verifier('carte introuvable : parcours complet', (await parcours(page)).etapes, ['1 Votre carte', '2 Votre compte LOYNA']);
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

// 9 ter. Logo : refus en français, carré pour Google, peu visible signalé ; nom sans lettre refusé ; aperçu aux couleurs de la vraie carte
{
  const dir = fs.mkdtempSync(`${os.tmpdir()}/qa-essai-`);
  const svg = (nom, corps) => {
    const f = `${dir}/${nom}.svg`;
    fs.writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" ${corps}</svg>`);
    return f;
  };
  const {page, ctx, appels} = await ouvrir();
  await attendreForm(page);
  const choisir = async (f) => {
    await (await page.$('input[type=file]')).uploadFile(f);
    await pause(500);
    return nbsp(await page.$eval('.es-logo', (e) => e.textContent));
  };
  // Fond uni retiré à l'envoi, et retour au fond d'origine
  const coinDuLogo = () =>
    page.evaluate(async () => {
      const garde = JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => /logo/i.test(k))));
      const i = new Image();
      i.src = `data:image/png;base64,${garde.logo_png}`;
      await i.decode();
      const c = document.createElement('canvas');
      c.width = i.width;
      c.height = i.height;
      const x = c.getContext('2d');
      x.drawImage(i, 0, 0);
      return x.getImageData(5, 5, 1, 1).data[3];
    });
  await choisir(svg('fond', 'width="600" height="600"><rect width="600" height="600" fill="#fdfdfb"/><circle cx="300" cy="300" r="120" fill="#b8935a"/>'));
  verifier('logo sur fond uni : fond retiré', await coinDuLogo(), 0);
  verifier('logo sur fond uni : le commerçant est prévenu', /a été retiré/.test(await page.$eval('.es-logo-fond', (e) => e.textContent)), true);
  await page.click('.es-logo-fond button');
  await pause(500);
  verifier('garder le fond d’origine : fond revenu', await coinDuLogo(), 255);
  verifier('garder le fond d’origine : indiqué', /gardé/.test(await page.$eval('.es-logo-fond', (e) => e.textContent)), true);
  await page.click('.es-logo .pn-link');
  await pause(100);
  verifier('SVG avec HTML : message en français', /ne peut pas être convertie/.test(await choisir(svg('html', 'viewBox="0 0 9 9"><foreignObject width="9" height="9"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'))), true);
  await choisir(svg('script', 'viewBox="0 0 400 40" onload="window.__pwn=1"><script>window.__pwn=1</script><rect width="400" height="40" fill="#fff"/>'));
  verifier('SVG avec script : script non exécuté', await page.evaluate(() => window.__pwn ?? null), null);
  const taille = await page.evaluate(async () => {
    const g = JSON.parse(sessionStorage.getItem('loyna-config-logo'));
    const lire = (b) => new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
      i.src = `data:image/png;base64,${b}`;
    });
    return {logo: await lire(g.logo_png), icone: await lire(g.icon_png)};
  });
  verifier('logo large : carré pour Google, proportions gardées pour Apple', taille, {logo: [660, 660], icone: [320, 32]});
  await pause(300);
  await page.select('#es-activity', 'Café');
  await page.evaluate(() => {
    const i = document.querySelector('input[type=color][aria-label="Couleur de carte personnalisée"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '#ffffff');
    i.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await pause(400);
  verifier('logo blanc sur carte blanche : signalé', !!(await page.$('.es-logo-alerte')), true);
  const couleurs = () => page.evaluate(() => getComputedStyle(document.querySelector('.es-apercu .cw')).getPropertyValue('--cw-texte'));
  verifier('fond blanc, tampons lisibles : texte dans leur couleur, comme la carte', await couleurs(), '#7a3d1c');
  await page.select('#es-activity', 'Barbier');
  await pause(80);
  await page.$eval('#es-name', (e) => e.focus());
  await page.keyboard.type('🍕🍕');
  await envoyer(page);
  await pause(150);
  verifier('nom sans lettre : refusé, rien ne part', [/lettre de notre alphabet/.test(await page.$eval('#es-name-err', (e) => e.textContent)), appels.posts.length], [true, 0]);
  await page.$eval('#es-name', (e) => e.select());
  await page.keyboard.type("L'Été & Cie");
  await pause(100);
  verifier('barbier : cachets aux initiales de la carte', await page.$eval('.es-apercu .cw-sceau', (e) => e.textContent), 'EC');
  // Noms longs : plus d'avertissement, le nom entier dans sa boîte, sur iPhone et sur Android, cadeau sur le dernier tampon
  verifier('dernier tampon : le cadeau', !!(await page.$('.es-apercu .cw-tampons span.fin svg')), true);
  for (const nom of ['Boulangerie Saint Antoine.', 'Coiffure et barbier du vieux port de Sète', 'Salon de coiffure et barbier du Grand Boulevard Saint Anto', 'A'.repeat(60)]) {
    await page.$eval('#es-name', (e) => e.select());
    await page.keyboard.type(nom);
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

// 10. Téléphone : pas de débordement, aperçu visible
for (const w of [360, 390]) {
  const {page, ctx} = await ouvrir({w, h: 800});
  await attendreForm(page);
  const r = await page.evaluate(() => ({debord: document.documentElement.scrollWidth - innerWidth, mini: !!document.querySelector('.es-mini .cw') && document.querySelector('.es-mini').getClientRects().length > 0}));
  verifier(`${w} px : sans débordement, carte en haut du formulaire`, r, {debord: 0, mini: true});
  if (DOSSIER) await page.screenshot({path: `${DOSSIER}/essai-${w}.png`, fullPage: true});
  await ctx.close();
}

await b.close();
console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les essais passent.');
process.exit(echecs ? 1 : 0);
