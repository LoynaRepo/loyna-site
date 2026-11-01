// Contrôle visuel de LOYNA Business en démonstration locale (npm run dev puis ?demo) :
// node tools/qa-app.mjs 1366 accueil scanner clients …   (captures dans out/qa-app/)
// node tools/qa-app.mjs 1366                             (tous les écrans)
// node tools/qa-app.mjs 390 --modes                      (chaque offre et chaque état du service : textes attendus, débordements,
//                                                         erreurs, boutons, export CSV, changement d'offre ; code de sortie 1 si échec)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const APP = process.env.QA_APP ?? '/espace-client/?demo';
const [w, ...args] = process.argv.slice(2);
const modes = args.includes('--modes');
const ALL = ['accueil', 'scanner', 'clients', 'automatisations', 'campagnes', 'rapport', 'programme', 'equipe', 'reglages', 'abonnement'];
const views = args.filter((a) => a !== '--modes');
if (!views.length) views.push(...ALL);
const width = Number(w);
const mobile = width < 700;
fs.mkdirSync('out/qa-app', {recursive: true});
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width, height: mobile ? 844 : 860, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(adresse) {
  await page.goto(`${BASE}${adresse}`, {waitUntil: 'networkidle0'});
  await page.evaluate(() => sessionStorage.setItem('demo-session', '1'));
  await page.reload({waitUntil: 'networkidle0'});
  await wait(900);
}

if (!modes) {
  for (const v of views) {
    if (v.startsWith('/')) {
      // page publique ou écran complet (adresse directe)
      await page.goto(BASE + v, {waitUntil: 'networkidle0'});
    } else {
      await page.goto(`${BASE}${APP}#/${v === 'login' ? '' : v}`, {waitUntil: 'networkidle0'});
      if (v === 'login') {
        await page.evaluate(() => sessionStorage.setItem('demo-session', 'out'));
        await page.reload({waitUntil: 'networkidle0'});
      } else {
        await page.evaluate(() => sessionStorage.setItem('demo-session', '1'));
        await page.reload({waitUntil: 'networkidle0'});
      }
    }
    await wait(1200);
    if (process.env.QA_SCAN && v === 'scanner') {
      await page.evaluate((qr) => window.__demoScan?.(qr), process.env.QA_SCAN);
      await wait(900);
    }
    if (process.env.QA_CLICK) {
      const sel = process.env.QA_CLICK;
      await page.evaluate((s) => document.querySelector(s)?.click(), sel);
      await wait(800);
    }
    const name = v.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '_' + width + (process.env.QA_SUFFIX ?? '');
    await page.screenshot({path: `out/qa-app/${name}.png`, fullPage: true});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${name}.png${overflow > 0 ? `  DÉBORDEMENT HORIZONTAL ${overflow}px` : ''}`);
  }
  if (errors.length) console.log('Erreurs console :\n' + errors.join('\n'));
  await browser.close();
  process.exit(0);
}

// --- Offres et états du service (mêmes modes que src/app/mock.ts) ----------------------------------------------------
let echecs = 0;
const verifie = (nom, ok, detail = '') => {
  if (!ok) {
    echecs++;
    console.log(`ÉCHEC : ${nom}${detail ? ` : ${detail}` : ''}`);
  }
};
/** Texte de la page, apostrophes et espaces insécables ramenés à la forme simple. */
const norm = (s) => s.replace(/[  ]/g, ' ').replace(/’/g, "'").replace(/\s+/g, ' ');
const lire = async () => norm(await page.evaluate(() => document.body.innerText));
const SEED = '&seed=268380';
const Bandeau = {
  sursis: "Votre paiement n'est pas passé. Réglez votre facture avant le ",
  essai: "Votre essai est terminé : votre carte est en pause. Vos clients et leurs soldes sont conservés jusqu'au ",
  paiement: "Paiement non régularisé : votre carte est en pause. Tout repart dès que la facture est réglée. Données conservées jusqu'au ",
  fin: "Votre abonnement est terminé : votre carte est en pause. Données conservées jusqu'au ",
  manuel: 'Votre compte est suspendu par LOYNA. Écrivez à contact@loyna.fr.',
};
const PRIX = {
  starter: "29 € par mois, sans TVA, sans engagement : vous arrêtez à la fin de n'importe quel mois. Ou 24,65 € par mois avec 12 mois d'engagement, réglés chaque mois.",
  pro: "49 € par mois, sans TVA, sans engagement : vous arrêtez à la fin de n'importe quel mois. Ou 41,65 € par mois avec 12 mois d'engagement, réglés chaque mois.",
};
const MODES = [
  {nom: 'starter', q: '&offre=starter', abonnement: [PRIX.starter, PRIX.pro, 'Passer à Pro · 49 €', 'Passer à Pro avec engagement · 41,65 €', "Prendre 12 mois d'engagement · 24,65 €", 'Votre offre', 'Pour 20 € de plus par mois, 17 € avec engagement'], accueil: ['Campagnes cette semaine']},
  {nom: 'pro', q: '&offre=pro', abonnement: [PRIX.pro, 'Passer à Starter · 29 €', "Prendre 12 mois d'engagement · 41,65 €", 'Votre offre'], absent: {abonnement: ['Pour 20 € de plus']}, accueil: ['Votre suivi LOYNA']},
  {nom: 'starter engagé', q: '&offre=starter&engage=1', abonnement: ['Passer à Pro avec engagement · 41,65 €', 'Mon commerce ferme', 'justificatif de radiation', 'Engagement jusqu', 'Pendant votre engagement'], absent: {abonnement: ['Passer à Pro · 49 €', 'Passer à Starter']}},
  {nom: 'pro engagé', q: '&offre=pro&engage=1', abonnement: ['41,65 € par mois, sans TVA', 'Mon commerce ferme', 'le retour à Starter ou la sortie'], absent: {abonnement: ['39,99', 'Passer à ', 'Prendre 12 mois']}},
  {nom: 'barber kong', q: '&offre=pro&engage=1&slug=barber-kong', abonnement: ['39,99 € par mois, sans TVA', 'Engagement jusqu'], absent: {abonnement: ['41,65', '49 €', 'Les offres LOYNA', 'Starter', 'Mon commerce ferme', 'Passer à ', 'Prendre 12 mois']}},
  {nom: 'engagement terminé', q: '&offre=starter&engage=fini', abonnement: ['Passer à Pro · 49 €'], absent: {abonnement: ["Prendre 12 mois d'engagement", 'Mon commerce ferme']}},
  {nom: 'premium', q: '&offre=premium', abonnement: ["Votre offre : Premium (offre historique), 39,99 € par mois, engagement jusqu'au 27/10/2027. Vous avez tout le contenu de Pro."], absent: {abonnement: ['Les offres LOYNA', 'Passer à', 'Prendre 12 mois', 'Mon commerce ferme', 'Starter']}, premium: true},
  {nom: 'essai', q: '&essai=1', compteur: 'Essai : encore 23 jours', accueil: ['5 gestes pour démarrer', 'Imprimez', 'Ajoutez', 'Créez votre première carte', 'guide de démarrage'], abonnement: ['Essai gratuit', 'Choisir mon offre', 'Choisir Starter · 29 €', 'Choisir Pro · 49 €', 'Offerte jusqu'], absent: {abonnement: ['Factures, carte bancaire', 'Passer à']}},
  {nom: 'arrêt essai', q: '&arret=essai', bandeau: Bandeau.essai, bouton: 'Choisir mon offre', pause: true, abonnement: ['Carte en pause', 'Choisir Starter · 29 €']},
  {nom: 'arrêt paiement', q: '&offre=starter&arret=paiement', bandeau: Bandeau.paiement, bouton: 'Régler ma facture', pause: true, abonnement: ['Carte en pause', "Réglez d'abord votre facture"], absent: {abonnement: ['Passer à', 'Choisir Starter']}},
  {nom: 'arrêt fin', q: '&offre=pro&arret=fin', bandeau: Bandeau.fin, bouton: 'Reprendre mon abonnement', pause: true, abonnement: ['Carte en pause', 'jamais refacturée']},
  {nom: 'arrêt manuel', q: '&offre=starter&arret=manuel', bandeau: Bandeau.manuel, pause: true, abonnement: ['Suspendu'], absent: {abonnement: ['Les offres LOYNA']}},
  {nom: 'sursis', q: '&offre=starter&sursis=1', bandeau: Bandeau.sursis, bouton: 'Régler ma facture', abonnement: ['Paiement en retard', 'Mise en pause le'], absent: {abonnement: ['Passer à']}},
  {nom: 'compte offert', q: '&offre=pro&exempte=1', abonnement: ['Compte offert'], absent: {abonnement: ['Les offres LOYNA']}},
];
// Partout, sauf l'écran de Barber Kong : plus de Premium, d'annuel, de pack, d'intégrations ni de « en un clic »
const INTERDITS = /premium|annuel|\+ ?500|4,99|intégration|en un clic|\bHT\b|\bSMS\b/i;
const SLUG = (s) => s.replace(/[^a-z0-9]+/gi, '_');

// QA_RAPIDE=1 : sans le tour de tous les écrans, seulement les parcours ci-dessous
// QA_SEUL=regexp : seulement les offres et états dont le nom correspond
const MODES_A_VOIR = MODES.filter((m) => !process.env.QA_SEUL || new RegExp(process.env.QA_SEUL).test(m.nom));
for (const mode of process.env.QA_RAPIDE ? [] : MODES_A_VOIR) {
  for (const v of ALL) {
    await open(`${APP}${SEED}${mode.q}#/${v}`);
    const t = await lire();
    const ou = `${mode.nom} / ${v}`;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    verifie(`${ou} : pas de débordement horizontal`, overflow <= 0, `${overflow}px`);
    if (!mode.premium) {
      const m = INTERDITS.exec(t);
      verifie(`${ou} : aucun mot périmé`, !m, m ? t.slice(Math.max(0, m.index - 50), m.index + 50) : '');
    }
    if (mode.bandeau) {
      verifie(`${ou} : bandeau`, t.includes(mode.bandeau), t.slice(0, 200));
      const lien = await page.evaluate(() => document.querySelector('.banner .b')?.textContent?.trim() ?? null);
      verifie(`${ou} : bouton du bandeau`, lien === (mode.bouton ?? null), String(lien));
    } else verifie(`${ou} : pas de bandeau`, !(await page.$('.banner')));
    if (mode.compteur && v !== 'scanner') verifie(`${ou} : compteur d'essai`, t.includes(mode.compteur));
    if (v === 'scanner') {
      if (mode.pause) {
        verifie(`${ou} : écran bloqué`, t.includes('Programme en pause') && t.includes("Ce passage n'est pas crédité : voir Abonnement."));
        verifie(`${ou} : pas de caméra`, !(await page.$('video')));
      } else verifie(`${ou} : scanner ouvert`, !!(await page.$('video')));
    }
    for (const x of mode[v] ?? []) verifie(`${ou} : « ${x} »`, t.includes(norm(x)));
    // Hors du bandeau de la démonstration, qui liste les offres
    const tp = norm(await page.evaluate(() => document.querySelector('.page')?.innerText ?? ''));
    for (const x of mode.absent?.[v] ?? []) verifie(`${ou} : sans « ${x} »`, !tp.includes(norm(x)));
    await page.screenshot({path: `out/qa-app/${SLUG(mode.nom)}_${v}_${width}.png`, fullPage: true});
  }
  console.log(`${mode.nom} : contrôlé`);
}

// Verrous de Starter : jamais « Inclus dans Premium », VIP et parrainage réservés à Pro, calendrier pour tous
await open(`${APP}${SEED}&offre=starter#/automatisations`);
let t = await lire();
verifie('Starter : sections de l’écran Automatisations', /incluses dans votre offre/i.test(t) && /avec pro/i.test(t) && t.includes('Inclus dans Pro')); // titres en capitales (CSS)
verifie('Starter : VIP et parrainage verrouillés', (await page.$$('.auto.is-locked')).length === 2);
await open(`${APP}${SEED}&offre=pro#/automatisations`);
verifie('Pro : rien de verrouillé', (await page.$$('.auto.is-locked')).length === 0);
await open(`${APP}${SEED}&offre=starter#/campagnes`);
t = await lire();
verifie('Starter : calendrier visible', t.includes('Vos temps forts des 60 prochains jours'));
verifie('Starter : encart Pro', t.includes('Avec Pro, LOYNA écrit ces messages pour vous et les programme.'));
await open(`${APP}${SEED}&offre=pro#/campagnes`);
t = await lire();
verifie('Pro : calendrier visible, sans encart', t.includes('Vos temps forts des 60 prochains jours') && !t.includes('Avec Pro, LOYNA écrit'));
// Campagne préparée : destinataires vérifiés d'office, 2 gestes
await page.evaluate(() => [...document.querySelectorAll('a.camp')].find((a) => a.textContent.includes('à valider'))?.click());
await wait(1400);
t = await lire();
verifie('Campagne préparée : destinataires vérifiés d’office', t.includes('recevr'), t.slice(0, 300));
const valider = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Valider et/.test(x.textContent));
  b?.click();
  return !!b;
});
await wait(300);
t = await lire();
verifie('Campagne préparée : 2e geste, « Je valide »', valider && t.includes('Je valide'));

// Campagne refusée pendant un arrêt : le brouillon reste, pas de bouton d'envoi
await open(`${APP}${SEED}&offre=starter&arret=essai#/campagne/nouvelle`);
await page.type('input[maxlength="120"]', 'Essai');
await page.type('textarea', 'Message');
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Vérifier les destinataires/.test(x.textContent))?.click());
await wait(900);
t = await lire();
verifie('Arrêt : envoi de campagne fermé', t.includes('aucune campagne ne part') && !t.includes('Envoyer maintenant'));

// Export CSV : UTF-8 avec BOM, point-virgule, colonnes du contrat, aussi pendant un arrêt
for (const q of ['&offre=starter', '&offre=starter&arret=essai']) {
  await open(`${APP}${SEED}${q}#/clients`);
  await page.evaluate(() => {
    window.__csv = null;
    const c = URL.createObjectURL;
    URL.createObjectURL = (b) => {
      b.arrayBuffer().then((x) => (window.__csv = [...new Uint8Array(x)]));
      return c.call(URL, b);
    };
  });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Exporter en CSV/.test(x.textContent))?.click());
  await wait(900);
  const octets = await page.evaluate(() => window.__csv);
  verifie(`Export ${q} : fichier produit`, !!octets);
  if (octets) {
    verifie(`Export ${q} : BOM UTF-8`, octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf);
    const lignes = Buffer.from(octets.slice(3)).toString('utf8').split('\r\n').filter(Boolean);
    verifie(`Export ${q} : colonnes`, lignes[0] === 'Prénom;Nom;Téléphone;E-mail;Anniversaire;Solde;Passages;Inscrit le;Accord offres', lignes[0]);
    verifie(`Export ${q} : 9 colonnes partout`, lignes.every((l) => l.split(';').length === 9));
    verifie(`Export ${q} : lignes`, lignes.length > 10);
  }
}

// Changement d'offre (tableau de la section 2.4) : confirmation, puis droits de la nouvelle offre
await open(`${APP}${SEED}&offre=starter#/abonnement`);
const cliquer = (re) => page.evaluate((s) => [...document.querySelectorAll('button')].find((x) => new RegExp(s).test(x.textContent))?.click(), re);
await cliquer('Passer à Pro · ');
await wait(300);
t = await lire();
verifie('Changement : confirmation prorata', t.includes('la différence est calculée au prorata') && t.includes('Aucune mise en service'));
await cliquer('Confirmer · ');
await wait(1500);
t = await lire();
verifie('Changement : offre appliquée', t.includes('LOYNA Pro') && t.includes('Passer à Starter · 29 €'), t.slice(0, 200));
verifie('Changement : menu et droits relus', await page.evaluate(() => document.querySelector('.side-m-t small, .plan-name')?.textContent.includes('Pro')));
await cliquer("Prendre 12 mois d.engagement");
await wait(300);
t = await lire();
verifie('Engagement : confirmation', t.includes("Je m'engage pour 12 mois") && t.includes('Sortie possible si votre commerce ferme, sur justificatif de radiation.'));
await cliquer("Je m.engage");
await wait(1500);
t = await lire();
verifie('Engagement : pris', t.includes('Engagement jusqu') && t.includes('Mon commerce ferme') && !t.includes('Passer à Starter'), t.slice(0, 200));

// Retour de la confirmation d'adresse : accueil de l'essai, ?bienvenue=1 retiré de l'adresse une fois lu
await page.goto(`${BASE}${APP}${SEED}&essai=1&bienvenue=1#/accueil`, {waitUntil: 'networkidle0'});
await wait(900);
t = await lire();
verifie('?bienvenue=1 : panneau de démarrage', t.includes('Votre carte est prête : 5 gestes pour démarrer'), t.slice(0, 300));
verifie('?bienvenue=1 : retiré de l’adresse', await page.evaluate(() => !location.search.includes('bienvenue') && location.search.includes('essai=1')));

// Page d'inscription : programme en pause, jamais « Commerce introuvable »
await page.goto(`${BASE}/join/?slug=demo-268380&arret=essai`, {waitUntil: 'networkidle0'});
await wait(500);
t = await lire();
verifie('/join/ en pause', t.includes('est en pause. Si vous avez déjà la carte, votre solde est conservé.') && !t.includes('introuvable') && !(await page.$('form')), t.slice(0, 200));
await page.screenshot({path: `out/qa-app/join_pause_${width}.png`, fullPage: true});
await page.goto(`${BASE}/join/?slug=demo-268380`, {waitUntil: 'networkidle0'});
await wait(500);
verifie('/join/ ouvert : formulaire', !!(await page.$('form')));

// Mot de passe oublié dans la démonstration : aucun appel, même réponse
await page.goto(`${BASE}${APP}&oubli=1`, {waitUntil: 'networkidle0'});
await page.evaluate(() => sessionStorage.setItem('demo-session', 'out'));
await page.reload({waitUntil: 'networkidle0'});
await wait(700);
await page.type('.login-forgot input', 'vous@example.com');
await page.evaluate(() => [...document.querySelectorAll('.login-forgot button')].find((x) => /Recevoir un lien/.test(x.textContent))?.click());
await wait(400);
t = await lire();
verifie('Mot de passe oublié : confirmation', t.includes('un lien vient de partir'));
await page.screenshot({path: `out/qa-app/connexion_oubli_${width}.png`, fullPage: true});
await page.evaluate(() => sessionStorage.setItem('demo-session', '1'));

// Écran Opérateur (?demo&operateur) : essais et dates dans la liste, « Gérer », création limitée à Starter et Pro, compte offert
page.on('dialog', (d) => d.accept());
const onglet = async () => {
  await open(`${APP}${SEED}&operateur#/operateur`);
  await page.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => /Commerces/.test(b.textContent))?.click());
  await wait(300);
};
const gerer = async (nom) => {
  await page.evaluate((n) => [...document.querySelectorAll('.op-tbl tr')].find((r) => r.textContent.includes(n))?.querySelector('.op-actions button')?.click(), nom);
  await wait(300);
};
await onglet();
t = await lire();
verifie('Opérateur : essais et arrêts dans la liste', t.includes("Essai jusqu'au") && t.includes('En pause : essai terminé') && t.includes('Compte offert') && t.includes('Données supprimées le'), t.slice(0, 400));
await page.screenshot({path: `out/qa-app/operateur_commerces_${width}.png`, fullPage: true});
const overflowOp = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
verifie('Opérateur : pas de débordement', overflowOp <= 0, `${overflowOp}px`);
await gerer('Pressing du Parc');
t = await lire();
verifie('Gérer : prolongations proposées', t.includes("Prolonger l'essai") && t.includes('Prolonger la conservation') && t.includes('Suspendre'), t.slice(0, 300));
verifie('Gérer : pas de campagne pour un Starter', !t.includes('Préparer une campagne'));
await page.screenshot({path: `out/qa-app/operateur_gerer_${width}.png`});
await cliquer('Prolonger la conservation');
await wait(700);
t = await lire();
verifie('Gérer : conservation prolongée', t.includes('Conservation prolongée de 30 jours') && (await page.evaluate(() => document.querySelector('.mdl .note')?.textContent ?? '')).includes('Conservation prolongée'), t.slice(-300));
await page.evaluate(() => document.querySelector('.mdl-x')?.click());
await wait(200);
await gerer('Atelier Barbe');
t = await lire();
verifie('Gérer un Pro : sortie pour fermeture et campagne', t.includes('Sortie pour fermeture') && t.includes('Préparer une campagne'));
await page.evaluate(() => [...document.querySelectorAll('.mdl .fld')].find((f) => /Motif/.test(f.textContent))?.querySelector('input')?.focus());
await page.keyboard.type('Contestation bancaire');
await cliquer('^Suspendre$');
await wait(1800); // action puis relecture de la liste
t = await lire();
verifie('Gérer : suspension à la main', t.includes('Suspendu à la main') && t.includes('Lever la suspension'), t.slice(0, 300));
await cliquer('Lever la suspension');
await wait(1800);
t = await lire();
verifie('Gérer : suspension levée', !t.includes('Suspendu à la main'));
await page.evaluate(() => [...document.querySelectorAll('.mdl .fld')].find((f) => /Nom de la campagne/.test(f.textContent))?.querySelector('input')?.focus());
await page.keyboard.type('Noël');
await page.evaluate(() => [...document.querySelectorAll('.mdl .fld')].find((f) => /^Message/.test(f.textContent))?.querySelector('textarea')?.focus());
await page.keyboard.type('{prenom}, à bientôt chez {commerce}.');
await cliquer('Préparer la campagne');
await wait(800);
t = await lire();
verifie('Gérer : campagne préparée', t.includes('un e-mail lui demande de la valider'), t.slice(-300));
await page.evaluate(() => [...document.querySelectorAll('.mdl .fld')].find((f) => /Justificatif/.test(f.textContent))?.querySelector('textarea')?.focus());
await page.keyboard.type('Avis de situation INSEE du 3 novembre');
await cliquer('^Sortie pour fermeture$');
await wait(1000);
t = await lire();
verifie('Gérer : sortie pour fermeture', t.includes('Sortie enregistrée'), t.slice(-300));
await page.evaluate(() => document.querySelector('.mdl-x')?.click());
await wait(200);
// Consultation d'un commerce en pause : bandeau, sans bouton
await page.evaluate(() => [...document.querySelectorAll('.op-tbl tr')].find((r) => r.textContent.includes('Pressing du Parc'))?.querySelectorAll('.op-actions button').forEach((b) => /Ouvrir son espace/.test(b.textContent) && b.click()));
await wait(1500);
t = await lire();
verifie('Consultation : bandeau sans bouton', t.includes('Votre essai est terminé') && !(await page.$('.banner .b')), t.slice(0, 300));
// Création : 2 offres, compte offert
await open(`${APP}${SEED}&operateur#/operateur`);
await cliquer('Commerce sans commande');
await wait(300);
t = await lire();
const offres = await page.evaluate(() => [...document.querySelectorAll('.seg[aria-label="Offre"] button')].map((b) => b.textContent));
verifie('Création : Starter et Pro seulement', offres.join() === 'Starter,Pro', offres.join());
verifie('Création : compte offert et essai', t.includes('Compte offert') && t.includes("reçoit un essai d'un mois"));
await page.screenshot({path: `out/qa-app/operateur_creation_${width}.png`, fullPage: true});

if (errors.length) {
  echecs++;
  console.log('Erreurs console :\n' + [...new Set(errors)].join('\n'));
}
await browser.close();
console.log(echecs ? `${echecs} échec(s) à ${width} px` : `Tout est bon à ${width} px`);
process.exit(echecs ? 1 : 0);
