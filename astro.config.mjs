import {defineConfig} from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
