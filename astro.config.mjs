import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {datesDesPages} from './tools/lastmod.mjs';

// Typographie française dans le HTML final : espace insécable avant « : ; ? ! » et à l'intérieur
// des guillemets, pour qu'un signe ne se retrouve jamais seul en début de ligne. Seul le texte
// visible est modifié (balises, attributs, scripts et styles restent intacts). Les liens internes
// reçoivent aussi leur « / » final (adresses canoniques, trailingSlash: 'always').
function typoFr() {
  const walk = (d) => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const fix = (t) => t.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ');
  return {
    name: 'typo-fr',
    hooks: {
      'astro:build:done': ({dir}) => {
        for (const f of walk(fileURLToPath(dir)).filter((f) => f.endsWith('.html'))) {
          const html = fs.readFileSync(f, 'utf8');
          const out = html
            .replace(/(<(script|style|textarea|pre|code)\b[\s\S]*?<\/\2>)|(<[^>]*>)|([^<]+)/g, (m, block, _t, tag, text) => (text ? fix(text) : m))
            // liens internes sans « / » final (contenus Builder) : adresse canonique directe, sans redirection 301
            .replace(/href="(\/[a-z0-9\/_-]*[a-z0-9_-])([?#][^"]*)?"/g, (m, p, rest = '') => `href="${p}/${rest}"`);
          if (out !== html) fs.writeFileSync(f, out);
        }
      },
    },
  };
}

// Espace commercial : le fichier chiffré de développement (public/espace-commercial/donnees.enc, écrit par
// « panel.py publier --local » du coffre) ne part jamais avec le site. Seul panel.py publie celui de production.
function sansDonneesCommerciales() {
  return {
    name: 'sans-donnees-commerciales',
    hooks: {
      'astro:build:done': ({dir}) => {
        const f = path.join(fileURLToPath(dir), 'espace-commercial', 'donnees.enc');
        if (fs.existsSync(f)) fs.rmSync(f);
      },
    },
  };
}

// Pages exclues du plan du site (sans intérêt pour les moteurs de recherche, ou privées). /espace-client/ reste
// indexable (recherches « loyna connexion ») mais n'a presque pas de texte : hors du plan du site.
const NOINDEX = ['/merci/', '/contact/envoye/', '/devenir-partenaire/envoye/', '/builder-preview/', '/404/', '/espace-client/', '/espace-client/mot-de-passe/', '/espace-client/confirmer/', '/espace-client/demo/', '/espace-client/guide/', '/panier/', '/essai/', '/join/', '/preferences/', '/espace-commercial/', '/visuel-carte/'];

// Date réelle de modification de chaque page (commits git, dates des articles) : voir tools/lastmod.mjs
const lastmod = datesDesPages(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  site: 'https://loyna.fr',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always', // CSS intégré : aucune requête bloquante
  },
  prefetch: {prefetchAll: false, defaultStrategy: 'hover'},
  integrations: [
    // LOYNA Business (espace client) et pages publiques des cartes : composants Preact
    preact(),
    typoFr(),
    sansDonneesCommerciales(),
    sitemap({
      filter: (page) => !NOINDEX.some((p) => page.endsWith(p)),
      // Pas de changefreq (ignoré par Google) ni de date du build : la vraie date de chaque page, sinon aucune
      serialize: (item) => {
        const date = lastmod(item.url);
        return date ? {...item, lastmod: date} : item;
      },
      i18n: undefined,
    }),
  ],
  image: {
    // Builder.io sert les images de ses contenus depuis son CDN
    domains: ['cdn.builder.io'],
  },
  vite: {
    server: {
      // Essais locaux du panel commercial : le serveur de développement n'exécute pas PHP ; les requêtes des notes
      // vont au serveur local qui reproduit notes.php (python tools/commercial/notes_local.py, port 4330).
      proxy: {
        '/espace-commercial/notes.php': {target: 'http://127.0.0.1:4330', changeOrigin: false},
        '/espace-commercial/cartes.php': {target: 'http://127.0.0.1:4330', changeOrigin: false},
      },
    },
  },
});
