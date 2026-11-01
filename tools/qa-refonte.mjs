// Captures pleine page de la refonte (ou de toute autre construction) : node tools/qa-refonte.mjs <base> <dossier> <largeurs> <chemins…>
// Exemple : node tools/qa-refonte.mjs http://127.0.0.1:4329 out/refonte 375,1280 / /tarifs/
// Rend compte des débordements horizontaux, des images non chargées et des erreurs de console.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const [base, dir, largeurs, ...chemins] = process.argv.slice(2);
fs.mkdirSync(dir, {recursive: true});
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu', '--hide-scrollbars']});
for (const width of largeurs.split(',').map(Number)) {
  const page = await browser.newPage();
  await page.setViewport({width, height: width < 600 ? 812 : 900, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600});
  const erreurs = [];
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(String(e)));
  // bandeau cookies : refusé d'avance pour ne pas masquer la page sur les captures
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('loyna-consent', JSON.stringify({ok: false, t: Date.now()}));
    } catch {}
    // défilés automatiques (cartes du haut de l'accueil, explorateur des fonctionnalités) figés pour des captures nettes
    const si = window.setInterval;
    window.setInterval = (f, t, ...a) => (t === 3400 || t === 4500 ? 0 : si(f, t, ...a));
  });
  for (const p of chemins) {
    await page.goto(base + p, {waitUntil: 'networkidle0', timeout: 90000});
    // apparitions au défilement : hors de l'écran, elles seraient encore invisibles sur une capture pleine page
    await page.addStyleTag({content: '.apparait{animation:none!important}'});
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
      await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); }))));
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 500));
    const nom = (p.replace(/[?=&%\/]/g, '_').replace(/^_+|_+$/g, '') || 'accueil') + '_' + width;
    await page.screenshot({path: `${dir}/${nom}.png`, fullPage: true});
    const info = await page.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      sw: document.documentElement.scrollWidth,
      iw: window.visualViewport ? Math.round(window.visualViewport.width) : window.innerWidth,
      broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.alt || i.src),
    }));
    console.log(nom, 'hauteur', info.h, info.sw > width ? `DÉBORDEMENT ${info.sw - width} px` : '', info.broken.length ? 'IMAGES NON CHARGÉES: ' + info.broken.join(' | ') : '');
  }
  if (erreurs.length) console.log('Erreurs console (' + width + ') :', erreurs.slice(0, 12));
  await page.close();
}
await browser.close();
