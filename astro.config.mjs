import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Typographie française dans le HTML final : espace insécable avant « : ; ? ! » et à l'intérieur
// des guillemets, pour qu'un signe ne se retrouve jamais seul en début de ligne. Seul le texte
// visible est modifié (balises, attributs, scripts et styles restent intacts).
function typoFr() {
  const walk = (d) => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const fix = (t) => t.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ');
  return {
    name: 'typo-fr',
    hooks: {
      'astro:build:done': ({dir}) => {
        for (const f of walk(fileURLToPath(dir)).filter((f) => f.endsWith('.html'))) {
          const html = fs.readFileSync(f, 'utf8');
          const out = html.replace(/(<(script|style|textarea|pre|code)\b[\s\S]*?<\/\2>)|(<[^>]*>)|([^<]+)/g, (m, block, _t, tag, text) => (text ? fix(text) : m));
          if (out !== html) fs.writeFileSync(f, out);
        }
      },
    },
  };
}

// Pages exclues du plan du site (sans intérêt pour les moteurs de recherche)
const NOINDEX = ['/merci/', '/contact/envoye/', '/builder-preview/', '/404/'];

export default defineConfig({
  site: 'https://loyna.fr',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always', // CSS intégré : aucune requête bloquante
  },
  prefetch: {prefetchAll: false, defaultStrategy: 'hover'},
  integrations: [
    typoFr(),
    sitemap({
      filter: (page) => !NOINDEX.some((p) => page.endsWith(p)),
      changefreq: 'weekly',
      lastmod: new Date(),
      i18n: undefined,
    }),
  ],
  image: {
    // Builder.io sert les images de ses contenus depuis son CDN
    domains: ['cdn.builder.io'],
  },
});
