// Audit Lighthouse (mobile) des pages locales : node tools/lh.mjs / /tarifs/ ...
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
const CH = 'C:/Users/vaiko/Documents/LOYNA-Motion/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const chrome = await chromeLauncher.launch({chromePath: CH, chromeFlags: ['--headless', '--disable-gpu']});
for (const p of process.argv.slice(2)) {
  const r = await lighthouse('http://127.0.0.1:4321' + p, {port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']});
  const c = r.lhr.categories;
  const a = r.lhr.audits;
  const s = (k) => Math.round(c[k].score * 100);
  console.log(p, 'perf', s('performance'), 'a11y', s('accessibility'), 'bp', s('best-practices'), 'seo', s('seo'),
    '| LCP', a['largest-contentful-paint'].displayValue, 'CLS', a['cumulative-layout-shift'].displayValue, 'TBT', a['total-blocking-time'].displayValue);
  const bad = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'manual');
  for (const b of bad) console.log('   -', b.id, b.displayValue || '', b.score);
}
await chrome.kill();
