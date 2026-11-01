// Parcours de la refonte, de bout en bout : node tools/qa-parcours.mjs <base> [dossier de captures]
// Prix affichés (sans engagement, avec engagement), phrases fixes et anciens montants sur /tarifs/, bandeau (les deux offres, leurs liens, l'ancre du parrainage), nombre de clients, essai du héros,
// essai du configurateur de l'accueil, aperçus iPhone et Android, panier (engagement, anciens liens, ?carte=<id> avec une réponse simulée de cartes.php), vidéo en surimpression, menu du téléphone,
// erreurs de console sur toutes les pages. Lit TRIAL.open dans src/data/site.ts : les boutons attendus suivent cet interrupteur.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const [BASE = 'http://127.0.0.1:4332', DOSSIER] = process.argv.slice(2);
if (DOSSIER) fs.mkdirSync(DOSSIER, {recursive: true});
const b = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']});
let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
};
const nbsp = (s) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const SOURCE_SITE = fs.readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const ESSAI = /export const TRIAL = \{open: true/.test(SOURCE_SITE);
const APPEL = ESSAI ? ['Essayer 1 mois gratuitement', '/essai/'] : ['Choisir mon offre', '/tarifs/'];
const AVEC_ESSAI = ESSAI ? ['/essai/'] : [];
// Phrases fixes du cahier des charges (1.2 et 1.7), au mot près
const PHRASES = [
  'La carte complète, sans limite de clients, avec les messages qui partent tout seuls.',
  'Vos clients invitent leurs amis, LOYNA écrit vos messages.',
  'Pour 20 € de plus par mois, 17 € avec engagement, vos clients invitent leurs amis et LOYNA écrit vos messages à votre place : vous n’avez plus qu’à valider.',
  '29 € par mois, sans TVA, sans engagement : vous arrêtez à la fin de n’importe quel mois. Ou 24,65 € par mois avec 12 mois d’engagement, réglés chaque mois.',
  '49 € par mois, sans TVA, sans engagement : vous arrêtez à la fin de n’importe quel mois. Ou 41,65 € par mois avec 12 mois d’engagement, réglés chaque mois.',
  'Avec 12 mois d’engagement : 15 % de moins, réglé chaque mois, rien d’avance. Sortie possible si votre commerce ferme, sur justificatif de radiation. Après les 12 mois : même prix, résiliable à la fin de n’importe quel mois, sans nouvelle durée.',
  'Si l’abonnement s’arrête ou si un paiement reste impayé 15 jours, la carte reste dans le téléphone de vos clients mais elle ne crédite plus, et les inscriptions et les messages s’arrêtent. Tout repart automatiquement dès que le paiement passe ou que l’abonnement est repris, avec vos clients et leurs soldes. Sans reprise, vos données sont supprimées 90 jours après l’arrêt.',
  'Offerte jusqu’au 31 décembre 2026. Ensuite : offerte avec 12 mois d’engagement, 49 € une seule fois sans engagement.',
  ...(ESSAI ? ['1 mois gratuit, sans carte bancaire. Votre carte est créée tout de suite à partir de vos réglages et du modèle de votre métier. 1 essai par commerce.'] : []),
];
const ANCIENS = /Premium|39,99|407,90|295,80|907,80|89 €|2 000 cartes|4,99|50,90|en annuel|paiement annuel|en mensuel|en un clic|essai gratuit interdit/;
async function ouvrir(w, h, chemin, avantNav) {
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({width: w, height: h, isMobile: w < 600, hasTouch: w < 600});
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('loyna-consent', JSON.stringify({ok: false, t: Date.now()}));
    } catch {}
  });
  if (avantNav) await avantNav(page);
  await page.goto(BASE + chemin, {waitUntil: 'networkidle0', timeout: 90000});
  return {page, ctx};
}

for (const [w, h] of [[1280, 900], [375, 812]]) {
  console.log(`\n--- ${w} px ---`);
  // Prix, depuis la source unique, sur l'accueil et les tarifs, sans engagement et avec engagement
  for (const chemin of ['/', '/tarifs/']) {
    const {page, ctx} = await ouvrir(w, h, chemin);
    const prix = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.plans .plan')].map((p) => ({
          nom: p.querySelector('.plan-name').textContent,
          amount: [...p.querySelectorAll('.price')].find((x) => getComputedStyle(x).display !== 'none').querySelector('.amount').textContent,
          liens: [...p.querySelectorAll('a.btn')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.getAttribute('href')),
        })),
      );
    const m = (await prix()).map((p) => [p.nom, nbsp(p.amount), p.liens]);
    verifier(`${chemin} sans engagement`, m, [
      ['Starter', '29 €', [...AVEC_ESSAI, '/panier/?offre=starter&engagement=0']],
      ['Pro', '49 €', ['/panier/?offre=pro&engagement=0']],
    ]);
    await page.evaluate(() => document.querySelector('.toggle input.engage-choix').click());
    const a = (await prix()).map((p) => [p.nom, nbsp(p.amount), p.liens]);
    verifier(`${chemin} avec engagement`, a, [
      ['Starter', '24,65 €', [...AVEC_ESSAI, '/panier/?offre=starter&engagement=1']],
      ['Pro', '41,65 €', ['/panier/?offre=pro&engagement=1']],
    ]);
    if (chemin === '/tarifs/') {
      const texte = nbsp(await page.evaluate(() => document.querySelector('main').textContent));
      verifier('/tarifs/ : phrases fixes, au mot près', PHRASES.filter((p) => !texte.includes(p)), []);
      verifier('/tarifs/ : aucun ancien montant ni ancienne offre', ANCIENS.exec(texte)?.[0] ?? null, null);
      verifier('/tarifs/ : comparateur à 2 colonnes', await page.evaluate(() => [...new Set([...document.querySelectorAll('.compare tbody tr:not(.grp)')].map((l) => l.querySelectorAll('td').length))]), [2]);
      verifier('/tarifs/ : sections', await page.evaluate(() => ['essai', 'engagement', 'arret', 'mise-en-service'].filter((i) => !document.getElementById(i))), ESSAI ? [] : ['essai']);
    }
    if (chemin === '/') {
      const liens = await page.evaluate(() => [...document.querySelectorAll('.marquee .mq-lien')].map((a) => [a.textContent, a.getAttribute('href')]));
      verifier('bandeau : les deux offres, chacune avec son lien', liens.map(([t, h]) => [nbsp(t), h]), [
        ['Offre de lancement : mise en service offerte (au lieu de 49 €) jusqu’au 31 décembre 2026, code LANCEMENT2026. J’en profite', '/tarifs/'],
        ['Parrainez un commerçant : 1 mois offert à chacun. Comment ça marche', '/faq/#parrainage-loyna'],
      ]);
      // Ce que le doigt ou la souris touche sur la piste : chaque message mène à son lien, sur toute la hauteur du bandeau
      const cibles = await page.evaluate(() => {
        const m = document.querySelector('.marquee');
        const a = m.querySelector('.mq-piste').getAnimations()[0];
        a.pause();
        const hb = m.getBoundingClientRect();
        const res = {};
        for (const href of ['/tarifs/', '/faq/#parrainage-loyna']) {
          a.currentTime = 0;
          const msg = m.querySelector(`.mq-msg[href="${href}"]`);
          const groupe = m.querySelector('.mq-groupe').getBoundingClientRect().width;
          const debut = msg.getBoundingClientRect().left - m.querySelector('.mq-piste').getBoundingClientRect().left;
          a.currentTime = (debut / groupe) * a.effect.getComputedTiming().duration;
          res[href] = [hb.top + 1, hb.top + hb.height / 2, hb.bottom - 1].map((y) => document.elementFromPoint(60, y)?.closest('a')?.getAttribute('href') ?? null);
        }
        a.currentTime = 0;
        a.play();
        return res;
      });
      verifier('bandeau : la zone touchée mène au bon lien', cibles, {'/tarifs/': ['/tarifs/', '/tarifs/', '/tarifs/'], '/faq/#parrainage-loyna': ['/faq/#parrainage-loyna', '/faq/#parrainage-loyna', '/faq/#parrainage-loyna']});
      // Bloc « Ils nous font confiance » : le vrai nombre de src/data/site.ts, masqué sous le seuil
      const [, commerces, seuil] = /export const CLIENTS = \{\s*commerces: (\d+),[^\n]*\s*seuil: (\d+),/.exec(SOURCE_SITE);
      const bloc = await page.evaluate(() => [...document.querySelectorAll('.conf-clients > p')].map((p) => p.textContent));
      verifier('accueil : nombre de clients', bloc.map(nbsp), Number(commerces) >= Number(seuil) ? ['Ils nous font confiance', `${commerces} ${Number(commerces) > 1 ? 'commerces ont' : 'commerce a'} choisi LOYNA`] : []);
      verifier('accueil : rangée des faits', await page.evaluate(() => document.querySelectorAll('.faits .fait').length), 4);
      // Haut de page crème et maquettes signalées comme exemples (Ewan, 2026-10-31), bouton de l'en-tête : l'appel principal (cahier des charges 4.4)
      const choix = await page.evaluate(() => {
        const bouton = document.querySelector('.site-header .actions .btn');
        return {
          fond: getComputedStyle(document.getElementById('hero')).backgroundColor,
          bouton: [bouton.textContent.trim(), bouton.getAttribute('href')],
          tableau: document.querySelector('.fenetre.mock .fenetre-barre span').textContent,
          notifications: document.querySelector('.atout--inverse .atout-legende').textContent,
          proximite: document.querySelector('#proximite .atout-legende').textContent,
        };
      });
      verifier('accueil : choix validés', {...choix, notifications: nbsp(choix.notifications), proximite: nbsp(choix.proximite)}, {fond: 'rgb(247, 241, 230)', bouton: APPEL, tableau: 'LOYNA Business · données d’exemple', notifications: 'Exemple : commerce et prénom fictifs', proximite: 'Exemple : commerce fictif'});
    }
    verifier(`${chemin} pas de défilement horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await ctx.close();
  }

  // Bandeau → page qui explique le parrainage : l'ancre existe et son titre n'est pas caché par l'en-tête fixe
  {
    const {page, ctx} = await ouvrir(w, h, '/');
    const lien = await page.evaluate(() => document.querySelector('.marquee .mq-msg[href*="parrainage"]').getAttribute('href'));
    await page.goto(BASE + lien, {waitUntil: 'networkidle0', timeout: 90000});
    await new Promise((r) => setTimeout(r, 900)); // défilement doux jusqu'à l'ancre
    const f = await page.evaluate(() => {
      const t = document.querySelector('#parrainage-loyna h2');
      return {titre: t?.textContent, questions: document.querySelectorAll('#parrainage-loyna details').length, visible: t ? t.getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom && t.getBoundingClientRect().bottom <= innerHeight : false};
    });
    verifier('bandeau : l’ancre du parrainage est dans la FAQ, sous l’en-tête', f, {titre: 'Parrainage LOYNA', questions: 3, visible: true});
    await ctx.close();
  }

  // Essai du héros : le nom passe au configurateur
  {
    const {page, ctx} = await ouvrir(w, h, '/');
    await page.type('#try-name', 'Le Fournil');
    const carte = await page.evaluate(() => [...document.querySelectorAll('#hero .wcard.live')].map((c) => c.querySelector('.wc-name strong').textContent));
    verifier('héros : la carte prend le nom tapé', [...new Set(carte)], ['Le Fournil']);
    await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0'}), page.click('#try button[type=submit]')]);
    verifier('héros : ouvre le configurateur', [new URL(page.url()).pathname, new URL(page.url()).searchParams.get('nom')], ['/creer-ma-carte/', 'Le Fournil']);
    verifier('héros : nom repris', await page.$eval('#c-name', (e) => e.value), 'Le Fournil');
    await ctx.close();
  }

  // Essai du configurateur de l'accueil : activité, couleurs, puis configurateur
  {
    const {page, ctx} = await ouvrir(w, h, '/');
    await page.$eval('#mc-nom', (e) => {
      e.value = 'Chez Nina';
      e.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await page.select('#mc-activite', 'Pizzeria');
    await page.$eval('#mc-activite', (e) => e.dispatchEvent(new Event('input', {bubbles: true})));
    const c1 = await page.evaluate(() => {
      const c = document.querySelector('.mc-carte');
      return {nom: c.querySelector('.wc-name strong').textContent, act: c.querySelector('.wc-name small').textContent, rec: c.querySelector('.wc-reward span').textContent, fond: c.style.getPropertyValue('--bg'), tampons: c.style.getPropertyValue('--accent')};
    });
    verifier('accueil : la carte suit nom et activité', c1, {nom: 'Chez Nina', act: 'Pizzeria', rec: 'Pizza offerte', fond: '#9b1c1c', tampons: '#ffd166'});
    await page.evaluate(() => document.querySelector('#mini-config .swatches[data-target="bg"] .sw[data-color="#14532d"]').click());
    verifier('accueil : couleur choisie', await page.$eval('.mc-carte', (c) => c.style.getPropertyValue('--bg')), '#14532d');
    await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0'}), page.evaluate(() => document.querySelector('#mc-form button[type=submit]').click())]);
    const cfg = await page.evaluate(() => ({nom: document.querySelector('#c-name').value, act: document.querySelector('#c-activity').value, rec: document.querySelector('#c-reward').value, fond: document.querySelector('#c-bg').value, tampons: document.querySelector('#c-accent').value}));
    verifier('accueil → configurateur : réglages repris', cfg, {nom: 'Chez Nina', act: 'Pizzeria', rec: 'Pizza offerte', fond: '#14532d', tampons: '#ffd166'});
    await ctx.close();
  }

  // Configurateur : lien d'un e-mail, couleurs, aperçus iPhone et Android
  {
    const {page, ctx} = await ouvrir(w, h, '/creer-ma-carte/?nom=Le%20Fournil&activite=Boulangerie');
    const etat = () =>
      page.evaluate(() => {
        const c = document.querySelector('#card-slot .wcard');
        return {nom: c.querySelector('.wc-name strong').textContent, act: c.querySelector('.wc-name small').textContent, rec: c.querySelector('.wc-reward span').textContent, fond: c.style.getPropertyValue('--bg'), tampons: c.style.getPropertyValue('--accent'), google: c.classList.contains('wcard--google'), titre: document.querySelector('#wallet-title').textContent};
      });
    verifier('lien e-mail : carte réglée', await etat(), {nom: 'Le Fournil', act: 'Boulangerie', rec: 'Viennoiserie offerte', fond: '#7a3d1c', tampons: '#f2c879', google: false, titre: 'Wallet'});
    if (DOSSIER) await page.screenshot({path: `${DOSSIER}/configurateur-iphone-${w}.png`});
    await page.evaluate(() => document.querySelector('.swatches[data-target="bg"] .sw[data-color="#1e3a5f"]').click());
    await page.evaluate(() => document.querySelector('.swatches[data-target="accent"] .sw[data-color="#7dd3fc"]').click());
    await page.evaluate(() => document.querySelector('#v-google').click());
    const e2 = await etat();
    verifier('couleurs et aperçu Android', [e2.fond, e2.tampons, e2.google, e2.titre], ['#1e3a5f', '#7dd3fc', true, 'Google Wallet']);
    if (DOSSIER) await page.screenshot({path: `${DOSSIER}/configurateur-android-${w}.png`});
    // « Je veux cette carte » → tarifs, avec le rappel de la carte
    await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0'}), page.evaluate(() => document.querySelector('#go-plans').click())]);
    verifier('Je veux cette carte → tarifs', [new URL(page.url()).pathname, await page.$eval('#mc-name', (e) => e.textContent), await page.$eval('#ma-carte', (e) => e.hidden)], ['/tarifs/', '« Le Fournil »', false]);
    // Choisir une offre → panier
    await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0'}), page.evaluate(() => document.querySelector('.plan--hl a.btn.only-s').click())]);
    verifier('Choisir Starter → panier', [new URL(page.url()).pathname, new URL(page.url()).search], ['/panier/', '?offre=starter&engagement=0']);
    await page.waitForSelector('.pn-sum, #pn-sum-t', {timeout: 15000});
    const recap = () => page.evaluate(() => document.querySelector('#pn-sum-t').closest('aside, section, div').textContent);
    const r1 = nbsp(await recap());
    verifier('panier : Starter et 29 € au récapitulatif', [/Starter/.test(r1), /29 €/.test(r1), /sans engagement/.test(r1)], [true, true, true]);
    if (DOSSIER) await page.screenshot({path: `${DOSSIER}/panier-${w}.png`});
    // Bascule d'engagement : prix, adresse, rappel
    await page.evaluate(() => document.querySelector('.pn-period input[value="engage"]').click());
    await new Promise((r) => setTimeout(r, 150));
    const r2 = nbsp(await recap());
    verifier('panier : avec engagement, 24,65 € et adresse à jour', [/24,65 €/.test(r2), /12 mois d’engagement/.test(r2), new URL(page.url()).searchParams.get('engagement')], [true, true, '1']);
    await ctx.close();
  }

  // Anciens liens déjà envoyés : jamais de page blanche, ni de prix différent sans le dire
  for (const [lien, nom, prixAttendu, avis] of [
    ['/panier/?offre=premium&periode=mensuel', 'Starter', '29 €', true],
    ['/panier/?offre=premium&periode=annuel', 'Starter', '24,65 €', true],
    ['/panier/?offre=pro&periode=annuel', 'Pro', '41,65 €', false],
    ['/panier/?offre=starter&periode=mensuel', 'Starter', '29 €', false],
  ]) {
    const {page, ctx} = await ouvrir(w, h, lien);
    await page.waitForSelector('#pn-sum-t', {timeout: 15000});
    const r = nbsp(await page.evaluate(() => document.querySelector('.pn-sum').textContent));
    const texteAvis = await page.evaluate(() => document.querySelector('.pn-avis')?.textContent ?? null);
    verifier(`ancien lien ${lien}`, [r.includes(`LOYNA ${nom}`), r.includes(prixAttendu), texteAvis ? nbsp(texteAvis) : null], [true, true, avis ? 'L’offre Premium n’est plus proposée. Voici l’offre Starter, qui reprend ses automatisations.' : null]);
    await ctx.close();
  }

  // Panier avec une carte préparée (?carte=<id>) : réponse de cartes.php simulée, ce PC n'a pas PHP
  {
    const {page, ctx} = await ouvrir(w, h, '/panier/?carte=19k93n5985n294gn', async (p) => {
      await p.setRequestInterception(true);
      p.on('request', (r) => {
        if (r.url().includes('/espace-commercial/cartes.php')) {
          r.respond({status: 200, contentType: 'application/json', body: JSON.stringify({carte: {nom: 'La Fusion', activite: 'Restaurant', recompense: 'Dessert offert', fond: '#14532d', tampons: '#d9b27a', passages: 8, logo: null, offre: 'premium', periode: 'mensuel', qr: {unit: 1, pack5: 0, pack10: 0}}})});
        } else r.continue();
      });
    });
    await new Promise((r) => setTimeout(r, 1200));
    const t = nbsp(await page.evaluate(() => document.querySelector('main').innerText));
    verifier('panier ?carte= en premium : la carte, Starter et l’avis, sans page blanche', [/La Fusion/.test(t), /LOYNA Starter/.test(t), /L’offre Premium n’est plus proposée/.test(t)], [true, true, true]);
    if (DOSSIER) await page.screenshot({path: `${DOSSIER}/panier-carte-${w}.png`, fullPage: true});
    await ctx.close();
  }

  // Abonnement pris depuis l'espace client (?commerce=<id>) : session et réponses du produit simulées, rien ne part vers Supabase
  if (w >= 600) {
    const commerce = '11111111-2222-4333-8444-555555555555';
    const fin = new Date(Date.now() + 12 * 86400000).toISOString();
    let corps = null;
    const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
    const {page, ctx} = await ouvrir(w, h, `/panier/?offre=starter&engagement=0&commerce=${commerce}`, async (p) => {
      await p.evaluateOnNewDocument(() => {
        localStorage.setItem('loyna-business-auth', JSON.stringify({access_token: 'jeton.de.essai', refresh_token: 'r', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: {id: 'u1', email: 'essai@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
      });
      await p.setRequestInterception(true);
      p.on('request', (r) => {
        const u = r.url();
        const rep = (o) => r.respond({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(o)});
        if (u.includes('.supabase.co') && r.method() === 'OPTIONS') return r.respond({status: 204, headers: CORS});
        if (u.includes('/rpc/my_service_state')) return rep({state: 'TRIAL', plan: 'STARTER', trial_ends_at: fin, trial_days_left: 12, stop_reason: null});
        if (u.includes('/functions/v1/checkout-create')) {
          corps = JSON.parse(r.postData());
          return rep({status: 'OK', url: `${BASE}/merci/?offre=starter-mensuel&session_id=cs_test_aaaaaaaaaaaa&compte=1`, account: {id: 'u1', email: 'essai@example.com', created: false, confirmation_sent: false}});
        }
        if (u.includes('.supabase.co')) return r.abort();
        r.continue();
      });
    });
    await page.waitForFunction(() => /Votre essai court jusqu/.test(document.querySelector('.pn-sum')?.textContent ?? ''), {timeout: 20000});
    const t = nbsp(await page.evaluate(() => document.querySelector('.pn').innerText));
    verifier('reprise : pas de compte à créer, session reconnue', [!!(await page.$('#pn-first_name')), t.includes('essai@example.com')], [false, true]);
    verifier('reprise : essai en cours écrit avant le paiement', /Votre essai court jusqu’au .*\. Le premier paiement a lieu aujourd’hui : il vous reste 12 jours gratuits, ils ne sont pas reportés\./.test(t), true);
    await page.click('#pn-cgv');
    await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0', timeout: 60000}), page.evaluate(() => document.querySelector('.pn-sum button[type=submit]').click())]);
    verifier('reprise : corps de checkout-create', [corps.plan, corps.engagement, corps.merchant_id, 'period' in corps, 'account' in corps], ['STARTER', false, commerce, false, false]);
    const m = await page.evaluate(() => ({reprise: !document.getElementById('reprise').hidden, form: !document.getElementById('elements-form').hidden, etapes: [...document.querySelectorAll('[data-sans-reprise]')].every((e) => e.hidden)}));
    verifier('reprise : /merci/ ne redemande rien', m, {reprise: true, form: false, etapes: true});
    await ctx.close();
  }

  // Commerce déjà abonné, facture à régler, suspension à la main : jamais de 2e abonnement
  if (w >= 600) {
    const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
    for (const [etat, attendu] of [
      [{state: 'ACTIVE'}, ['/espace-client/#/abonnement', false]],
      [{state: 'STOPPED', stop_reason: 'PAYMENT_FAILED', pay_url: 'https://invoice.stripe.com/i/essai'}, ['https://invoice.stripe.com/i/essai', false]],
      [{state: 'SUSPENDED_MANUAL', stop_reason: 'OPERATOR'}, ['mailto:contact@loyna.fr', false]],
    ]) {
      const {page, ctx} = await ouvrir(w, h, '/panier/?offre=starter&engagement=0&commerce=11111111-2222-4333-8444-555555555555', async (p) => {
        await p.evaluateOnNewDocument(() => {
          localStorage.setItem('loyna-business-auth', JSON.stringify({access_token: 'jeton.de.essai', refresh_token: 'r', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: {id: 'u1', email: 'essai@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
        });
        await p.setRequestInterception(true);
        p.on('request', (r) => {
          const u = r.url();
          if (u.includes('.supabase.co') && r.method() === 'OPTIONS') return r.respond({status: 204, headers: CORS});
          if (u.includes('/rpc/my_service_state')) return r.respond({status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(etat)});
          if (u.includes('.supabase.co')) return r.abort();
          r.continue();
        });
      });
      await page.waitForFunction(() => document.querySelector('.pn-sum .pn-fallback, .pn-sum .pn-alert'), {timeout: 20000});
      const r = await page.evaluate(() => [document.querySelector('.pn-sum .pn-fallback a, .pn-sum .pn-alert a').getAttribute('href'), !!document.querySelector('.pn-sum button[type=submit]')]);
      verifier(`panier, commerce en état ${etat.state} ${etat.stop_reason ?? ''} : pas de paiement proposé`, r, attendu);
      await ctx.close();
    }
  }

  // /merci/ selon l'offre payée : rappel d'engagement seulement si engagé, un retour -annuel en transit lu comme -engage
  if (w >= 600) {
    for (const [offre, attendu] of [
      ['starter-mensuel', {texte: 'Offre Starter, sans engagement.', engagement: false, pro: false, kit: null}],
      ['starter-engage', {texte: 'Offre Starter, avec 12 mois d’engagement.', engagement: true, pro: false, kit: null}],
      ['pro-mensuel', {texte: 'Offre Pro, sans engagement.', engagement: false, pro: true, kit: 'sans'}],
      ['pro-engage', {texte: 'Offre Pro, avec 12 mois d’engagement.', engagement: true, pro: true, kit: 'engage'}],
      ['pro-annuel', {texte: 'Offre Pro, avec 12 mois d’engagement.', engagement: true, pro: true, kit: 'engage'}],
      ['premium-mensuel', {texte: '', engagement: false, pro: false, kit: null}],
    ]) {
      const {page, ctx} = await ouvrir(w, h, `/merci/?offre=${offre}&session_id=cs_test_aaaaaaaaaaaa`);
      const r = await page.evaluate(() => {
        const vu = (e) => !!e && !e.hidden;
        const kit = [...document.querySelectorAll('[data-kit]')].find(vu);
        return {texte: document.getElementById('offre-payee').hidden ? '' : document.getElementById('offre-payee').textContent, engagement: vu(document.getElementById('rappel-engagement')), pro: vu(document.querySelector('[data-suite="pro"]')), kit: vu(document.querySelector('[data-suite="pro"]')) ? (kit?.dataset.kit ?? null) : null};
      });
      verifier(`/merci/ ${offre}`, {...r, texte: nbsp(r.texte)}, attendu);
      await ctx.close();
    }
  }

  // Vidéo en surimpression
  {
    const {page, ctx} = await ouvrir(w, h, '/');
    await page.evaluate(() => document.querySelector('#video a[data-video]').click());
    await new Promise((r) => setTimeout(r, 600));
    const v = await page.evaluate(() => {
      const d = document.getElementById('video-modale');
      const x = d.querySelector('video');
      return {ouverte: d.open, src: x ? new URL(x.src).pathname : null, url: location.pathname};
    });
    verifier('vidéo : s’ouvre sans quitter la page', v, {ouverte: true, src: '/video/loyna-presentation-720p.mp4', url: '/'});
    if (DOSSIER) await page.screenshot({path: `${DOSSIER}/video-${w}.png`});
    await page.evaluate(() => document.querySelector('.vm-fermer').click());
    await new Promise((r) => setTimeout(r, 100));
    verifier('vidéo : se ferme et se décharge', await page.evaluate(() => [document.getElementById('video-modale').open, !!document.querySelector('#video-modale video')]), [false, false]);
    await ctx.close();
  }

  // Menu du téléphone
  if (w < 600) {
    const {page, ctx} = await ouvrir(w, h, '/');
    await page.tap('#menu-mobile summary');
    await new Promise((r) => setTimeout(r, 150));
    const r = await page.evaluate(() => {
      const s = document.querySelector('.sheet').getBoundingClientRect();
      return {ouvert: document.getElementById('menu-mobile').open, deborde: s.right > innerWidth || s.left < 0, liens: document.querySelectorAll('.sheet a').length};
    });
    verifier('menu du téléphone', r, {ouvert: true, deborde: false, liens: 9});
    if (DOSSIER) await page.screenshot({path: `${DOSSIER}/menu-${w}.png`});
    await page.mouse.click(40, 760);
    await new Promise((r2) => setTimeout(r2, 100));
    verifier('menu : se ferme en touchant ailleurs', await page.evaluate(() => document.getElementById('menu-mobile').open), false);
    await ctx.close();
  }
}

// Erreurs de console, toutes pages, à l'ordinateur et sur téléphone
const routes = ['/', '/tarifs/', '/essai/', '/creer-ma-carte/', '/creer-ma-carte/?nom=Le%20Fournil&activite=Boulangerie', '/fonctionnalites/', '/secteurs/', '/secteurs/barbier/', '/faq/', '/blog/', '/blog/creer-carte-de-fidelite/', '/a-propos/', '/contact/', '/contact/envoye/', '/demo/', '/devenir-partenaire/', '/devenir-partenaire/envoye/', '/plan-du-site/', '/cgv/', '/cgu/', '/mentions-legales/', '/confidentialite/', '/cookies/', '/panier/', '/merci/', '/visuel-carte/', '/espace-client/', '/espace-client/demo/', '/espace-client/guide/', '/espace-commercial/'];
console.log('\n--- console ---');
for (const w of [1280, 375]) {
  const page = await b.newPage();
  await page.setViewport({width: w, height: 812, isMobile: w < 600, hasTouch: w < 600});
  let total = 0;
  for (const r of routes) {
    const err = [];
    const onC = (m) => m.type() === 'error' && err.push(m.text());
    const onP = (e) => err.push(String(e));
    const onF = (q) => {
      // hébergé ailleurs ou PHP absent de ce PC : sans rapport avec la page
      if (!/supabase|\.php|google|builder/.test(q.url())) err.push('requête échouée ' + q.url());
    };
    page.on('console', onC);
    page.on('pageerror', onP);
    page.on('requestfailed', onF);
    await page.goto(BASE + r, {waitUntil: 'networkidle0', timeout: 90000});
    const reel = err.filter((e) => !/supabase|ERR_NAME|cartes\.php|notes\.php|donnees\.enc|404 \(Not Found\)|Failed to load resource/.test(e));
    if (reel.length) {
      total += reel.length;
      echecs += reel.length;
      console.log(`  ${w} px ${r} :`, reel.slice(0, 4));
    }
    page.off('console', onC);
    page.off('pageerror', onP);
    page.off('requestfailed', onF);
  }
  console.log(`${w} px : ${routes.length} pages, ${total} erreur(s) de console`);
  await page.close();
}
await b.close();
console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les essais passent.');
process.exit(echecs ? 1 : 0);
