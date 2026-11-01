// Contrôle de la construction (dist/) par rapport à une construction de référence :
//   node tools/qa-routes.mjs <dossier de référence> <dossier dist> [base http]
// - aucune page ni fichier public perdu ; aucune route en plus sans raison ;
// - titre, description, canonique, robots, Open Graph et données structurées identiques, page par page ;
// - tous les liens internes (href, src) mènent à un fichier existant, ancres comprises ;
// - termes interdits dans le texte visible (SMS, « HT », tiret cadratin, promesses non prouvées, anciens montants hors CGV) ;
// - avec [base http] : code 200 pour chaque route.
import fs from 'node:fs';
import path from 'node:path';

const [refDir, neufDir, base] = process.argv.slice(2);
const liste = (d) => fs.readdirSync(d, {withFileTypes: true, recursive: true}).filter((e) => e.isFile()).map((e) => path.relative(d, path.join(e.parentPath, e.name)).replaceAll('\\', '/'));
const estHtml = (f) => f.endsWith('.html');
const ref = new Set(liste(refDir).filter((f) => !f.startsWith('_astro/')));
const neuf = new Set(liste(neufDir).filter((f) => !f.startsWith('_astro/')));
const manquants = [...ref].filter((f) => !neuf.has(f));
const ajouts = [...neuf].filter((f) => !ref.has(f));
console.log(`Fichiers hors _astro : référence ${ref.size}, refonte ${neuf.size}`);
console.log(manquants.length ? `MANQUANTS : ${manquants.join(', ')}` : 'Aucun fichier manquant');
console.log(ajouts.length ? `En plus : ${ajouts.join(', ')}` : 'Aucun fichier en plus');
let echecs = manquants.length;

const pages = [...neuf].filter(estHtml);
const lire = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const seo = (html) => ({
  title: /<title>(.*?)<\/title>/s.exec(html)?.[1],
  meta: [...html.matchAll(/<meta\s[^>]*(?:name|property)="(description|robots|og:[^"]+|twitter:[^"]+|google-site-verification|msvalidate\.01)"[^>]*>/g)].map((m) => m[0]).sort(),
  canonical: /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1],
  jsonld: [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]),
  h1: [...html.matchAll(/<h1[\s>]/g)].length,
});
let seoDiff = 0;
for (const f of pages.filter((p) => ref.has(p))) {
  const a = seo(lire(refDir, f));
  const b = seo(lire(neufDir, f));
  for (const k of ['title', 'canonical']) {
    if (a[k] !== b[k]) {
      seoDiff++;
      console.log(`SEO ${f} ${k} : « ${a[k]} » → « ${b[k]} »`);
    }
  }
  if (JSON.stringify(a.meta) !== JSON.stringify(b.meta)) {
    seoDiff++;
    console.log(`SEO ${f} meta différentes`);
  }
  if (JSON.stringify(a.jsonld) !== JSON.stringify(b.jsonld)) {
    seoDiff++;
    console.log(`SEO ${f} données structurées différentes`);
  }
  if (b.h1 !== a.h1) {
    seoDiff++;
    console.log(`SEO ${f} : ${a.h1} h1 → ${b.h1} h1`);
  }
}
console.log(seoDiff ? `${seoDiff} différence(s) de référencement` : `Référencement identique sur ${pages.filter((p) => ref.has(p)).length} pages (titre, description, canonique, robots, Open Graph, données structurées, nombre de h1)`);
echecs += seoDiff;

// Liens internes
let liens = 0;
const casses = new Map();
const aAncre = (f, id) => new RegExp(`\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(lire(neufDir, f));
const cible = (u) => {
  const p = u.split('#')[0].split('?')[0];
  const candidats = [p.replace(/^\//, ''), p.replace(/^\//, '').replace(/\/?$/, '/index.html'), p.replace(/^\//, '') + '.html'];
  return candidats.find((c) => c && fs.existsSync(path.join(neufDir, c)) && fs.statSync(path.join(neufDir, c)).isFile());
};
for (const f of pages) {
  const html = lire(neufDir, f);
  for (const m of html.matchAll(/\s(?:href|src|srcset)="([^"]+)"/g)) {
    for (const brut of m[1].split(',').map((x) => x.trim().split(/\s+/)[0])) {
      // /sitemap.xml est servi par une réécriture de .htaccess ; #/… sont les écrans de l'espace client
      if (brut === '/sitemap.xml' || brut.includes('#/')) continue;
      if (!brut.startsWith('/') || brut.startsWith('//')) {
        // ancres internes à la page
        if (brut.startsWith('#') && brut.length > 1) {
          liens++;
          if (!aAncre(f, brut.slice(1))) casses.set(`${f} → ${brut}`, 1);
        }
        continue;
      }
      liens++;
      const t = cible(brut);
      if (!t) casses.set(`${f} → ${brut}`, 1);
      else if (brut.includes('#') && t.endsWith('.html') && !aAncre(t, brut.split('#')[1])) casses.set(`${f} → ${brut} (ancre)`, 1);
    }
  }
}
console.log(`${liens} liens et ressources internes vérifiés, ${casses.size} cassé(s)`);
for (const k of [...casses.keys()].slice(0, 30)) console.log('  ', k);
echecs += casses.size;

// Termes à proscrire dans le texte visible (hors scripts, styles, données structurées)
const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
const INTERDITS = [
  [/\bSMS\b/, 'SMS'],
  [/\d\s*€\s*HT\b|\bHT\b(?=[ .,;)]|$)/, 'HT'],
  [/—/, 'tiret cadratin'],
  [/\bN°\s?1 des\b|\bnuméro un\b/i, 'N°1'],
  [/14 jours (offerts|gratuits)/i, 'essai de 14 jours'],
  [/\bleno\b/i, 'Leno'],
  [/iOS\s?27|posterGeneric/i, 'iOS 27'],
  // Grille Starter + Pro : la seule exception est la phrase Premium des CGV (article 4.1)
  [/\bPremium\b|39,99|407,90|295,80|907,80|\b89\s*€|2\s000 cartes|\b4,99\s*€|50,90|en annuel|paiement annuel/, 'ancien montant ou ancienne offre', /^cgv\//],
];
const trouves = {};
for (const f of pages) {
  const t = visible(lire(neufDir, f));
  for (const [re, nom, sauf] of INTERDITS) {
    if (sauf?.test(f)) continue;
    const m = re.exec(t);
    if (m) (trouves[nom] ||= []).push(`${f} : …${t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}…`);
  }
}
for (const [nom, l] of Object.entries(trouves)) {
  console.log(`« ${nom} » trouvé sur ${l.length} page(s) :`);
  for (const x of l.slice(0, 6)) console.log('   ', x);
}
if (!Object.keys(trouves).length) console.log('Aucun terme proscrit dans le texte visible');

if (base) {
  let ko = 0;
  const routes = pages.filter((p) => p !== '404.html').map((p) => '/' + p.replace(/index\.html$/, '').replace(/\.html$/, ''));
  routes.push('/sitemap-index.xml', '/sitemap-0.xml', '/rss.xml', '/robots.txt', '/llms.txt', '/site.webmanifest', '/contact.php', '/video/loyna-presentation-720p.mp4');
  for (const r of routes) {
    const res = await fetch(base + r, {redirect: 'manual'});
    await res.arrayBuffer();
    if (res.status !== 200) {
      ko++;
      console.log(`  ${res.status} ${r}`);
    }
  }
  console.log(`${routes.length} routes demandées à ${base} : ${routes.length - ko} en 200, ${ko} en erreur`);
  echecs += ko;
}
console.log(echecs ? `\n${echecs} point(s) à revoir` : '\nTout est conforme');
