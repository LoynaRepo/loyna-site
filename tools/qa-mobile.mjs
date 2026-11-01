// Audit mobile des pages (aperçu de production sur 127.0.0.1:4321) :
// node tools/qa-mobile.mjs 360 / /tarifs/ …  → débordements, cibles tactiles trop petites, textes minuscules,
// champs < 16 px (zoom automatique sur iPhone), captures dans out/qa-mobile/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4321';
const [w, ...paths] = process.argv.slice(2);
const width = Number(w);
fs.mkdirSync('out/qa-mobile', {recursive: true});
const browser = await puppeteer.launch({executablePath: CH, headless: 'shell', args: ['--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const p of paths) {
  await page.goto(BASE + p, {waitUntil: 'networkidle0'});
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 400));
  const report = await page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[hidden],[aria-hidden="true"],.sr-only,.visually-hidden,.skip-link,.mq-lien');
    };
    const label = (el) => {
      const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} « ${t} »`;
    };
    // éléments qui dépassent à droite (hors conteneurs à défilement horizontal)
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && !el.closest('[style*="overflow"], .chips, .seg, .f-tabs, .tbl-wrap, .anchors, .scroller')) {
        let scrollParent = el.parentElement;
        let clipped = false;
        while (scrollParent && scrollParent !== document.body) {
          const o = getComputedStyle(scrollParent).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
            clipped = true;
            break;
          }
          scrollParent = scrollParent.parentElement;
        }
        if (!clipped) wide.push(`${label(el)} → ${Math.round(r.right - vw)} px`);
      }
    }
    // cibles tactiles < 40 px (liens dans le texte exclus)
    const small = [];
    for (const el of document.querySelectorAll('a, button, input:not([type=hidden]), select, textarea, summary, [role=button], label.sw, .sw')) {
      if (!visible(el)) continue;
      if (el.tagName === 'A' && el.closest('p, li') && !el.closest('nav, footer') && getComputedStyle(el).display === 'inline') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) small.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // champs < 16 px : Safari iOS zoome automatiquement
    const zoom = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=hidden]), select, textarea')]
      .filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${label(el)} ${getComputedStyle(el).fontSize}`);
    // textes < 12 px
    const tiny = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || !el.childNodes.length) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
      if (own && parseFloat(getComputedStyle(el).fontSize) < 12) tiny.add(`${label(el)} ${getComputedStyle(el).fontSize}`);
    }
    return {overflow: document.documentElement.scrollWidth - vw, height: document.documentElement.scrollHeight, wide: wide.slice(0, 12), small: small.slice(0, 25), smallCount: small.length, zoom, tiny: [...tiny].slice(0, 15)};
  });
  const name = (p.replace(/[?=\/]/g, '_').replace(/^_|_$/g, '') || 'accueil') + '_' + width;
  await page.screenshot({path: `out/qa-mobile/${name}.png`, fullPage: true});
  console.log(`\n## ${p} (${width} px) hauteur ${report.height}${report.overflow > 0 ? ` — DÉBORDEMENT ${report.overflow} px` : ''}`);
  if (report.wide.length) console.log('  dépassent :\n    ' + report.wide.join('\n    '));
  if (report.smallCount) console.log(`  cibles < 40 px (${report.smallCount}) :\n    ` + report.small.join('\n    '));
  if (report.zoom.length) console.log('  champs < 16 px (zoom iPhone) :\n    ' + report.zoom.join('\n    '));
  if (report.tiny.length) console.log('  textes < 12 px :\n    ' + report.tiny.join('\n    '));
}
if (errors.length) console.log('\nErreurs :\n' + errors.join('\n'));
await browser.close();
