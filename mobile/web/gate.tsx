// Verrou Face ID / Touch ID de l'application (option de « Mon compte ») : à l'ouverture et au retour après LOCK_AFTER_MS en
// arrière-plan, si une session est enregistrée. La session elle-même reste dans le trousseau ; « Se déconnecter » l'efface.
import type {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {App} from '@capacitor/app';
import {appPref, native, PREF_BIOMETRY} from '../../src/app/native';
import {LOCK_AFTER_MS} from './config';

const AUTH_KEY = 'loyna-business-auth';

async function mustLock(): Promise<boolean> {
  const app = native();
  if (!app || !appPref(PREF_BIOMETRY)) return false;
  return !!(await app.authStorage.getItem(AUTH_KEY).catch(() => null));
}

export function Gate({logo, children}: {logo: string; children: ComponentChildren}) {
  const [locked, setLocked] = useState<boolean | null>(native() ? null : false);
  const [label, setLabel] = useState('Face ID');
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    const app = native();
    if (!app || busy) return;
    setBusy(true);
    const ok = await app.biometry.verify('Déverrouiller Loyna');
    setBusy(false);
    if (ok) setLocked(false);
  };

  useEffect(() => {
    const app = native();
    if (!app) return;
    app.biometry.status().then((s) => setLabel(s.label));
    mustLock().then((v) => {
      setLocked(v);
      if (v) unlock();
    });
    let hiddenAt = 0;
    const subs = [
      App.addListener('pause', () => {
        hiddenAt = Date.now();
      }),
      App.addListener('resume', async () => {
        if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && (await mustLock())) {
          setLocked(true);
          unlock();
        }
      }),
    ];
    return () => subs.forEach((p) => p.then((h) => h.remove()));
  }, []);

  const signOut = async () => {
    await native()?.authStorage.removeItem(AUTH_KEY).catch(() => {});
    location.hash = '';
    location.reload();
  };

  if (locked === null) return <div class="splash" />;
  return (
    <>
      {/* l'espace reste monté sous le verrou, invisible */}
      <div aria-hidden={locked || undefined} style={locked ? {visibility: 'hidden'} : undefined}>
        {children}
      </div>
      {locked && (
        <div class="app-lock" role="dialog" aria-label="Loyna verrouillé">
          <span class="app-lock-logo" dangerouslySetInnerHTML={{__html: logo}} />
          <p>Loyna est verrouillé.</p>
          <button type="button" class="b b--gold" onClick={unlock} disabled={busy}>
            <span>Déverrouiller avec {label}</span>
          </button>
          <button type="button" class="b b--quiet" onClick={signOut}>
            <span>Se déconnecter</span>
          </button>
        </div>
      )}
    </>
  );
}
