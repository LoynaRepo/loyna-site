// Contrôle des jonctions et du bandeau défilant (refonte du 2026-10-31), sur le site construit :
//   node tools/qa-jonctions.mjs <base> [chemins…]
// - liseré : à chaque jonction, compare pixel par pixel la rangée juste au-dessus du bloc à la section du dessus, et la rangée
//   juste en dessous (et la dernière du bloc) à la section du dessous, sur toute la largeur, à 375, 768, 1280 et 1920 px,
//   en densité 1, 2 et 3 sur téléphone ;
// - bandeau : les deux offres, puis le parrainage seul après la date de l'offre de lancement ; largeur de la piste = 2 fois celle
//   d'un groupe, translation de -50 %, hauteur fixe, pas de défilement horizontal, pause au survol et au focus, un arrêt clavier par
//   offre, messages immobiles et entiers si le visiteur limite les animations.
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const [base = 'http://127.0.0.1:4332', ...args] = process.argv.slice(2);
const chemins = args.length ? args : ['/', '/tarifs/', '/creer-ma-carte/', '/fonctionnalites/', '/secteurs/', '/secteurs/boulangerie-cafe/', '/faq/', '/blog/', '/blog/creer-carte-de-fidelite/', '/a-propos/', '/contact/', '/contact/envoye/', '/demo/', '/devenir-partenaire/', '/devenir-partenaire/envoye/', '/plan-du-site/', '/cgv/', '/panier/', '/essai/', '/merci/', '/404.html'];
const VUES = [
  {w: 375, h: 812, d: 1},
  {w: 375, h: 812, d: 2},
  {w: 390, h: 844, d: 3},
  {w: 768, h: 1024, d: 1},
  {w: 1280, h: 800, d: 1},
  {w: 1536, h: 864, d: 1.25},
  {w: 1280, h: 720, d: 1.5},
  {w: 1920, h: 1080, d: 1},
];
const b = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu', '--hide-scrollbars']});
let echecs = 0;
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const proche = (a, b, t = 3) => a.every((v, i) => Math.abs(v - b[i]) <= t);

async function rangee(buf, y, largeur) {
  const {data, info} = await sharp(buf).extract({left: 0, top: y, width: largeur, height: 1}).raw().toBuffer({resolveWithObject: true});
  const px = [];
  for (let x = 0; x < info.width; x++) px.push([data[x * info.channels], data[x * info.channels + 1], data[x * info.channels + 2]]);
  return px;
}

for (const vue of VUES) {
  const page = await b.newPage();
  const mobile = vue.w < 600;
  await page.setViewport({width: vue.w, height: vue.h, deviceScaleFactor: vue.d, isMobile: mobile, hasTouch: mobile});
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('loyna-consent', JSON.stringify({ok: false, t: Date.now()}));
    } catch {}
  });
  let nbJonctions = 0;
  let nbEchecs = 0;
  for (const c of chemins) {
    await page.goto(base + c, {waitUntil: 'networkidle0', timeout: 90000});
    // fige ce qui bouge et masque les éléments fixes pour capturer les bords des sections
    await page.addStyleTag({content: '*,*::before,*::after{animation:none!important;transition:none!important}.site-header{position:static!important}.sticky-cta,.mini{display:none!important}html{scroll-behavior:auto!important}'});
    const blocs = await page.evaluate(() =>
      [...document.querySelectorAll('.jonction')].map((j, i) => {
        const r = j.getBoundingClientRect();
        const sur = j.classList.contains('jonction--sur');
        const s = getComputedStyle(j);
        return {i, y: r.top + scrollY, h: r.height, sur, de: s.getPropertyValue('--j-de'), vers: s.getPropertyValue('--j-vers')};
      }),
    );
    const couleur = (v) => {
      const h = v.trim().replace('#', '');
      return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
    };
    for (const j of blocs) {
      nbJonctions++;
      // capture de l'écran, jonction au milieu, à la densité réelle
      const pos = await page.evaluate(
        async (i, hauteur) => {
          const e = document.querySelectorAll('.jonction')[i];
          window.scrollTo(0, e.getBoundingClientRect().top + scrollY - hauteur / 2);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return e.getBoundingClientRect().top;
        },
        j.i,
        vue.h,
      );
      const buf = Buffer.from(await page.screenshot());
      const m = await sharp(buf).metadata();
      const largeur = m.width;
      const dernier = m.height - 1;
      const hautAttendu = couleur(j.de);
      const basAttendu = couleur(j.vers);
      const pb = [];
      // Sous la courbe : aucune rupture entre le bas du bloc et le haut de la section suivante. Une ombre portée de la section
      // suivante peut y passer, mais en continu ; et la couleur reste celle du dessous, à l'ombre près (pas de liseré clair ou sombre).
      const yBas = Math.min(dernier, Math.round((pos + j.h) * vue.d));
      let precBas = await rangee(buf, Math.max(0, yBas - 3), largeur);
      for (const dy of [-2, -1, 0, 1, 2]) {
        const y = Math.min(dernier, Math.max(0, yBas + dy));
        const px = await rangee(buf, y, largeur);
        const ruptures = px.filter((p, x) => !proche(p, precBas[x], 2));
        const horsTeinte = px.filter((p) => !proche(p, basAttendu, 18));
        if (ruptures.length > 0) {
          const x = px.findIndex((p, k) => !proche(p, precBas[k], 2));
          pb.push(`bas y${dy >= 0 ? '+' : ''}${dy} : ${ruptures.length}/${largeur} px en rupture (ex. x=${x} ${hex(precBas[x])} puis ${hex(px[x])})`);
        }
        if (horsTeinte.length > largeur * 0.02) pb.push(`bas y${dy >= 0 ? '+' : ''}${dy} : ${horsTeinte.length}/${largeur} px loin de ${hex(basAttendu)} (ex. ${hex(horsTeinte[0])})`);
        precBas = px;
      }
      // Au-dessus de la courbe (jonctions ordinaires) : aucune rupture entre la fin de la section et le début du bloc. Une ombre
      // portée peut y passer, mais en continu : deux rangées voisines ne diffèrent que de 2 niveaux au plus, sur toute la largeur.
      if (!j.sur && hautAttendu) {
        const yHaut = Math.round(pos * vue.d);
        let prec = await rangee(buf, Math.max(0, yHaut - 4), largeur);
        for (let dy = -3; dy <= 2; dy++) {
          const y = Math.min(dernier, Math.max(0, yHaut + dy));
          const px = await rangee(buf, y, largeur);
          const ruptures = px.filter((p, x) => !proche(p, prec[x], 2));
          if (ruptures.length > 0) pb.push(`haut y${dy >= 0 ? '+' : ''}${dy} : ${ruptures.length}/${largeur} px en rupture (ex. ${hex(ruptures[0])})`);
          prec = px;
        }
      }
      if (pb.length) {
        nbEchecs++;
        echecs++;
        console.log(`  LISERÉ ? ${c} jonction ${j.i} (${vue.w} px, densité ${vue.d}) :\n    ${pb.slice(0, 4).join('\n    ')}`);
      }
    }
  }
  console.log(`${vue.w} px, densité ${vue.d} : ${nbJonctions} jonctions contrôlées, ${nbEchecs} à revoir`);
  await page.close();
}

// --- Bandeau défilant ---------------------------------------------------------------------------------------------
// Deux états : la page telle quelle, et l'horloge après la fin de l'offre de lancement sur une page construite avant sa date
// (Base.astro retire alors les messages data-offer et montre les copies data-offer-off).
const horlogeApresOffre = () => {
  const D = Date;
  const ecart = D.parse('2027-01-02T12:00:00+01:00') - D.now();
  // eslint-disable-next-line no-global-assign
  Date = class extends D {
    constructor(...a) {
      super(...(a.length ? a : [D.now() + ecart]));
    }
    static now() {
      return D.now() + ecart;
    }
  };
};
const LANCEMENT = '/tarifs/';
const PARRAINAGE = '/faq/#parrainage-loyna';
const offreValable = () => {
  const fin = Date.parse(document.documentElement.dataset.offerUntil || '');
  return !!fin && Date.now() < fin;
};
for (const [etatPage, horloge] of [['tel quel', null], ['après la date', horlogeApresOffre]]) {
  for (const w of [375, 768, 1280, 1920, 2560]) {
    const page = await b.newPage();
    await page.setViewport({width: w, height: 800, isMobile: w < 600, hasTouch: w < 600});
    if (horloge) await page.evaluateOnNewDocument(horloge);
    await page.goto(base + '/', {waitUntil: 'networkidle0'});
    const valable = await page.evaluate(offreValable);
    const r = await page.evaluate(async () => {
      const m = document.querySelector('.marquee');
      const piste = m.querySelector('.mq-piste');
      const g = [...piste.querySelectorAll('.mq-groupe')];
      const anim = piste.getAnimations()[0];
      const debordement = document.documentElement.scrollWidth - window.innerWidth;
      const avant = m.getBoundingClientRect().height;
      await document.fonts.ready;
      const apres = m.getBoundingClientRect().height;
      // Raccord : position du 1er groupe au début et du 2e groupe à la toute fin de la boucle
      anim.pause();
      anim.currentTime = 0;
      const x0 = g[0].getBoundingClientRect().left;
      const duree = anim.effect.getComputedTiming().duration;
      anim.currentTime = duree - 0.001;
      const xFin = g[1].getBoundingClientRect().left;
      anim.currentTime = 0;
      anim.play();
      const lp = piste.getBoundingClientRect().width;
      return {
        messages: [...g[0].querySelectorAll('.mq-msg')].filter((e) => e.getClientRects().length).map((e) => e.getAttribute('href')),
        liens: [...m.querySelectorAll('.mq-lien')].map((e) => e.getAttribute('href')),
        memesGroupes: g[0].innerHTML === g[1].innerHTML,
        hauteur: apres,
        saut: Math.abs(xFin - x0),
        deuxFois: Math.abs(lp - 2 * g[0].getBoundingClientRect().width),
        groupeVsEcran: g[0].getBoundingClientRect().width - window.innerWidth,
        duree,
        vitesse: g[0].getBoundingClientRect().width / (duree / 1000),
        debordement,
        decalage: Math.abs(apres - avant),
      };
    });
    const messages = valable ? [LANCEMENT, PARRAINAGE, LANCEMENT, PARRAINAGE] : Array(5).fill(PARRAINAGE);
    const liens = valable ? [LANCEMENT, PARRAINAGE] : [PARRAINAGE];
    const okMessages = JSON.stringify(r.messages) === JSON.stringify(messages) && JSON.stringify(r.liens) === JSON.stringify(liens) && r.memesGroupes;
    const ok = okMessages && r.hauteur === 44 && r.saut < 0.6 && r.deuxFois < 0.5 && r.groupeVsEcran > 0 && r.debordement <= 0 && r.vitesse > 44 && r.vitesse < 52;
    if (!ok) echecs++;
    console.log(`bandeau ${etatPage} ${w} px : ${ok ? 'OK' : 'ÉCHEC'} ${okMessages ? `${r.messages.length} messages` : `messages ${JSON.stringify(r.messages)} liens ${JSON.stringify(r.liens)}`}, saut ${r.saut.toFixed(2)} px, piste-2×groupe ${r.deuxFois.toFixed(2)} px, groupe - écran ${Math.round(r.groupeVsEcran)} px, hauteur ${r.hauteur} px, ${Math.round(r.vitesse)} px/s, débordement page ${r.debordement} px`);
    await page.close();
  }
  // Animations limitées : chaque offre une seule fois, immobile, entière
  for (const w of [375, 1280]) {
    const page = await b.newPage();
    await page.setViewport({width: w, height: 800, isMobile: w < 600, hasTouch: w < 600});
    await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
    if (horloge) await page.evaluateOnNewDocument(horloge);
    await page.goto(base + '/', {waitUntil: 'networkidle0'});
    const valable = await page.evaluate(offreValable);
    const reduit = await page.evaluate(() => {
      const vus = [...document.querySelectorAll('.mq-msg')].filter((e) => e.getClientRects().length);
      return {
        anim: getComputedStyle(document.querySelector('.mq-piste')).animationName,
        messages: vus.map((e) => e.getAttribute('href')),
        coupes: vus.filter((e) => e.getBoundingClientRect().left < 0 || e.getBoundingClientRect().right > innerWidth || e.scrollWidth > e.clientWidth).length,
        hauteur: Math.round(document.querySelector('.marquee').getBoundingClientRect().height),
        debord: document.documentElement.scrollWidth - innerWidth,
      };
    });
    const attendus = valable ? [LANCEMENT, PARRAINAGE] : [PARRAINAGE];
    const ok = reduit.anim === 'none' && JSON.stringify(reduit.messages) === JSON.stringify(attendus) && reduit.coupes === 0 && reduit.debord <= 0;
    if (!ok) echecs++;
    console.log(`bandeau ${etatPage}, mouvement réduit ${w} px : ${ok ? 'OK' : 'ÉCHEC'} ${JSON.stringify(reduit)}`);
    await page.close();
  }
}
// Pause au survol et au focus
{
  const page = await b.newPage();
  await page.setViewport({width: 1280, height: 800});
  await page.goto(base + '/', {waitUntil: 'networkidle0'});
  const etat = () => page.evaluate(() => document.querySelector('.mq-piste').getAnimations()[0]?.playState);
  const au = await etat();
  const boite = await page.evaluate(() => {
    const r = document.querySelector('.marquee').getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
  await page.mouse.move(boite.x, boite.y);
  await new Promise((r) => setTimeout(r, 150));
  const survol = await etat();
  await page.mouse.move(5, 500);
  await new Promise((r) => setTimeout(r, 150));
  await page.evaluate(() => document.querySelector('.marquee .mq-lien').focus());
  await new Promise((r) => setTimeout(r, 150));
  const focus = await etat();
  await page.evaluate(() => document.querySelector('.marquee .mq-lien').blur());
  await new Promise((r) => setTimeout(r, 150));
  const ensuite = await etat();
  const ok = au === 'running' && survol === 'paused' && focus === 'paused' && ensuite === 'running';
  if (!ok) echecs++;
  console.log(`bandeau, pause : ${ok ? 'OK' : 'ÉCHEC'} (${au} → survol ${survol} → focus ${focus} → ${ensuite})`);
  await page.close();
}
// Clavier : un arrêt par offre, jamais sur la piste ; le lien s'affiche entier sur le bandeau et rien ne bouge dans la page
for (const w of [375, 1280]) {
  const page = await b.newPage();
  await page.setViewport({width: w, height: 800, isMobile: w < 600, hasTouch: w < 600});
  await page.goto(base + '/', {waitUntil: 'networkidle0'});
  const valable = await page.evaluate(offreValable);
  const mainAvant = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().top);
  const arrets = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const a = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e?.closest('.marquee')) return {hors: true, main: !!e?.closest('main')};
      const q = e.getBoundingClientRect();
      return {
        classe: e.className.split(' ')[0],
        href: e.getAttribute('href'),
        entier: q.left >= 0 && q.right <= innerWidth && e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight,
        dessus: document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) === e,
        hauteur: Math.round(q.height),
        main: document.querySelector('main').getBoundingClientRect().top,
        piste: document.querySelector('.mq-piste').getAnimations()[0]?.playState,
      };
    });
    if (a.hors && a.main) break;
    if (!a.hors) arrets.push(a);
  }
  const ok = arrets.length === (valable ? 2 : 1) && arrets.every((a) => a.classe === 'mq-lien' && a.entier && a.dessus && a.main === mainAvant && a.piste === 'paused');
  if (!ok) echecs++;
  console.log(`bandeau, clavier ${w} px : ${ok ? 'OK' : 'ÉCHEC'} ${arrets.map((a) => `${a.href} ${a.hauteur} px`).join(' ; ')}${ok ? '' : ' ' + JSON.stringify(arrets)}`);
  await page.close();
}
await b.close();
console.log(echecs ? `\n${echecs} point(s) à revoir` : '\nTout est conforme');
process.exit(echecs ? 1 : 0);
