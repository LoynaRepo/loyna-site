// Captures pleine page du site local pour contrôle visuel : node tools/qa.mjs 1440 / /tarifs/ ...
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const [w, ...paths] = process.argv.slice(2);
const width = Number(w);
fs.mkdirSync('out/qa', {recursive: true});
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
for (const p of paths) {
  await page.goto('http://127.0.0.1:4321' + p, {waitUntil: 'networkidle0'});
  // fait défiler pour déclencher les images en chargement différé
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 500));
  const name = (p.replace(/[?=\/]/g, '_').replace(/^_|_$/g, '') || 'accueil') + '_' + width;
  await page.screenshot({path: `out/qa/${name}.png`, fullPage: true});
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.alt || i.src));
  console.log(name, 'hauteur', h, overflow ? 'DÉBORDEMENT HORIZONTAL' : '', broken.length ? 'IMAGES NON CHARGÉES: ' + broken.join(' | ') : '');
}
if (errors.length) console.log('Erreurs console :', errors);
await browser.close();
