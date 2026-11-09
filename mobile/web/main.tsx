// Point d'entrée de l'application mobile Loyna : mêmes écrans que loyna.fr/espace-client/ (src/app/), avec le
// pont natif (bridge.ts), les liens (links.ts) et le verrou Face ID (gate.tsx). Page selon l'adresse locale, comme sur le
// site : /espace-client/mot-de-passe/ (lien « Choisir mon mot de passe »), /espace-client/confirmer/, sinon l'espace.
import '../../src/styles/global.css';
import '../../src/app/styles/base.css';
import '../../src/app/styles/business.css';
import './native.css';
import {render} from 'preact';
import {logoHtml} from '../../src/lib/logo-html';
import {installBridge} from './bridge';
import {installLinks} from './links';
import {Gate} from './gate';

async function start() {
  await installBridge().catch(() => false);
  installLinks();
  const root = document.getElementById('app')!;
  const path = location.pathname;
  const logo = logoHtml('lg-app', 30);
  if (/\/mot-de-passe\/?$/.test(path)) {
    const {default: Password} = await import('../../src/app/Password');
    render(<Password logo={logo} />, root);
  } else if (/\/confirmer\/?$/.test(path)) {
    const {default: Confirmer} = await import('../../src/app/Confirmer');
    render(<Confirmer logo={logo} />, root);
  } else {
    const {default: App} = await import('../../src/app/App');
    render(
      <Gate logo={logo}>
        <App logo={logo} />
      </Gate>,
      root,
    );
  }
}

start();
