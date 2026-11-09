// Liens de l'espace client dans l'application : les ancres internes (#/clients…) restent dans l'application ; les pages de
// loyna.fr (guide, CGV, confidentialité, inscription d'un client…) s'ouvrent dans le navigateur intégré ; celles qui
// vendent ou gèrent l'abonnement (panier, offres, portail Stripe) ne s'ouvrent jamais (règle 3.1.1 d'Apple).
import {App} from '@capacitor/app';
import {appLinkTarget, MANAGED_OUTSIDE, native} from '../../src/app/native';
import {toast} from '../../src/app/state';

/** Pages de l'espace client que l'application affiche elle-même (même code que sur loyna.fr). */
const LOCAL = /^\/espace-client\/(mot-de-passe\/?|confirmer\/?)?$/;
const isLoyna = (u: URL) => u.hostname === 'loyna.fr' || u.hostname === 'www.loyna.fr';

function openLocal(u: URL) {
  if (u.pathname === '/espace-client/' && !u.search) {
    location.hash = u.hash || '#/';
    return;
  }
  location.href = `${u.pathname}${u.search}${u.hash}`;
}

export function installLinks() {
  const app = native();
  if (!app) return;
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const raw = a.getAttribute('href') ?? '';
      if (!raw || raw.startsWith('#') || /^(mailto|tel|sms):/i.test(raw) || a.hasAttribute('download') || /^(blob|data):/i.test(raw)) return;
      e.preventDefault();
      if (raw === '/') return; // logo « retour au site » : rien à faire dans l'application
      let u: URL;
      try {
        u = new URL(raw, 'https://loyna.fr');
      } catch {
        return;
      }
      if (isLoyna(u) && LOCAL.test(u.pathname)) return openLocal(u);
      const target = appLinkTarget(raw);
      if (!target) return void toast(MANAGED_OUTSIDE, 'info');
      app.openUrl(target).catch(() => {});
    },
    true,
  );
  // Liens universels (e-mails « Choisir mon mot de passe », « Confirmez votre adresse ») : la page s'ouvre dans l'application
  App.addListener('appUrlOpen', (ev) => {
    try {
      const u = new URL(ev.url);
      if (isLoyna(u) && LOCAL.test(u.pathname)) openLocal(u);
    } catch {
      /* adresse illisible */
    }
  });
}
