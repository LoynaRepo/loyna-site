// Session de l'espace client (téléphone de caisse, 2026-10-30), serveur de développement sur le port 4322, réseau simulé :
//   - jeton expiré et réseau coupé : pas d'écran de connexion, la session reste, l'espace se rouvre au retour du réseau ;
//   - session vraiment refusée par le serveur : écran de connexion ;
//   - « Se déconnecter » ne ferme que cet appareil (scope=local) ;
//   - mot de passe oublié en libre-service (password-recover), ?oubli=1 ;
//   - essai : activation à l'ouverture de l'espace si elle n'a pas abouti, confirmation d'adresse puis /espace-client/?bienvenue=1.
//   node tools/qa-session.mjs
import puppeteer from 'puppeteer-core';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const CLE = 'loyna-business-auth';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (exp) => `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated', aud: 'authenticated', exp})}.c2ln`;
const maintenant = () => Math.floor(Date.now() / 1000);
const utilisateur = {id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'essai@exemple.fr', app_metadata: {}, user_metadata: {}, created_at: '2026-10-30T00:00:00Z'};
const sessionExpiree = {access_token: jwt(maintenant() - 7200), refresh_token: 'jeton-essai', token_type: 'bearer', expires_in: 3600, expires_at: maintenant() - 7200, user: utilisateur};
const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept-profile, content-profile, prefer', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
let echecs = 0;
const journal = [];
const verifie = (nom, ok) => {
  console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${nom}`);
  if (!ok) echecs++;
};

const navigateur = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--no-sandbox']});
async function ouvrir(mode, adresse = '/espace-client/', reponseEssai = 'ACTIVATED') {
  const contexte = await navigateur.createBrowserContext();
  const page = await contexte.newPage();
  const etat = {mode, logout: [], recover: [], trial: [], memberships: []};
  page.on('console', (m) => journal.push(`console ${m.type()} ${m.text().slice(0, 160)}`));
  page.on('requestfailed', (r) => r.url().includes('supabase') && journal.push(`échec ${r.method()} ${r.url().slice(40, 110)} ${r.failure()?.errorText}`));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (!u.includes('.supabase.co')) return r.continue();
    journal.push(`${etat.mode} ${r.method()} ${u.slice(40, 110)}`);
    if (r.method() === 'OPTIONS') return r.respond({status: 204, headers: CORS});
    if (u.includes('/auth/v1/logout')) {
      etat.logout.push(new URL(u).searchParams.get('scope'));
      return r.respond({status: 204, headers: CORS});
    }
    const json = (corps, status = 200) => r.respond({status, headers: CORS, contentType: 'application/json', body: JSON.stringify(corps)});
    if (u.includes('/functions/v1/password-recover')) {
      etat.recover.push(JSON.parse(r.postData() ?? '{}'));
      return json({status: 'OK'});
    }
    if (u.includes('/auth/v1/verify')) return json({...sessionExpiree, access_token: jwt(maintenant() + 3600), expires_in: 3600, expires_at: maintenant() + 3600, refresh_token: 'jeton-neuf'});
    if (u.includes('/functions/v1/trial')) {
      etat.trial.push({corps: JSON.parse(r.postData() ?? '{}'), jeton: !!r.headers().authorization});
      if (etat.reponseEssai === 'NONE') return json({status: 'NONE'});
      if (etat.reponseEssai === 'TRIAL_FULL') return json({error: {code: 'TRIAL_FULL', message: 'Essais complets.'}}, 409);
      if (etat.reponseEssai === 'COUPURE') return r.abort('internetdisconnected');
      etat.memberships = [{staff_id: 's1', merchant_id: 'm1', merchant_name: 'Commerce essai', merchant_slug: 'commerce-essai', merchant_status: 'ACTIVE', logo_url: null, primary_color: '#121216', secondary_color: '#d9b27a', subscription_plan: 'STARTER', role: 'OWNER', display_name: 'Essai', permissions: ['settings.manage'], features: {}}];
      return json({status: 'ACTIVATED', merchant_id: 'm1', slug: 'commerce-essai', join_url: 'https://loyna.fr/join/commerce-essai', trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString()});
    }
    if (u.includes('/rest/v1/rpc/my_staff_context') && etat.mode === 'essai') return json({user_id: utilisateur.id, is_platform_admin: false, memberships: etat.memberships});
    if (u.includes('/auth/v1/token')) {
      if (etat.mode === 'coupe') return r.abort('internetdisconnected');
      if (etat.mode === 'refus') return r.respond({status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found'})});
      return r.respond({status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({...sessionExpiree, access_token: jwt(maintenant() + 3600), expires_at: maintenant() + 3600, refresh_token: 'jeton-neuf'})});
    }
    // Reste de l'application : indisponible dans cet essai (écran « Connexion interrompue »)
    return r.respond({status: 500, headers: CORS, contentType: 'application/json', body: '{"message":"essai"}'});
  });
  await page.evaluateOnNewDocument((cle, s) => {
    if (!sessionStorage.getItem('qa-pose')) {
      localStorage.setItem(cle, JSON.stringify(s));
      sessionStorage.setItem('qa-pose', '1');
    }
  }, CLE, sessionExpiree);
  await page.setViewport({width: 390, height: 844});
  etat.reponseEssai = reponseEssai;
  await page.goto(`${BASE}${adresse}`, {waitUntil: 'domcontentloaded'});
  return {page, etat, contexte};
}
const texte = (page) => page.evaluate(() => document.body.innerText);
const attendre = (page, f, ...a) =>
  page.waitForFunction(f, {timeout: 40000}, ...a).catch(async (e) => {
    console.log('Écran au moment de l’échec :', (await texte(page)).slice(0, 300).replace(/\s+/g, ' '));
    console.log(journal.slice(-25).join('\n'));
    throw e;
  });

try {
  const {page, etat, contexte} = await ouvrir('coupe');
  await attendre(page, () => document.body.innerText.includes('Connexion impossible'));
  verifie('réseau coupé : message « Connexion impossible »', true);
  verifie('réseau coupé : pas d’écran de connexion', !(await page.$('input[name=email]')));
  verifie('réseau coupé : session gardée dans le navigateur', await page.evaluate((c) => !!localStorage.getItem(c), CLE));
  await page.screenshot({path: 'out/qa-session-hors-ligne.png'});
  etat.mode = 'ok';
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Réessayer')).click());
  await attendre(page, () => !document.body.innerText.includes('Connexion impossible'));
  await attendre(page, () => document.body.innerText.includes('Connexion interrompue'));
  verifie('réseau revenu : l’espace se rouvre sans mot de passe', !(await page.$('input[name=email]')));
  verifie('réseau revenu : jeton renouvelé', await page.evaluate((c) => JSON.parse(localStorage.getItem(c)).refresh_token === 'jeton-neuf', CLE));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Se déconnecter')).click());
  await attendre(page, () => !!document.querySelector('input[name=email]'));
  verifie(`déconnexion limitée à cet appareil (scope=${etat.logout.join(',')})`, etat.logout.length === 1 && etat.logout[0] === 'local');
  await contexte.close();

  const r = await ouvrir('refus');
  await attendre(r.page, () => !!document.querySelector('input[name=email]'));
  verifie('session refusée par le serveur : écran de connexion', !(await texte(r.page)).includes('Connexion impossible'));
  await r.contexte.close();

  // Mot de passe oublié : une adresse, un lien, la même réponse que l'adresse existe ou non
  const oubli = await ouvrir('refus');
  await attendre(oubli.page, () => !!document.querySelector('input[name=email]'));
  await oubli.page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Mot de passe oublié')).click());
  await attendre(oubli.page, () => !!document.querySelector('.login-forgot input'));
  await oubli.page.type('.login-forgot input', 'Essai@Exemple.fr');
  await oubli.page.evaluate(() => [...document.querySelectorAll('.login-forgot button')].find((b) => b.innerText.includes('Recevoir un lien')).click());
  await attendre(oubli.page, () => document.body.innerText.includes('un lien vient de partir'));
  verifie('mot de passe oublié : adresse envoyée à password-recover', oubli.etat.recover.length === 1 && oubli.etat.recover[0].email === 'essai@exemple.fr');
  await oubli.contexte.close();
  const lien = await ouvrir('refus', '/espace-client/?oubli=1');
  await attendre(lien.page, () => !!document.querySelector('.login-forgot input'));
  verifie('?oubli=1 : formulaire déjà ouvert', true);
  await lien.contexte.close();

  // Essai : le commerce se crée à l'ouverture de l'espace si l'activation n'a pas abouti après la confirmation
  const essai = await ouvrir('essai');
  await attendre(essai.page, () => document.body.innerText.includes('Commerce essai'));
  verifie('compte sans commerce : essai activé à l’ouverture de l’espace', essai.etat.trial.length === 1 && essai.etat.trial[0].corps.action === 'activate' && essai.etat.trial[0].jeton);
  await essai.contexte.close();

  // Lien de confirmation : essai activé puis espace client ; compte du panier ; refus ; coupure réseau
  const LIEN = '/espace-client/confirmer/?token_hash=abcdefgh12345678&type=signup';
  const c1 = await ouvrir('essai', LIEN);
  await c1.page.waitForFunction(() => location.search.includes('bienvenue=1'), {timeout: 40000});
  verifie('confirmation avec essai : mène à /espace-client/?bienvenue=1', c1.etat.trial.length >= 1 && c1.etat.trial[0].corps.action === 'activate');
  await c1.contexte.close();
  const c2 = await ouvrir('ok', LIEN, 'NONE');
  await attendre(c2.page, () => document.body.innerText.includes('Adresse confirmée'));
  verifie('confirmation sans essai : texte du panier', (await texte(c2.page)).includes('Votre commande apparaît'));
  verifie('confirmation : le jeton quitte l’adresse', await c2.page.evaluate(() => !location.search.includes('token_hash')));
  await c2.contexte.close();
  const c3 = await ouvrir('ok', LIEN, 'TRIAL_FULL');
  await attendre(c3.page, () => document.body.innerText.includes('complets'));
  verifie('confirmation, essais complets : offres proposées', (await texte(c3.page)).includes('Voir les offres'));
  await c3.contexte.close();
  const c4 = await ouvrir('ok', LIEN, 'COUPURE');
  await attendre(c4.page, () => document.body.innerText.includes('Réessayer'));
  c4.etat.reponseEssai = 'NONE';
  await c4.page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Réessayer')).click());
  await attendre(c4.page, () => document.body.innerText.includes('Votre commande apparaît'));
  verifie('confirmation, réseau coupé : « Réessayer » relance l’activation', c4.etat.trial.length >= 1);
  await c4.contexte.close();

  const m = await navigateur.newPage();
  await m.goto(`${BASE}/espace-client/`, {waitUntil: 'domcontentloaded'});
  const adresse = await m.$eval('link[rel=manifest]', (l) => l.href);
  const manifeste = await (await m.goto(adresse)).json();
  verifie('écran d’accueil : ouvre le scanner, en plein écran', manifeste.start_url === '/espace-client/#/scanner' && manifeste.display === 'standalone');
  await m.close();
  const site = await navigateur.newPage();
  await site.goto(`${BASE}/`, {waitUntil: 'domcontentloaded'});
  verifie('site public : manifeste inchangé', (await site.$eval('link[rel=manifest]', (l) => l.getAttribute('href'))) === '/site.webmanifest');
  await site.close();
} finally {
  await navigateur.close();
}
console.log(echecs ? `${echecs} échec(s)` : 'Tout est bon');
process.exit(echecs ? 1 : 0);
