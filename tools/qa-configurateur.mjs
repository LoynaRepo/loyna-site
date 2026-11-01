// Essais du configurateur (/creer-ma-carte/) : réglages passés dans le lien, priorité sur le brouillon enregistré,
// récompense et couleurs par activité, modifications du visiteur respectées, logo gardé pour l'essai.
// node tools/qa-configurateur.mjs   (serveur de développement sur le port 4322) → captures dans out/qa/
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:4322';
fs.mkdirSync('out/qa', {recursive: true});
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${ok ? '' : ` : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`}`);
};

// État du formulaire, de la carte et des pastilles
const etat = (page) =>
  page.evaluate(() => {
    const v = (s) => document.querySelector(s).value;
    const card = document.querySelector('#card-slot .wcard');
    const enfoncee = (cible) => document.querySelector(`.swatches[data-target="${cible}"] .sw[aria-pressed="true"]`)?.dataset.color || null;
    const roue = (cible) => document.querySelector(`.swatches[data-target="${cible}"] .custom`).classList.contains('is-picked');
    let brouillon = null;
    try {
      brouillon = JSON.parse(localStorage.getItem('loyna-config'));
    } catch {}
    return {
      nom: v('#c-name'), activite: v('#c-activity'), recompense: v('#c-reward'), fond: v('#c-bg'), tampons: v('#c-accent'),
      carte: {nom: card.querySelector('.wc-name strong').textContent, activite: card.querySelector('.wc-name small').textContent,
        recompense: card.querySelector('.wc-reward span').textContent, fond: card.style.getPropertyValue('--bg'), tampons: card.style.getPropertyValue('--accent')},
      pastilles: {fond: enfoncee('bg'), tampons: enfoncee('accent'), roueFond: roue('bg'), roueTampons: roue('accent')},
      brouillon,
    };
  });

// Nouvelle page dans un contexte vierge (localStorage vide), avec un brouillon éventuel
async function ouvrir(chemin, brouillon) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({width: 1280, height: 1000});
  if (brouillon) {
    await page.goto(BASE + '/creer-ma-carte/', {waitUntil: 'networkidle0'});
    await page.evaluate((b) => localStorage.setItem('loyna-config', JSON.stringify(b)), brouillon);
  }
  await page.goto(BASE + chemin, {waitUntil: 'networkidle0'});
  return {page, ctx};
}
const choisirActivite = (page, nom) =>
  page.evaluate((n) => {
    const s = document.querySelector('#c-activity');
    s.value = n;
    s.dispatchEvent(new Event('input', {bubbles: true}));
    s.dispatchEvent(new Event('change', {bubbles: true}));
  }, nom);

const fs_source = fs.readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const BROUILLON = {name: 'Mon Salon', activity: 'Coiffure', bg: '#14532d', accent: '#ffd166', total: 8, filled: 3, reward: 'Coupe offerte', variant: 'google', touche: {reward: true, bg: true, accent: true}};

// 1. Lien Boulangerie (activité seule) : récompense et couleurs de l'activité
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?nom=La%20P%C3%A2tisserie%20des%20Marseillais&activite=Boulangerie');
  const e = await etat(page);
  verifier('lien 1 : nom', e.nom, 'La Pâtisserie des Marseillais');
  verifier('lien 1 : activité', e.activite, 'Boulangerie');
  verifier('lien 1 : récompense de l’activité', e.recompense, 'Viennoiserie offerte');
  verifier('lien 1 : couleurs de l’activité', [e.fond, e.tampons], ['#7a3d1c', '#f2c879']);
  verifier('lien 1 : carte à jour', e.carte, {nom: 'La Pâtisserie des Marseillais', activite: 'Boulangerie', recompense: 'Viennoiserie offerte', fond: '#7a3d1c', tampons: '#f2c879'});
  verifier('lien 1 : pastilles enfoncées (Cognac, Miel)', e.pastilles, {fond: '#7a3d1c', tampons: '#f2c879', roueFond: false, roueTampons: false});
  await page.$eval('#cfg', (el) => el.scrollIntoView());
  await (await page.$('.configurator')).screenshot({path: 'out/qa/configurateur-lien1-boulangerie.png'});
  // le visiteur change d'activité sans rien avoir modifié : tout suit
  await choisirActivite(page, 'Pressing');
  const e2 = await etat(page);
  verifier('lien 1 → Pressing : récompense et couleurs suivent', [e2.recompense, e2.fond, e2.tampons], ['Chemise nettoyée offerte', '#1e3a5f', '#7dd3fc']);
  // il modifie la récompense, puis change d'activité : la récompense reste, les couleurs suivent
  await page.$eval('#c-reward', (el) => { el.focus(); el.select(); });
  await page.type('#c-reward', 'Repassage offert');
  await choisirActivite(page, 'Fleuriste');
  const e3 = await etat(page);
  verifier('récompense modifiée puis Fleuriste : récompense gardée, couleurs suivent', [e3.recompense, e3.fond, e3.tampons], ['Repassage offert', '#14532d', '#f4a3b5']);
  // il choisit une couleur de carte, puis change d'activité : la carte reste, les tampons suivent
  await page.click('.swatches[data-target="bg"] .sw[data-color="#5b2a86"]');
  await choisirActivite(page, 'Café');
  const e4 = await etat(page);
  verifier('fond choisi puis Café : fond gardé, tampons suivent', [e4.recompense, e4.fond, e4.tampons], ['Repassage offert', '#5b2a86', '#7a3d1c']);
  verifier('Café : tampons hors palette → roue marquée', [e4.pastilles.tampons, e4.pastilles.roueTampons, e4.carte.tampons], [null, true, '#7a3d1c']);
  verifier('brouillon enregistré avec les marques de modification', e4.brouillon.touche, {reward: true, bg: true, accent: false});
  await ctx.close();
}

// 2. Lien Pizzeria avec récompense et couleurs libres
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?nom=Pizza%20Roma&activite=Pizzeria&recompense=10e%20pizza%20offerte&fond=1f3a2a&tampons=e8503a');
  const e = await etat(page);
  verifier('lien 2 : nom, activité, récompense', [e.nom, e.activite, e.recompense], ['Pizza Roma', 'Pizzeria', '10e pizza offerte']);
  verifier('lien 2 : couleurs du lien', [e.fond, e.tampons], ['#1f3a2a', '#e8503a']);
  verifier('lien 2 : carte à jour', e.carte, {nom: 'Pizza Roma', activite: 'Pizzeria', recompense: '10e pizza offerte', fond: '#1f3a2a', tampons: '#e8503a'});
  verifier('lien 2 : couleurs libres → roues marquées, aucune pastille', e.pastilles, {fond: null, tampons: null, roueFond: true, roueTampons: true});
  await page.$eval('#cfg', (el) => el.scrollIntoView());
  await (await page.$('.configurator')).screenshot({path: 'out/qa/configurateur-lien2-pizzeria.png'});
  await ctx.close();
}

// 3. Le lien passe avant le brouillon enregistré
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?nom=La%20P%C3%A2tisserie%20des%20Marseillais&activite=Boulangerie', BROUILLON);
  const e = await etat(page);
  verifier('lien > brouillon : activité, récompense, couleurs du lien', [e.activite, e.recompense, e.fond, e.tampons], ['Boulangerie', 'Viennoiserie offerte', '#7a3d1c', '#f2c879']);
  verifier('lien > brouillon : le reste du brouillon est gardé (passages, style)', [e.brouillon.total, e.brouillon.filled, e.brouillon.variant], [8, 3, 'google']);
  await ctx.close();
}

// 4. Sans réglages : comme avant
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/');
  const e = await etat(page);
  verifier('sans lien ni brouillon : valeurs de départ', [e.nom, e.activite, e.recompense, e.fond, e.tampons], ['Maison Lumière', 'Coiffure', 'Brushing offert', '#1f1c17', '#d9b27a']);
  verifier('sans lien ni brouillon : pastilles Noir chaud et Or', [e.pastilles.fond, e.pastilles.tampons], ['#1f1c17', '#d9b27a']);
  await ctx.close();
}
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/', BROUILLON);
  const e = await etat(page);
  verifier('brouillon seul : repris tel quel', [e.nom, e.activite, e.recompense, e.fond, e.tampons], ['Mon Salon', 'Coiffure', 'Coupe offerte', '#14532d', '#ffd166']);
  await ctx.close();
}
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?nom=Chez%20Nina', BROUILLON);
  const e = await etat(page);
  verifier('brouillon + ?nom seul : nom remplacé, reste du brouillon', [e.nom, e.activite, e.recompense, e.fond, e.tampons], ['Chez Nina', 'Coiffure', 'Coupe offerte', '#14532d', '#ffd166']);
  await ctx.close();
}

// 5. Couleurs invalides ignorées, activité inconnue ajoutée, accents et majuscules tolérés
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?activite=boulangerie&fond=zzz123&tampons=12345');
  const e = await etat(page);
  verifier('couleurs invalides ignorées (couleurs de l’activité)', [e.activite, e.fond, e.tampons], ['Boulangerie', '#7a3d1c', '#f2c879']);
  await ctx.close();
}
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?activite=Cafe&tampons=%23E8503A');
  const e = await etat(page);
  verifier('« Cafe » → Café ; « #E8503A » accepté', [e.activite, e.recompense, e.fond, e.tampons], ['Café', 'Café offert', '#f5efe4', '#e8503a']);
  await ctx.close();
}
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/?activite=Toiletteur&recompense=' + encodeURIComponent('Un toilettage offert, et même plus que ça, vraiment'));
  const e = await etat(page);
  // activité hors liste : « Autre », son texte dans le champ libre et sur la carte (depuis le 2026-10-27)
  verifier('activité inconnue : « Autre » et son texte sur la carte', [e.activite, e.carte.activite], ['Autre', 'Toiletteur']);
  verifier('récompense coupée à 40 caractères', [e.recompense, e.recompense.length], ['Un toilettage offert, et même plus que ç', 40]);
  await ctx.close();
}
{
  // Téléphone : copie réduite de la carte sous l'en-tête pendant les réglages, couleur libre réglée dans la page
  const {page, ctx} = await ouvrir('/creer-ma-carte/');
  await page.setViewport({width: 375, height: 812, isMobile: true, hasTouch: true});
  await page.evaluate(() => {
    const t = document.querySelector('.swatches[data-target="bg"]');
    window.scrollTo({top: t.getBoundingClientRect().top + scrollY - 300, behavior: 'instant'});
  });
  await new Promise((r) => setTimeout(r, 400));
  const mini = await page.evaluate(() => ({
    affichee: document.querySelector('#mini').classList.contains('on'),
    sousEnTete: Math.round(document.querySelector('#mini').getBoundingClientRect().top) === Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom),
    largeur: document.documentElement.scrollWidth,
  }));
  verifier('téléphone : copie réduite de la carte sous l’en-tête, sans débordement', mini, {affichee: true, sousEnTete: true, largeur: 375});
  await page.click('.swatches[data-target="bg"] .sw.custom');
  const reglage = await page.evaluate(() => {
    const pk = document.querySelector('#pk-bg');
    const ouvert = !pk.hidden;
    const h = pk.querySelector('.pk-h');
    h.value = '220';
    h.dispatchEvent(new Event('input', {bubbles: true}));
    const code = pk.querySelector('.pk-hex');
    const apresCurseur = [document.querySelector('#c-bg').value === code.value, document.querySelector('#mini .wcard').style.getPropertyValue('--bg') === code.value];
    code.value = '#2A6F97';
    code.dispatchEvent(new Event('input', {bubbles: true}));
    return {ouvert, apresCurseur, code: document.querySelector('#c-bg').value, grande: document.querySelector('#card-slot .wcard').style.getPropertyValue('--bg'), roue: document.querySelector('.swatches[data-target="bg"] .sw.custom').classList.contains('is-picked')};
  });
  verifier('téléphone : réglage libre (curseur puis code couleur), les deux cartes suivent', reglage, {ouvert: true, apresCurseur: [true, true], code: '#2a6f97', grande: '#2a6f97', roue: true});
  await page.screenshot({path: 'out/qa/configurateur-telephone.png'});
  await ctx.close();
}

// Logo choisi : converti par logoToFiles, gardé dans l'onglet pour l'essai, montré sur la carte et retrouvé au retour sur la page
{
  const {page, ctx} = await ouvrir('/creer-ma-carte/');
  // PNG de 800 x 400, généré ici, sans fichier du dépôt
  const donnees = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 400;
    const x = c.getContext('2d');
    x.fillStyle = '#7a3d1c';
    x.fillRect(0, 0, 800, 400);
    return c.toDataURL('image/png').split(',')[1];
  });
  const chemin = `out/qa/logo-essai-${process.pid}.png`;
  fs.writeFileSync(chemin, Buffer.from(donnees, 'base64'));
  await (await page.$('#c-logo')).uploadFile(chemin);
  await page.waitForFunction(() => document.querySelector('#file-name').textContent.endsWith('.png'), {timeout: 15000});
  const garde = await page.evaluate(() => {
    const l = JSON.parse(sessionStorage.getItem('loyna-config-logo') || 'null');
    const dim = (b) =>
      new Promise((ok) => {
        const i = new Image();
        i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
        i.src = `data:image/png;base64,${b}`;
      });
    return Promise.all([dim(l.logo_png), dim(l.icon_png)]).then(([a, b]) => ({logo: a, icone: b, logoKo: atob(l.logo_png).length <= 200000, iconeKo: atob(l.icon_png).length <= 60000, surLaCarte: !!document.querySelector('#card-slot .wc-logo img')}));
  });
  verifier('logo : 660 px et 320 px au plus, légers, sur la carte', garde, {logo: [660, 660], icone: [320, 160], logoKo: true, iconeKo: true, surLaCarte: true});
  await page.reload({waitUntil: 'networkidle0'});
  verifier('logo : retrouvé en revenant sur la page', await page.evaluate(() => !!document.querySelector('#card-slot .wc-logo img')), true);
  const essai = await page.evaluate(() => document.querySelector('#go-essai')?.getAttribute('href') ?? null);
  const ouvert = /export const TRIAL = \{open: true/.test(fs_source);
  verifier('bouton principal vers l’essai, et lien vers les offres gardé', [essai, await page.$eval('#go-plans', (e) => e.getAttribute('href'))], [ouvert ? '/essai/' : null, '/tarifs/?carte=1']);
  fs.rmSync(chemin, {force: true});
  await ctx.close();
}

await browser.close();
console.log(echecs ? `${echecs} échec(s)` : 'Tous les essais passent.');
process.exit(echecs ? 1 : 0);
