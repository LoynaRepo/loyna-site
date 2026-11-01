// Parcours cliqués en démonstration locale : node tools/qa-flow.mjs (captures dans out/qa-app/)
import puppeteer from 'puppeteer-core';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const B = 'http://127.0.0.1:4322/espace-client/?demo';
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width: 1366, height: 860});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (sel, text) => {
  const ok = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t));
    el?.click();
    return !!el;
  }, sel, text);
  if (!ok) console.log('introuvable :', text);
  await wait(900);
};
const type = async (sel, v) => {
  await page.focus(sel);
  await page.keyboard.type(v);
};
// la démonstration s'ouvre déjà connectée ; formulaire seulement sur une ancienne version
await page.goto(B, {waitUntil: 'networkidle0'});
if (await page.$('input[type=email]')) {
  await type('input[type=email]', 'camille@exemple.test');
  await type('input[type=password]', 'demo-local');
  await clickText('button', 'Se connecter');
  await wait(1500);
}
console.log('après connexion :', await page.evaluate(() => document.querySelector('h1')?.textContent));

// 1. ajuster un solde
await page.goto(B + '#/client/cu3', {waitUntil: 'networkidle0'});
await wait(1200);
await clickText('button', 'Ajuster le solde');
await page.screenshot({path: 'out/qa-app/flow_ajuster.png'});
await page.evaluate(() => {
  const i = [...document.querySelectorAll('dialog input[type=text]')][0];
  i.focus();
});
await page.keyboard.type('Passage oublié');
await clickText('dialog button', 'Enregistrer');
await wait(1200);
console.log('solde après +1 :', await page.evaluate(() => document.querySelector('.cd-balance b')?.textContent));

// 2. aperçu d'une campagne
await page.goto(B + '#/campagne/c2', {waitUntil: 'networkidle0'});
await wait(1200);
await clickText('button', 'Vérifier les destinataires');
await wait(800);
await page.screenshot({path: 'out/qa-app/flow_campagne.png', fullPage: true});

// 3. invitation d'un employé
await page.goto(B + '#/equipe', {waitUntil: 'networkidle0'});
await wait(1000);
await clickText('button', 'Inviter un membre');
await page.evaluate(() => document.querySelector('dialog input[type=text]')?.focus());
await page.keyboard.type('Nina');
await page.evaluate(() => document.querySelector('dialog input[type=email]')?.focus());
await page.keyboard.type('nina@exemple.test');
await clickText('dialog button', 'Créer le lien');
await wait(1000);
await page.screenshot({path: 'out/qa-app/flow_invitation.png'});

// 4. scan avec récompense à utiliser puis scan au montant
await page.goto(B + '#/scanner', {waitUntil: 'networkidle0'});
await wait(1000);
await page.evaluate(() => window.__demoScan('loyna:v1:montant-aaaaaaaaaaaaaaaaaaaa'));
await wait(1000);
await page.screenshot({path: 'out/qa-app/flow_montant.png'});
await page.evaluate(() => window.__demoScan('loyna:v1:delai-bbbbbbbbbbbbbbbbbbbbbbbb'));
await wait(300);
await clickText('button', 'Client suivant');
await page.evaluate(() => window.__demoScan('loyna:v1:delai-bbbbbbbbbbbbbbbbbbbbbbbb'));
await wait(1000);
await page.screenshot({path: 'out/qa-app/flow_delai.png'});
console.log(errors.length ? 'Erreurs :\n' + errors.join('\n') : 'aucune erreur console');
await browser.close();
