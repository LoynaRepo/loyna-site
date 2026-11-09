// Construction de l'application mobile : l'espace client de loyna.fr (../src/app/) compilé dans dist/, que Capacitor copie
// dans l'application iPhone (npx cap sync ios). Le site, lui, se construit toujours avec Astro (npm run build à la racine) :
// rien ici ne change sa sortie.
import {defineConfig, type Plugin} from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '..');
const slash = (p: string) => p.split(path.sep).join('/');

/**
 * Écrans du site qui n'entrent pas dans l'application, remplacés à la construction :
 *  - Opérateur (réservé à LOYNA) : module vide ;
 *  - Abonnement complet (offres, panier, portail Stripe) : la version en lecture seule (AbonnementApp), règle 3.1.1 d'Apple.
 */
const REMPLACES: Record<string, string> = {
  Operateur: 'operateur-absent.tsx',
  Abonnement: 'abonnement-lecture.tsx',
};
function ecransRemplaces(): Plugin {
  return {
    name: 'loyna-ecrans-remplaces',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const nom = /views\/(Operateur|Abonnement)$/.exec(source)?.[1];
      if (!nom || !importer) return null;
      const r = await this.resolve(source, importer, {...options, skipSelf: true});
      const cible = slash(path.join(racine, 'src', 'app', 'views', `${nom}.tsx`));
      return r && slash(r.id) === cible ? slash(path.join(ici, 'web', REMPLACES[nom])) : null;
    },
  };
}

export default defineConfig({
  root: path.join(ici, 'web'),
  base: './',
  publicDir: false,
  envPrefix: ['PUBLIC_', 'VITE_'],
  plugins: [ecransRemplaces(), preact()],
  resolve: {
    // un seul exemplaire de Preact et de Supabase : ceux du site (../node_modules)
    dedupe: ['preact', '@preact/signals', '@supabase/supabase-js'],
  },
  server: {fs: {allow: [racine]}},
  build: {
    outDir: path.join(ici, 'dist'),
    emptyOutDir: true,
    target: 'es2020', // Safari 14 et plus (iOS 15.5 minimum pour ML Kit)
    sourcemap: false,
    assetsInlineLimit: 0,
  },
});
