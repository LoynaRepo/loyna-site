// Date réelle de modification de chaque page, pour le plan du site (balise <lastmod> de sitemap.xml).
// Google n'utilise lastmod que s'il est exact : chaque page reçoit la date de SON contenu, jamais la date du build.
//   - article : sa date de mise à jour (champ miseAJour), sinon sa date de publication ;
//   - page métier : le dernier commit qui a modifié SA fiche dans sectors.json, ou le modèle de la page ;
//   - listes (/blog/, /secteurs/, plan du site) : la plus récente de leurs pages ou de leur modèle ;
//   - autres pages : le dernier commit du fichier source (page .astro, texte légal, FAQ) ;
//   - fichier modifié mais pas encore validé : date du jour (il part avec cette mise en ligne) ;
//   - page sans source dans le dépôt (contenu ajouté depuis Builder.io) ou git absent : pas de lastmod, plutôt
//     qu'une date fausse.
// Limite connue : une modification faite seulement dans Builder.io n'a pas de date ici (Builder l'emporte sur le
// fichier de secours au build) ; recopier le texte relu dans src/content-seed/ pour dater la page.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SECTEURS = 'src/content-seed/sectors.json';
const ARTICLES = 'src/content-seed/articles';
const LEGAL = ['mentions-legales', 'cgv', 'cgu', 'confidentialite', 'cookies'];

/** La date la plus récente (chaînes ISO), ou null. */
function plusRecente(dates) {
  const valides = dates.filter((d) => d && !Number.isNaN(Date.parse(d)));
  return valides.length ? valides.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
}

/** Renvoie une fonction url → date ISO (ou null). Les dates sont calculées une seule fois, au premier appel. */
export function datesDesPages(root) {
  let calcul = null;
  return (url) => {
    calcul ??= calculer(root);
    return calcul(url);
  };
}

function calculer(root) {
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
  const maintenant = new Date().toISOString();

  // Dernière modification d'un fichier : date du jour s'il a des changements non validés, sinon son dernier commit
  const fichiers = new Map();
  const dateFichier = (rel) => {
    if (!fichiers.has(rel)) {
      let d = null;
      try {
        if (fs.existsSync(path.join(root, rel))) d = git('status', '--porcelain', '--', rel).trim() ? maintenant : git('log', '-1', '--format=%cI', '--', rel).trim() || null;
      } catch {
        d = null;
      }
      fichiers.set(rel, d);
    }
    return fichiers.get(rel);
  };

  // Articles : date du fichier de secours (miseAJour si elle est postérieure à la publication)
  const articles = new Map();
  try {
    for (const f of fs.readdirSync(path.join(root, ARTICLES)).filter((f) => f.endsWith('.json'))) {
      const a = JSON.parse(fs.readFileSync(path.join(root, ARTICLES, f), 'utf8'));
      if (a.slug && a.date) articles.set(a.slug, a.miseAJour && a.miseAJour > a.date ? a.miseAJour : a.date);
    }
  } catch {
    /* dossier illisible : pas de date pour les articles */
  }

  // Métiers : pour chaque fiche de sectors.json, le commit le plus récent qui l'a modifiée (contenu comparé, pas la
  // mise en forme), du fichier actuel vers les versions plus anciennes.
  const secteurs = new Map();
  try {
    const fiches = (texte) => {
      try {
        return new Map(JSON.parse(texte).map((s) => [s.slug, JSON.stringify(s)]));
      } catch {
        return new Map();
      }
    };
    const actuel = fiches(fs.readFileSync(path.join(root, SECTEURS), 'utf8'));
    const versions = [[git('status', '--porcelain', '--', SECTEURS).trim() ? maintenant : null, actuel]];
    for (const ligne of git('log', '--format=%H %cI', '--', SECTEURS).split('\n').filter(Boolean)) {
      const [hash, date] = ligne.split(' ');
      let texte = '';
      try {
        texte = git('show', `${hash}:${SECTEURS}`);
      } catch {
        /* fichier absent à ce commit */
      }
      versions.push([date, fiches(texte)]);
    }
    for (const slug of actuel.keys()) {
      for (let i = 0; i < versions.length; i++) {
        if (versions[i][1].get(slug) !== versions[i + 1]?.[1].get(slug)) {
          // versions[0] = fichier actuel : identique au dernier commit sauf changement non validé (date du jour)
          secteurs.set(slug, versions[i][0] ?? versions[i + 1]?.[0] ?? null);
          break;
        }
      }
    }
  } catch {
    /* git absent : pas de date pour les métiers */
  }

  const page = (rel) => dateFichier(`src/pages/${rel}`);
  return (url) => {
    const p = new URL(url).pathname;
    let m;
    if ((m = p.match(/^\/blog\/([^/]+)\/$/))) return articles.get(m[1]) ?? null;
    if (p === '/blog/') return plusRecente([page('blog/index.astro'), ...articles.values()]);
    if ((m = p.match(/^\/secteurs\/([^/]+)\/$/))) return secteurs.has(m[1]) ? plusRecente([secteurs.get(m[1]), page('secteurs/[slug].astro')]) : null;
    if (p === '/secteurs/') return plusRecente([page('secteurs/index.astro'), ...secteurs.values()]);
    if (p === '/plan-du-site/') return plusRecente([page('plan-du-site.astro'), ...secteurs.values(), ...articles.values()]);
    if (p === '/faq/') return plusRecente([page('faq.astro'), dateFichier('src/content-seed/faq.json')]);
    if ((m = p.match(/^\/([^/]+)\/$/)) && LEGAL.includes(m[1])) return plusRecente([dateFichier(`src/content-seed/legal/${m[1]}.html`), page('[legal].astro')]);
    if (p === '/') return page('index.astro');
    // Page simple : src/pages/<chemin>.astro ou src/pages/<chemin>/index.astro
    return page(`${p.slice(1, -1)}.astro`) ?? page(`${p.slice(1)}index.astro`);
  };
}
