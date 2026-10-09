// Contrôle visuel de LOYNA Business en démonstration locale (npm run dev puis ?demo) :
// node tools/qa-app.mjs 1366 accueil scanner clients …   (captures dans out/qa-app/)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4322';
const [w, ...views] = process.argv.slice(2);
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

for (const v of views) {
  if (v.startsWith('/')) {
    // page publique ou écran complet (adresse directe)
    await page.goto(BASE + v, {waitUntil: 'networkidle0'});
  } else {
    await page.goto(`${BASE}/espace-client/?demo#/${v === 'login' ? '' : v}`, {waitUntil: 'networkidle0'});
    if (v === 'login') {
      await page.evaluate(() => sessionStorage.removeItem('demo-session'));
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
